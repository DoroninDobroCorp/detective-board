import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { buildNodeMap, summarizeTask, type TaskPathInfo, isTaskNode } from '../taskUtils';
import type { TaskNode } from '../types';
import {
  useGamificationStore,
  type Difficulty,
  type LevelUpEvent,
} from '../gamification';
import { extractAssistantText } from '../assistant/api';
import { callAssistantApi } from '../assistant/apiClient';
import { db } from '../db';

interface QueueItem {
  task: TaskPathInfo;
  completedAt: number;
  source: 'task' | 'manual';
  manualId?: string;
}

const difficultyPresets: Array<{ key: Difficulty; label: string; xp: number }> = [
  { key: 'easy', label: 'Лёгкая (100)', xp: 100 },
  { key: 'medium', label: 'Средняя (300)', xp: 300 },
  { key: 'hard', label: 'Сложная (700)', xp: 700 },
];

function clampXp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function formatPath(info: TaskPathInfo): string {
  return info.parentPath.length ? info.parentPath.join(' → ') : 'Без проекта';
}

async function requestLevelTitleSuggestions(event: LevelUpEvent): Promise<string[]> {
  const completions = event.completions.slice(-6);
  const summary = completions
    .map((c, idx) => `${idx + 1}. ${c.title}${c.parentPath.length ? ` (${c.parentPath.join(' → ')})` : ''}`)
    .join('\n');
  const instructions = 'Ты — креативный помощник по неймингу уровней развития. Давай короткие, вдохновляющие названия на русском.';
  const message = [
    `Уровень: ${event.level}.`,
    'Недавние выполненные задачи:',
    summary || 'нет контекста',
    'Предложи 3 коротких варианта названия уровня (до 3 слов каждый).',
    'Не используй общий текст, только список вариантов.',
  ].join('\n');
  try {
    const payload = await callAssistantApi({ message, instructions, context: '' });
    const { text } = extractAssistantText(payload);
    const parsed = parseSuggestions(text);
    if (parsed.length) return parsed;
  } catch (e) {
    console.warn('level-title-suggest:failed', e);
  }
  return fallbackSuggestions(event);
}

function parseSuggestions(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const cleaned = lines
    .map((line) => line.replace(/^[0-9]+[).:\-\s]+/, '').replace(/^[-•–]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 60);
  const unique: string[] = [];
  for (const line of cleaned) {
    if (!unique.includes(line)) unique.push(line);
    if (unique.length >= 5) break;
  }
  return unique;
}

function fallbackSuggestions(event: LevelUpEvent): string[] {
  const keywords = new Set<string>();
  event.completions.slice(-6).forEach((c) => {
    c.parentPath.forEach((part) => {
      const token = part.split(/\s+/)[0];
      if (token && token.length > 2) keywords.add(token);
    });
    c.title.split(/\s+/).forEach((part) => {
      if (part.length > 3) keywords.add(part);
    });
  });
  const base = Array.from(keywords).slice(0, 2).join(' ');
  const core = base || 'Прогресс';
  return [
    `${core} мастер`,
    `Навигатор ${core.toLowerCase()}`,
    `Герой ${event.level}-го уровня`,
  ].map((s) => s.replace(/\s+/g, ' ').trim());
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  zIndex: 2100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  width: 480,
  background: '#0f1418',
  color: '#f5f5f5',
  borderRadius: 14,
  border: '1px solid #22303a',
  boxShadow: '0 18px 64px rgba(0,0,0,0.6)',
  padding: 20,
};

const GamificationManager: React.FC = () => {
  const nodes = useAppStore((s) => s.nodes);
  const updateNode = useAppStore((s) => s.updateNode);
  const processedTasks = useGamificationStore((s) => s.processedTasks);
  const registerTaskCompletion = useGamificationStore((s) => s.registerTaskCompletion);
  const ignoreTaskCompletion = useGamificationStore((s) => s.ignoreTaskCompletion);
  const pendingLevelUps = useGamificationStore((s) => s.pendingLevelUps);
  const assignLevelTitle = useGamificationStore((s) => s.assignLevelTitle);
  const clearLevelUpEvent = useGamificationStore((s) => s.clearLevelUpEvent);
  const levelTitles = useGamificationStore((s) => s.levelTitles);
  const manualCandidates = useGamificationStore((s) => s.pendingManualCandidates);
  const removeManualCompletion = useGamificationStore((s) => s.removeManualCompletion);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [xpValue, setXpValue] = useState(300);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [note, setNote] = useState('');
  const [levelModal, setLevelModal] = useState<LevelUpEvent | null>(null);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [completionTime, setCompletionTime] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    const map = buildNodeMap(nodes);
    const manualIds = new Set(manualCandidates.map((c) => c.id));

    setQueue((prev) => {
      const filteredPrev = prev.filter((item) => {
        if (item.source === 'manual') {
          return item.manualId ? manualIds.has(item.manualId) : false;
        }
        const node = map.get(item.task.id);
        if (!node || !isTaskNode(node)) return false;
        if (node.status !== 'done') return false;
        if (node.isActual === false) return false;
        if (processedTasks[node.id]) return false;
        return true;
      });

      const existingKeys = new Set(
        filteredPrev.map((item) => (item.source === 'manual' ? `manual:${item.manualId}` : `task:${item.task.id}`))
      );

      const additions: QueueItem[] = [];

      for (const node of nodes) {
        if (!isTaskNode(node)) continue;
        if (node.status !== 'done') continue;
        if (node.isActual === false) continue;
        if (processedTasks[node.id]) continue;
        const key = `task:${node.id}`;
        if (existingKeys.has(key)) continue;
        const info = summarizeTask(node, map);
        additions.push({ task: info, completedAt: node.completedAt ?? Date.now(), source: 'task' });
      }

      manualCandidates.forEach((candidate) => {
        const key = `manual:${candidate.id}`;
        if (existingKeys.has(key)) return;
        additions.push({
          task: candidate.info,
          completedAt: candidate.completedAt,
          source: 'manual',
          manualId: candidate.id,
        });
      });

      if (additions.length === 0) {
        return filteredPrev;
      }
      return [...filteredPrev, ...additions].sort((a, b) => b.completedAt - a.completedAt);
    });
  }, [nodes, processedTasks, manualCandidates]);

  useEffect(() => {
    if (!levelModal && pendingLevelUps.length > 0) {
      setLevelModal(pendingLevelUps[0]);
      setTitleSuggestions([]);
      setTitleValue('');
    }
  }, [pendingLevelUps, levelModal]);

  useEffect(() => {
    if (!levelModal) return;
    let cancelled = false;
    setTitleLoading(true);
    (async () => {
      const suggestions = await requestLevelTitleSuggestions(levelModal);
      if (cancelled) return;
      setTitleSuggestions(suggestions);
      const currentTitle = levelTitles[levelModal.level]?.title;
      if (currentTitle) {
        setTitleValue(currentTitle);
      } else if (suggestions.length) {
        setTitleValue(suggestions[0]);
      }
      setTitleLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [levelModal, levelTitles]);

  const currentItem = queue.length ? queue[0] : null;

  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const toLocalDateInput = (ts: number) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const toLocalTimeInput = (ts: number) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const parseDateTimeInput = (dateStr: string, timeStr: string): number | null => {
    if (!dateStr.trim()) return null;
    const parts = dateStr.split('-').map((p) => Number(p));
    if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) {
      return NaN;
    }
    const [yy, mm, dd] = parts;
    let hh = 12;
    let min = 0;
    if (timeStr.trim()) {
      const tParts = timeStr.split(':').map((p) => Number(p));
      if (tParts.length !== 2 || tParts.some((v) => Number.isNaN(v))) {
        return NaN;
      }
      [hh, min] = tParts;
    }
    const dt = new Date(yy, mm - 1, dd, hh, min, 0, 0);
    const stamp = dt.getTime();
    if (Number.isNaN(stamp)) {
      return NaN;
    }
    return stamp;
  };

  useEffect(() => {
    if (!currentItem) return;
    setXpValue(300);
    setDifficulty('medium');
    setNote('');
    const baseTs = Number.isFinite(currentItem.completedAt) ? currentItem.completedAt : Date.now();
    setCompletionDate(toLocalDateInput(baseTs));
    setCompletionTime(toLocalTimeInput(baseTs));
    setDateError(null);
  }, [currentItem]);

  const keyForItem = (item: QueueItem) => (
    item.source === 'manual' ? `manual:${item.manualId}` : `task:${item.task.id}`
  );

  function markProcessed(item: QueueItem) {
    if (item.source === 'task') {
      ignoreTaskCompletion(item.task.id);
    } else if (item.source === 'manual' && item.manualId) {
      removeManualCompletion(item.manualId);
    }
    const targetKey = keyForItem(item);
    setQueue((prev) => prev.filter((entry) => keyForItem(entry) !== targetKey));
  }

  async function cancelCompletion(item: QueueItem) {
    if (item.source === 'task') {
      await updateNode(item.task.id, { status: 'in_progress', completedAt: undefined });
    } else if (item.source === 'manual' && item.manualId) {
      const [category, entityId] = item.manualId.split(':');
      if (category && entityId) {
        if (category === 'book') {
          await db.books.update(entityId, { status: 'active', completedAt: undefined });
        } else if (category === 'movie') {
          await db.movies.update(entityId, { status: 'active', completedAt: undefined });
        } else if (category === 'game') {
          await db.games.update(entityId, { status: 'active', completedAt: undefined });
        } else if (category === 'purchase') {
          await db.purchases.update(entityId, { status: 'active', completedAt: undefined });
        }
      }
      if (item.manualId) {
        removeManualCompletion(item.manualId);
      }
    }
    const targetKey = keyForItem(item);
    setQueue((prev) => prev.filter((entry) => keyForItem(entry) !== targetKey));
  }

  async function submitXp() {
    if (!currentItem) return;
    const amount = clampXp(xpValue);
    const parsedTs = parseDateTimeInput(completionDate, completionTime);
    if (Number.isNaN(parsedTs)) {
      setDateError('Проверь формат даты и времени. Требуется YYYY-MM-DD и опционально HH:MM.');
      return;
    }
    const effectiveTs = parsedTs ?? currentItem.completedAt ?? Date.now();
    setDateError(null);

    if (currentItem.source === 'task') {
      const node = nodes.find((n): n is TaskNode => n.id === currentItem.task.id && isTaskNode(n));
      if (node && node.completedAt !== effectiveTs) {
        await updateNode(currentItem.task.id, { completedAt: effectiveTs });
      }
    } else if (currentItem.source === 'manual' && currentItem.manualId) {
      const [category, entityId] = currentItem.manualId.split(':');
      if (category && entityId) {
        if (category === 'book') {
          await db.books.update(entityId, { completedAt: effectiveTs });
        } else if (category === 'movie') {
          await db.movies.update(entityId, { completedAt: effectiveTs });
        } else if (category === 'game') {
          await db.games.update(entityId, { completedAt: effectiveTs });
        } else if (category === 'purchase') {
          await db.purchases.update(entityId, { completedAt: effectiveTs });
        }
      }
    }

    registerTaskCompletion(currentItem.task, amount, difficulty, note.trim() || undefined, effectiveTs);
    if (currentItem.source === 'manual' && currentItem.manualId) {
      removeManualCompletion(currentItem.manualId);
    }
    const targetKey = keyForItem(currentItem);
    setQueue((prev) => prev.filter((item) => keyForItem(item) !== targetKey));
  }

  function closeLevelModal() {
    if (!levelModal) return;
    clearLevelUpEvent(levelModal.level);
    setLevelModal(null);
    setTitleSuggestions([]);
  }

  function acceptLevelTitle() {
    if (!levelModal) return;
    const title = (titleValue || '').trim();
    if (!title) return;
    assignLevelTitle(levelModal.level, title);
    setLevelModal(null);
    setTitleSuggestions([]);
  }

  return (
    <>
      {currentItem ? (
        <div style={overlayStyle}>
          <div style={panelStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Начислить опыт за задачу</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{currentItem.task.title}</div>
              <div style={{ fontSize: 12, color: '#7f93a3' }}>{formatPath(currentItem.task)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {difficultyPresets.map((preset) => (
                <button
                  key={preset.key}
                  className="tool-btn"
                  style={{
                    background: difficulty === preset.key ? '#1e2f3a' : undefined,
                    borderColor: difficulty === preset.key ? '#4fa3ff' : undefined,
                  }}
                  onClick={() => {
                    setDifficulty(preset.key);
                    setXpValue(preset.xp);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Очки опыта
              <input
                type="text"
                inputMode="numeric"
                value={xpValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || val === '-') {
                    setXpValue(0);
                  } else {
                    const num = Number(val);
                    if (!isNaN(num)) {
                      setXpValue(num);
                    }
                  }
                }}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              Дата выполнения
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                  value={completionDate}
                  onChange={(e) => {
                    setCompletionDate(e.target.value);
                    setDateError(null);
                  }}
                  style={{ minWidth: 150 }}
                />
                <input
                  type="time"
                  value={completionTime}
                  onChange={(e) => {
                    setCompletionTime(e.target.value);
                    setDateError(null);
                  }}
                />
              </div>
            </label>
            {dateError ? (
              <div style={{ color: '#ff8888', fontSize: 12, marginBottom: 10 }}>{dateError}</div>
            ) : null}
            <label style={{ display: 'block', marginBottom: 10 }}>
              Комментарий (необязательно)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', minHeight: 60, marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <button className="tool-btn" onClick={() => cancelCompletion(currentItem)}>Отменить завершение</button>
              <span style={{ flex: 1 }} />
              <button className="tool-btn" onClick={() => markProcessed(currentItem)}>Пропустить</button>
              <button className="tool-btn" onClick={submitXp}>Начислить</button>
            </div>
          </div>
        </div>
      ) : null}
      {levelModal ? (
        <div style={overlayStyle}>
          <div style={{ ...panelStyle, width: 520 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Новый уровень {levelModal.level}</div>
            <div style={{ fontSize: 13, color: '#7f93a3', marginBottom: 12 }}>
              Вы достигли нового уровня! Подберите название, которое отражает последние достижения.
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #1e2f3a', borderRadius: 10, padding: 10, marginBottom: 12 }}>
              {levelModal.completions.length ? levelModal.completions.slice().reverse().map((c) => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: '#7f93a3' }}>{formatPath(c)}</div>
                </div>
              )) : <div style={{ color: '#7f93a3' }}>Задачи не найдены — используйте воображение!</div>}
            </div>
            {titleLoading ? (
              <div style={{ color: '#7f93a3', marginBottom: 12 }}>Ищу идеи уровня…</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {titleSuggestions.map((s) => (
                  <button
                    key={s}
                    className="tool-btn"
                    style={{
                      background: titleValue === s ? '#1e2f3a' : undefined,
                      borderColor: titleValue === s ? '#4fa3ff' : undefined,
                    }}
                    onClick={() => setTitleValue(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <label style={{ display: 'block', marginBottom: 10 }}>
              Название уровня
              <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button className="tool-btn" onClick={closeLevelModal}>Не сейчас</button>
              <button className="tool-btn" onClick={acceptLevelTitle} disabled={!titleValue.trim()}>Сохранить</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default GamificationManager;
