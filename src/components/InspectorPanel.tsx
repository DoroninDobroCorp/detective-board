import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import type { AnyNode, GroupNode, TaskNode, TaskStatus, PersonNode, PersonRole, Recurrence } from '../types';
import { getLogger } from '../logger';
import { computeNextDueDate, todayYMD, toIsoUTCFromYMD } from '../recurrence';

export const InspectorPanel: React.FC = () => {
  const selection = useAppStore((s) => s.selection);
  const getNode = useAppStore((s) => s.getNode);
  const updateNode = useAppStore((s) => s.updateNode);
  const enterGroup = useAppStore((s) => s.enterGroup);
  const log = getLogger('Inspector');
  const [recOpen, setRecOpen] = useState(false);
  // Локальное состояние для ввода даты дедлайна: даёт возможность вводить без дёрганий
  const [dueLocal, setDueLocal] = useState<string>('');

  const node = useMemo<AnyNode | undefined>(() => {
    if (selection.length !== 1) return undefined;
    return getNode(selection[0]);
  }, [selection, getNode]);

  // Синхронизация локального состояния даты со стором при смене выделения/даты
  useEffect(() => {
    if (node && node.type === 'task') {
      const t = node as TaskNode;
      setDueLocal(t.dueDate ? t.dueDate.slice(0, 10) : '');
    } else {
      setDueLocal('');
    }
  }, [node]);

  if (!node) {
    return (
      <div className="inspector">
        <div className="inspector__title">Свойства</div>
        <div className="inspector__empty">Нет выделения</div>
      </div>
    );
  }

  if (node.type === 'task') {
    const t = node as TaskNode;
    const setRecurrence = (rec: Recurrence) => {
      const nextDue = computeNextDueDate(rec, new Date());
      void updateNode(t.id, { recurrence: rec, dueDate: nextDue ?? t.dueDate });
    };
    const quick = {
      daily: () => setRecurrence({ kind: 'daily' }),
      weeklyThu: () => setRecurrence({ kind: 'weekly', weekday: 4 }), // Thu (0=Sun)
      monthly28: () => setRecurrence({ kind: 'monthly', day: 28 }),
      every7: () => setRecurrence({ kind: 'interval', everyDays: 7, anchorDate: new Date().toISOString() }),
      none: () => setRecurrence({ kind: 'none' }),
    } as const;
    return (
      <div className="inspector">
        <div className="inspector__title">Задача</div>
        <label>
          Заголовок
          <input value={t.title} onChange={(e) => updateNode(t.id, { title: e.target.value })} />
        </label>
        <label>
          Описание
          <textarea value={t.description || ''} onChange={(e) => updateNode(t.id, { description: e.target.value })} />
        </label>
        <label>
          Цвет стикера
          <input type="color" value={(t.color || '#E8D8A6')} onChange={(e) => updateNode(t.id, { color: e.target.value })} />
        </label>
        <label>
          Срок
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              value={dueLocal}
              onChange={(e) => {
                const v = e.target.value;
                setDueLocal(v);
                if (!v) { void updateNode(t.id, { dueDate: undefined }); return; }
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  void updateNode(t.id, { dueDate: toIsoUTCFromYMD(v) });
                }
              }}
            />
            <button type="button" className="tool-btn" title="Повтор" onClick={() => setRecOpen((v) => !v)}>⟲ Повтор</button>
          </div>
          {recOpen && (
            <div style={{ marginTop: 6, padding: 8, border: '1px solid #ccc', borderRadius: 6, background: '#fafafa', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="tool-btn" onClick={quick.daily}>Каждый день</button>
                <button type="button" className="tool-btn" onClick={quick.weeklyThu}>Каждый четверг</button>
                <button type="button" className="tool-btn" onClick={quick.monthly28}>Каждое 28-е</button>
                <button type="button" className="tool-btn" onClick={quick.every7}>Каждые 7 дней</button>
                <button type="button" className="tool-btn" onClick={quick.none}>Без повтора</button>
              </div>
              {/* Расширенные опции */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                <fieldset className="inspector__fieldset">
                  <legend>Произвольно</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: 6 }}>
                      <span>Еженедельно:</span>
                      <select
                        value={typeof t.recurrence === 'object' && t.recurrence?.kind === 'weekly' ? String(t.recurrence.weekday) : ''}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setRecurrence({ kind: 'weekly', weekday: isNaN(w) ? 1 : w });
                        }}
                      >
                        <option value="">— выбрать —</option>
                        <option value={1}>Понедельник</option>
                        <option value={2}>Вторник</option>
                        <option value={3}>Среда</option>
                        <option value={4}>Четверг</option>
                        <option value={5}>Пятница</option>
                        <option value={6}>Суббота</option>
                        <option value={0}>Воскресенье</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: 6 }}>
                      <span>Ежемесячно:</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={typeof t.recurrence === 'object' && t.recurrence?.kind === 'monthly' ? t.recurrence.day : ''}
                        onChange={(e) => {
                          const day = Math.max(1, Math.min(31, Number(e.target.value) || 1));
                          setRecurrence({ kind: 'monthly', day });
                        }}
                        placeholder="День месяца"
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', alignItems: 'center', gap: 6 }}>
                      <span>Интервал:</span>
                      <input
                        type="number"
                        min={1}
                        value={typeof t.recurrence === 'object' && t.recurrence?.kind === 'interval' ? t.recurrence.everyDays : ''}
                        onChange={(e) => {
                          const n = Math.max(1, Number(e.target.value) || 1);
                          const anchor = (typeof t.recurrence === 'object' && t.recurrence?.kind === 'interval') ? t.recurrence.anchorDate : new Date().toISOString();
                          setRecurrence({ kind: 'interval', everyDays: n, anchorDate: anchor });
                        }}
                        placeholder="Каждые N дней"
                      />
                      <input
                        type="date"
                        value={typeof t.recurrence === 'object' && t.recurrence?.kind === 'interval' ? (t.recurrence.anchorDate.slice(0,10)) : todayYMD()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) {
                            const n = (typeof t.recurrence === 'object' && t.recurrence?.kind === 'interval') ? t.recurrence.everyDays : 7;
                            setRecurrence({ kind: 'interval', everyDays: n, anchorDate: new Date().toISOString() });
                            return;
                          }
                          if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                            const anchor = toIsoUTCFromYMD(val);
                            const n = (typeof t.recurrence === 'object' && t.recurrence?.kind === 'interval') ? t.recurrence.everyDays : 7;
                            setRecurrence({ kind: 'interval', everyDays: n, anchorDate: anchor });
                          }
                        }}
                        title="Начинать с"
                      />
                    </div>
                  </div>
                </fieldset>
                <div style={{ fontSize: 12, color: '#666' }}>
                  Текущий повтор: {t.recurrence ? JSON.stringify(t.recurrence) : 'без повтора'}
                </div>
              </div>
            </div>
          )}
        </label>
        <label>
          Срочность
          <select
            value={t.priority || 'med'}
            onChange={(e) => updateNode(t.id, { priority: (e.target.value as 'low' | 'med' | 'high') })}
          >
            <option value="low">Низкая</option>
            <option value="med">Средняя</option>
            <option value="high">Высокая</option>
          </select>
        </label>
        <label>
          Длительность (мин)
          <input type="number" value={t.durationMinutes || 0} onChange={(e) => updateNode(t.id, { durationMinutes: Number(e.target.value) || undefined })} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            Ширина
            <input type="number" min={80} max={1200} value={t.width} onChange={(e) => updateNode(t.id, { width: Math.max(80, Math.min(1200, Number(e.target.value))) })} />
          </label>
          <label>
            Высота
            <input type="number" min={60} max={900} value={t.height} onChange={(e) => updateNode(t.id, { height: Math.max(60, Math.min(900, Number(e.target.value))) })} />
          </label>
        </div>
        <fieldset className="inspector__fieldset">
          <legend>Статус</legend>
          <label className="radio">
            <input
              type="radio"
              name="status"
              checked={t.status === 'inactive'}
              onChange={() => updateNode(t.id, { status: 'inactive' as TaskStatus, completedAt: undefined })}
            /> Не активна
          </label>
          <label className="radio">
            <input
              type="radio"
              name="status"
              checked={t.status === 'in_progress'}
              onChange={() => updateNode(t.id, { status: 'in_progress' as TaskStatus, completedAt: undefined })}
            /> В процессе
          </label>
          <label className="radio">
            <input
              type="radio"
              name="status"
              checked={t.status === 'done'}
              onChange={() => {
                const ask = window.prompt('Дата выполнения (YYYY-MM-DD или YYYY-MM-DD HH:mm). Пусто — сейчас:');
                let completedAt = Date.now();
                if (ask && ask.trim()) {
                  const s = ask.trim();
                  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
                  if (m1) {
                    const [_, yy, mm, dd] = m1;
                    completedAt = new Date(Number(yy), Number(mm) - 1, Number(dd), 12, 0, 0).getTime();
                  } else if (m2) {
                    const [_, yy, mm, dd, HH, MM] = m2;
                    completedAt = new Date(Number(yy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), 0).getTime();
                  }
                }
                void updateNode(t.id, { status: 'done' as TaskStatus, completedAt });
              }}
            /> Выполнена
          </label>
        </fieldset>
      </div>
    );
  }

  if (node.type === 'person') {
    const p = node as PersonNode;
    return (
      <div className="inspector">
        <div className="inspector__title">Человек</div>
        <label>
          Имя
          <input value={p.name} onChange={(e) => updateNode(p.id, { name: e.target.value })} />
        </label>
        <label>
          Роль
          <select value={p.role} onChange={(e) => updateNode(p.id, { role: (e.target.value as PersonRole) })}>
            <option value="employee">Сотрудник</option>
            <option value="partner">Партнёр</option>
            <option value="bot">Бот</option>
          </select>
        </label>
        <label>
          Иконка (emoji)
          <input value={p.avatarEmoji || ''} onChange={(e) => updateNode(p.id, { avatarEmoji: e.target.value })} placeholder="👤/🤝/🤖" />
        </label>
        <label>
          Цвет
          <input type="color" value={p.color || '#B3E5FC'} onChange={(e) => updateNode(p.id, { color: e.target.value })} />
        </label>
        <label>
          Размер (px)
          <input type="number" min={80} max={400} value={p.width} onChange={(e) => {
            const size = Math.max(80, Math.min(400, Number(e.target.value)));
            updateNode(p.id, { width: size, height: size });
          }} />
        </label>
      </div>
    );
  }

  const g = node as GroupNode;
  return (
    <div className="inspector">
      <div className="inspector__title">Группа</div>
      <label>
        Название
        <input value={g.name} onChange={(e) => updateNode(g.id, { name: e.target.value })} />
      </label>
      <label>
        Цвет шара
        <input type="color" value={g.color || '#AEC6CF'} onChange={(e) => updateNode(g.id, { color: e.target.value })} />
      </label>
      <label>
        Размер (px)
        <input type="number" min={80} max={1200} value={g.width} onChange={(e) => {
          const size = Math.max(80, Math.min(1200, Number(e.target.value)));
          updateNode(g.id, { width: size, height: size });
        }} />
      </label>
      <button onClick={() => { log.info('group:open-click', { id: g.id }); enterGroup(g.id); }} title="Открыть группу" aria-label="Открыть группу">Открыть группу</button>
    </div>
  );
};

export default InspectorPanel;
