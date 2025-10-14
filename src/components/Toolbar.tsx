import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { Link, useNavigate } from 'react-router-dom';
import { getLogger } from '../logger';
import { exportBackup, exportAssistantContext, importBackup } from '../exportImport';
import AssistantModal from './AssistantModal';
import { useGamificationStore, progressWithinLevel, totalXpForLevel } from '../gamification';
import type { AnyNode } from '../types';

const log = getLogger('Toolbar');

type SnippetParts = {
  prefix: string;
  before: string;
  match: string;
  after: string;
  suffix: string;
};

type SearchHit = {
  node: AnyNode;
  fieldLabel: string;
  snippet: SnippetParts;
  title: string;
  path: string;
};

const ToolButton: React.FC<{
  active?: boolean;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <button
    className={`tool-btn ${active ? 'active' : ''}`}
    onClick={onClick}
    title={title}
    aria-label={title}
  >
    {children}
  </button>
);

export const Toolbar: React.FC = () => {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const deleteSelection = useAppStore((s) => s.deleteSelection);
  const goUp = useAppStore((s) => s.goUp);
  const revealNode = useAppStore((s) => s.revealNode);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const nodes = useAppStore((s) => s.nodes);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const levelMenuRef = useRef<HTMLDivElement | null>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const level = useGamificationStore((s) => s.level);
  const levelTitles = useGamificationStore((s) => s.levelTitles);
  const xp = useGamificationStore((s) => s.xp);
  const progress = progressWithinLevel(xp, level);
  const levelLabel = levelTitles[level]?.title || `Уровень ${level}`;
  const xpToNext = Math.max(0, progress.required - progress.current);
  const levelHistory = useMemo(
    () =>
      Object.entries(levelTitles)
        .map(([lvl, info]) => {
          const levelNumber = Number(lvl);
          return {
            level: levelNumber,
            title: info.title,
            assignedAt: info.assignedAt,
            xpStart: totalXpForLevel(levelNumber),
            xpNext: totalXpForLevel(levelNumber + 1),
          };
        })
        .sort((a, b) => a.level - b.level),
    [levelTitles]
  );
  const onPickFile = (mode: 'replace' | 'merge') => {
    setImportMode(mode);
    fileRef.current?.click();
  };
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    try {
      const f = e.target.files?.[0];
      if (!f) return;
      log.info('import:start', { name: f.name, size: f.size, mode: importMode });
      await importBackup(f, importMode);
      log.info('import:done', { mode: importMode });
      // сбрасываем значение, чтобы можно было повторно выбрать тот же файл
      e.target.value = '';
      alert('Импорт завершён');
    } catch (err) {
      console.error(err);
      alert('Ошибка импорта: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggle = (next: Parameters<typeof setTool>[0]) => {
    setTool(tool === next ? 'none' : next);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (levelMenuOpen && levelMenuRef.current && !levelMenuRef.current.contains(target)) {
        setLevelMenuOpen(false);
      }
      if (importMenuOpen && importMenuRef.current && !importMenuRef.current.contains(target)) {
        setImportMenuOpen(false);
      }
      if (exportMenuOpen && exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setExportMenuOpen(false);
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
        setSearchTerm('');
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [levelMenuOpen, importMenuOpen, exportMenuOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, [searchOpen]);

  const groupPathById = useMemo(() => {
    const pathMap = new Map<string, string>();
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const visiting = new Set<string>();

    const resolvePath = (groupId: string): string => {
      if (visiting.has(groupId)) return '';
      const cached = pathMap.get(groupId);
      if (cached !== undefined) return cached;
      const node = nodesById.get(groupId);
      if (!node || node.type !== 'group') {
        pathMap.set(groupId, '');
        return '';
      }
      visiting.add(groupId);
      const parentNode = node.parentId ? nodesById.get(node.parentId) : undefined;
      const parentPath = parentNode && parentNode.type === 'group' ? resolvePath(parentNode.id) : '';
      const namePart = (node.name || '').trim() || 'Без названия';
      const fullPath = parentPath ? `${parentPath} / ${namePart}` : namePart;
      pathMap.set(groupId, fullPath);
      visiting.delete(groupId);
      return fullPath;
    };

    nodes.forEach((node) => {
      if (node.type === 'group') {
        resolvePath(node.id);
      }
    });

    return pathMap;
  }, [nodes]);

  const searchResult = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return { hits: [] as SearchHit[], total: 0 };

    const makeSnippet = (value: string): SnippetParts | null => {
      const text = value.trim();
      if (!text) return null;
      const lower = text.toLowerCase();
      const index = lower.indexOf(query);
      if (index === -1) return null;
      const beforeStart = Math.max(0, index - 30);
      const afterEnd = Math.min(text.length, index + query.length + 30);
      return {
        prefix: beforeStart > 0 ? '…' : '',
        before: text.slice(beforeStart, index),
        match: text.slice(index, index + query.length),
        after: text.slice(index + query.length, afterEnd),
        suffix: afterEnd < text.length ? '…' : '',
      };
    };

    const getTitleForNode = (node: AnyNode) => {
      if (node.type === 'task') return (node.title || '').trim() || 'Без названия';
      if (node.type === 'group') return (node.name || '').trim() || 'Без названия';
      return (node.name || '').trim() || 'Без имени';
    };

    const computePath = (node: AnyNode) => {
      if (node.parentId) {
        const parentPath = groupPathById.get(node.parentId);
        return parentPath || '';
      }
      return '';
    };

    const matches: SearchHit[] = [];

    nodes.forEach((node) => {
      const fields: Array<{ label: string; value: string }> = [];
      const addField = (label: string, value?: string | null) => {
        if (!value) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        fields.push({ label, value: trimmed });
      };

      if (node.type === 'task') {
        addField('Название', node.title);
        addField('Описание', node.description);
        if (Array.isArray(node.subtasks)) {
          node.subtasks.forEach((sub, idx) => {
            addField(`Подзадача ${idx + 1}`, sub.title);
          });
        }
        const taskPath = computePath(node);
        if (taskPath) addField('Группа', taskPath);
      } else if (node.type === 'group') {
        addField('Название группы', node.name);
        addField('Описание группы', node.description);
        const parentPath = computePath(node);
        if (parentPath) addField('Родительская группа', parentPath);
      } else if (node.type === 'person') {
        addField('Имя', node.name);
        if (node.contacts) {
          addField('Email', node.contacts.email);
          addField('Телефон', node.contacts.phone);
          addField('Заметки', node.contacts.notes);
        }
        const personPath = computePath(node);
        if (personPath) addField('Группа', personPath);
      }

      const matchField = fields.find((field) => field.value.toLowerCase().includes(query));
      if (!matchField) return;

      const snippet = makeSnippet(matchField.value);
      if (!snippet) return;

      matches.push({
        node,
        fieldLabel: matchField.label,
        snippet,
        title: getTitleForNode(node),
        path: computePath(node),
      });
    });

    return { hits: matches.slice(0, 50), total: matches.length };
  }, [groupPathById, nodes, searchTerm]);

  const searchHits = searchResult.hits;
  const searchTotal = searchResult.total;
  const searchTruncated = searchTotal > searchHits.length;
  const hasSearchQuery = searchTerm.trim().length > 0;

  const handleSelectNode = (nodeId: string) => {
    log.info('search:select', { nodeId });
    revealNode(nodeId);
    navigate('/');
    setSearchOpen(false);
    setSearchTerm('');
  };

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSearchTerm('');
      } else {
        log.info('search:open');
      }
      return next;
    });
  };

  // Сохранение текущего центра вида как стартового
  const viewport = useAppStore((s) => s.viewport);
  const currentParentId = useAppStore((s) => s.currentParentId);
  const saveStartCenter = () => {
    try {
      const cx = (window.innerWidth / 2 - viewport.x) / viewport.scale;
      const cy = (window.innerHeight / 2 - viewport.y) / viewport.scale;
      const payload = { x: Math.round(cx), y: Math.round(cy), scale: viewport.scale };
      const levelKey = currentParentId ?? '__ROOT__';
      // write per-level map
      try {
        const raw = localStorage.getItem('START_VIEW_BY_LEVEL');
        const map = raw ? (JSON.parse(raw) as Record<string, { x: number; y: number; scale?: number }>) : {};
        map[levelKey] = payload;
        localStorage.setItem('START_VIEW_BY_LEVEL', JSON.stringify(map));
      } catch {}
      // legacy for root
      if (levelKey === '__ROOT__') {
        localStorage.setItem('START_VIEW_CENTER', JSON.stringify(payload));
      }
      log.info('startViewCenter:saved', { levelKey, ...payload });
      alert('Стартовый центр сохранён');
    } catch (e) {
      console.error(e);
      alert('Не удалось сохранить центр');
    }
  };

  return (
    <div className="toolbar">
      <div className="tool-group">
        <ToolButton active={tool === 'add-task'} onClick={() => { log.debug('setTool', { to: 'add-task' }); toggle('add-task'); }} title="Добавить задачу">📝</ToolButton>
        <ToolButton active={tool === 'add-group'} onClick={() => { log.debug('setTool', { to: 'add-group' }); toggle('add-group'); }} title="Добавить группу-шар">🟢</ToolButton>
        <ToolButton active={tool === 'add-person-employee'} onClick={() => { log.debug('setTool', { to: 'add-person-employee' }); toggle('add-person-employee'); }} title="Добавить сотрудника">👤</ToolButton>
        <ToolButton active={tool === 'add-person-partner'} onClick={() => { log.debug('setTool', { to: 'add-person-partner' }); toggle('add-person-partner'); }} title="Добавить партнёра">🤝</ToolButton>
        <ToolButton active={tool === 'add-person-bot'} onClick={() => { log.debug('setTool', { to: 'add-person-bot' }); toggle('add-person-bot'); }} title="Добавить бота">🤖</ToolButton>
        <ToolButton active={tool === 'link'} onClick={() => { log.debug('setTool', { to: 'link' }); toggle('link'); }} title="Соединить ниткой">🧵</ToolButton>
        <div ref={searchRef} style={{ position: 'relative' }}>
          <ToolButton active={searchOpen} onClick={toggleSearch} title="Поиск по всем объектам">🔍</ToolButton>
          {searchOpen ? (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: '#10181f',
                border: '1px solid #1f2b34',
                borderRadius: 10,
                padding: 12,
                width: 340,
                boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
                zIndex: 1400,
                display: 'grid',
                gap: 10,
              }}
            >
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchHits[0]) {
                      handleSelectNode(searchHits[0].node.id);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchOpen(false);
                    setSearchTerm('');
                  }
                }}
                placeholder="Найти по всем доскам"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #27323a',
                  background: '#0f1418',
                  color: '#fff',
                  fontSize: 14,
                }}
              />
              {!hasSearchQuery ? (
                <div style={{ fontSize: 12, color: '#7f93a3' }}>Введите фрагмент названия, описания или заметок.</div>
              ) : searchHits.length === 0 ? (
                <div style={{ fontSize: 12, color: '#7f93a3' }}>Ничего не найдено.</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
                  {searchHits.map((hit) => {
                    const typeLabel = hit.node.type === 'task' ? 'Задача' : hit.node.type === 'group' ? 'Группа' : 'Персона';
                    return (
                      <button
                        key={`${hit.node.id}-${hit.fieldLabel}`}
                        type="button"
                        className="tool-btn"
                        style={{
                          textAlign: 'left',
                          display: 'block',
                          width: '100%',
                          padding: '8px 10px',
                          whiteSpace: 'normal',
                          lineHeight: 1.4,
                        }}
                        onClick={() => handleSelectNode(hit.node.id)}
                        title="Открыть на доске"
                      >
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{hit.title}</div>
                        <div style={{ fontSize: 11, color: '#7f93a3', marginTop: 2 }}>
                          {typeLabel}
                          {hit.path ? ` · ${hit.path}` : ''}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 6 }}>
                          {hit.snippet.prefix}
                          {hit.snippet.before}
                          <mark style={{ background: '#3f5463', color: '#fff', padding: '0 2px', borderRadius: 2 }}>{hit.snippet.match}</mark>
                          {hit.snippet.after}
                          {hit.snippet.suffix}
                        </div>
                        <div style={{ fontSize: 10, color: '#5a6b78', marginTop: 6 }}>Поле: {hit.fieldLabel}</div>
                      </button>
                    );
                  })}
                  {searchTruncated ? (
                    <div style={{ fontSize: 11, color: '#7f93a3' }}>
                      Показаны первые {searchHits.length} результатов из {searchTotal}. Уточните запрос.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={levelMenuRef}
        className="tool-group"
        style={{ alignItems: 'center', gap: 12, position: 'relative', paddingLeft: 14, paddingRight: 14 }}
      >
        <button
          type="button"
          className="level-toggle"
          onClick={() => setLevelMenuOpen((v) => !v)}
          title={`До следующего уровня: ${xpToNext} XP`}
          aria-haspopup="true"
          aria-expanded={levelMenuOpen}
        >
          <span style={{ fontSize: 20 }}>⭐</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Уровень {level}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{levelLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{progress.current} / {progress.required} XP</div>
          </div>
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{levelMenuOpen ? '▲' : '▼'}</span>
        </button>
        {levelMenuOpen ? (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              background: '#10181f',
              border: '1px solid #1f2b34',
              borderRadius: 10,
              padding: 12,
              minWidth: 220,
              boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
              zIndex: 1200,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>История уровней</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {levelHistory.map((item) => (
                <div key={item.level} style={{ fontSize: 12, color: item.level === level ? '#fff' : 'var(--muted)' }}>
                  <div style={{ fontWeight: item.level === level ? 600 : 500 }}>Уровень {item.level}</div>
                  <div style={{ fontSize: 11 }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: '#7f93a3' }}>XP ≥ {item.xpStart}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, borderTop: '1px solid #1f2b34', paddingTop: 10 }}>
              <Link to="/achievements" className="level-achievements-link" onClick={() => setLevelMenuOpen(false)}>
                🏅 Достижения
              </Link>
            </div>
          </div>
        ) : null}
      </div>
      {/* Группа: Действия с объектами */}
      <div className="tool-group">
        <ToolButton onClick={() => { log.info('deleteSelection:click'); void deleteSelection(); }} title="Удалить выбранное">🗑️</ToolButton>
        <ToolButton onClick={() => { log.info('goUp:click'); goUp(); }} title="Вверх по уровню">⬆️</ToolButton>
      </div>
      {/* Группа: ИИ-Ассистент и Дневник */}
      <div className="tool-group">
        <ToolButton onClick={() => { log.info('assistant:open'); setAssistantOpen(true); }} title="ИИ-ассистент">👩‍💻</ToolButton>
        <Link to="/diary" className="tool-link" title="Дневник" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📔</Link>
      </div>
      {/* Группа: Задачи */}
      <div className="tool-group">
        <Link to="/active" className="tool-link" title="Активные задачи" aria-label="Активные задачи" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🔥</Link>
        <Link to="/done" className="tool-link" title="Выполненные задачи" aria-label="Выполненные задачи" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✅</Link>
      </div>
      {/* Группа: Коллекции */}
      <div className="tool-group">
        <Link to="/books" className="tool-link" title="Книги" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📚</Link>
        <Link to="/movies" className="tool-link" title="Фильмы" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎬</Link>
        <Link to="/games" className="tool-link" title="Игры" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎮</Link>
        <Link to="/purchases" className="tool-link" title="Покупки" style={{ padding: 8, minWidth: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛒</Link>
      </div>
      {/* Группа: История и Вид */}
      <div className="tool-group">
        <button className="tool-btn" title="Отменить (Cmd/Ctrl+Z)" onClick={() => { void undo(); }}>↶</button>
        <button className="tool-btn" title="Вернуть (Shift+Cmd/Ctrl+Z / Ctrl+Y)" onClick={() => { void redo(); }}>↷</button>
        <button className="tool-btn" title="Полноэкранный режим" onClick={() => {
          if (!document.fullscreenElement) {
            void document.documentElement.requestFullscreen();
          } else {
            void document.exitFullscreen();
          }
        }}>⛶</button>
        <button className="tool-btn" title="Запомнить текущий центр вида" onClick={saveStartCenter}>📍</button>
      </div>
      {/* Группа: Импорт/Экспорт */}
      <div className="tool-group">
        <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button className="tool-btn" title="Экспорт" onClick={() => setExportMenuOpen((v) => !v)}>⤓ Экспорт</button>
          {exportMenuOpen ? (
            <div style={{ position: 'absolute', right: 0, top: '100%', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: 8, minWidth: 220, zIndex: 1000, boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
              <button className="tool-btn" style={{ display: 'block', width: '100%' }} title="Экспортировать все данные" onClick={() => { log.info('export:click'); void exportBackup(); setExportMenuOpen(false); }}>⤓ Экспорт базы</button>
              <button className="tool-btn" style={{ display: 'block', width: '100%', marginTop: 6 }} title="Экспортировать контекст ассистента" onClick={() => { log.info('export:assistant-context'); void exportAssistantContext(); setExportMenuOpen(false); }}>🧠 Контекст ассистента</button>
            </div>
          ) : null}
        </div>
        <div ref={importMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button className="tool-btn" title="Импорт" onClick={() => setImportMenuOpen((v) => !v)}>⤒ Импорт</button>
          {importMenuOpen ? (
            <div style={{ position: 'absolute', right: 0, top: '100%', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: 8, minWidth: 220, zIndex: 1000, boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
              <button className="tool-btn" style={{ display: 'block', width: '100%' }} title="Импорт (замена)" onClick={() => { onPickFile('replace'); setImportMenuOpen(false); }}>⤒ Импорт (замена)</button>
              <button className="tool-btn" style={{ display: 'block', width: '100%', marginTop: 6 }} title="Импорт (merge)" onClick={() => { onPickFile('merge'); setImportMenuOpen(false); }}>⤒ Импорт (merge)</button>
            </div>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onFileChange} />
      </div>
      {assistantOpen ? (<AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} />) : null}
    </div>
  );
};

export default Toolbar;
