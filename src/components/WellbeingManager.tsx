import React, { useCallback, useEffect, useRef, useState } from 'react';
import { aggregateDay, aggregateMonth, computeWellbeingBonuses, getDailyMap, getRawMap, lastScheduledSlotsForDay, nearestSlotKey, recordEntry, ymd, ym } from '../wellbeing';
import { useGamificationStore } from '../gamification';

const ASKED_KEY = 'WB_ASKED_SLOTS_BY_DAY';

type AskedMap = Record<string, string[]>; // date -> ['09:00', '12:00', ...]

function loadAsked(): AskedMap {
  try {
    const raw = localStorage.getItem(ASKED_KEY);
    return raw ? (JSON.parse(raw) as AskedMap) : {};
  } catch {
    return {};
  }
}

function saveAsked(map: AskedMap) {
  localStorage.setItem(ASKED_KEY, JSON.stringify(map));
}

export const WellbeingManager: React.FC = () => {
  const [askOpen, setAskOpen] = useState(false);
  const [awareness, setAwareness] = useState(7);
  const [efficiency, setEfficiency] = useState(7);
  const [joy, setJoy] = useState(7);
  const [slot, setSlot] = useState<string | null>(null);
  const lastDayRef = useRef<string>(ymd());
  const lastMonthRef = useRef<string>(ym());
  const markBonusClaimed = useGamificationStore((s) => s.markBonusClaimed);
  const localPromptsOn = (() => { try { return localStorage.getItem('WB_LOCAL_PROMPTS') === '1'; } catch { return false; } })();

  const syncBonuses = useCallback(() => {
    try {
      const bonuses = computeWellbeingBonuses();
      for (const [dateKey, info] of Object.entries(bonuses)) {
        markBonusClaimed(dateKey, info.xp, {
          awareness: info.avg.awareness,
          efficiency: info.avg.efficiency,
          joy: info.avg.joy,
          count: info.avg.count,
        });
      }
    } catch {
      // игнорируем ошибки синхронизации, повторим при следующем цикле
    }
  }, [markBonusClaimed]);

  // Ensure past days are aggregated on load
  useEffect(() => {
    try {
      const today = ymd();
      const raw = getRawMap();
      const keys = Object.keys(raw).filter((k) => k !== today).sort();
      for (const dk of keys) aggregateDay(dk);
      // monthly aggregation: if we have daily entries from previous months and no monthly record yet, aggregate
      const daily = getDailyMap();
      const months = new Set(Object.keys(daily).map((d) => d.slice(0, 7)));
      for (const m of months) {
        const nowM = ym();
        if (m < nowM) aggregateMonth(m);
      }
      syncBonuses();
    } catch {}
  }, [syncBonuses]);

  useEffect(() => {
    if (!localPromptsOn) return;
    const interval = setInterval(() => {
      try {
        const now = new Date();
        // Day/month rollover detection
        const currDay = ymd(now);
        if (currDay !== lastDayRef.current) {
          try { aggregateDay(lastDayRef.current); } catch {}
          lastDayRef.current = currDay;
        }
        const currMonth = ym(now);
        if (currMonth !== lastMonthRef.current) {
          try { aggregateMonth(lastMonthRef.current); } catch {}
          lastMonthRef.current = currMonth;
        }
        const today = ymd(now);
        const key = nearestSlotKey(now);
        const scheduled = lastScheduledSlotsForDay(now);
        // Round to exact minutes only
        if (!scheduled.includes(key)) return;
        const asked = loadAsked();
        const list = asked[today] ?? [];
        if (list.includes(key)) return;
        // Open modal
        setSlot(key);
        setAskOpen(true);
      } catch {}
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [localPromptsOn]);

  // Pull ratings submitted via Telegram
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch('/api/tg/pending');
        if (!resp.ok) return;
        const json = await resp.json();
        const items = Array.isArray(json.items) ? json.items as Array<{ awareness: number; efficiency: number; joy: number; ts: number }> : [];
        for (const it of items) {
          recordEntry({ awareness: it.awareness, efficiency: it.efficiency, joy: it.joy, ts: it.ts });
        }
        if (items.length > 0) syncBonuses();
      } catch {}
    }, 15 * 1000);
    return () => clearInterval(interval);
  }, [syncBonuses]);

  function markAsked() {
    const today = ymd();
    if (!slot) return;
    const asked = loadAsked();
    const list = asked[today] ?? [];
    if (!list.includes(slot)) list.push(slot);
    asked[today] = list;
    saveAsked(asked);
  }

  function submit() {
    try {
      recordEntry({ awareness, efficiency, joy });
      syncBonuses();
      markAsked();
    } finally {
      setAskOpen(false);
      setSlot(null);
    }
  }

  function skip() {
    try { markAsked(); } finally {
      setAskOpen(false);
      setSlot(null);
    }
  }

  useEffect(() => {
    syncBonuses();
  }, [syncBonuses]);

  if (!askOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, background: '#111', color: '#fff', borderRadius: 12, border: '1px solid #333', boxShadow: '0 12px 48px rgba(0,0,0,0.6)', padding: 16 }}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Оценка состояния {slot ? `(${slot})` : ''}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            Осознанность (1-10)
            <input type="number" min={1} max={10} value={awareness} onChange={(e) => setAwareness(Math.max(1, Math.min(10, Number(e.target.value)||1)))} />
          </label>
          <label>
            Эффективность (1-10)
            <input type="number" min={1} max={10} value={efficiency} onChange={(e) => setEfficiency(Math.max(1, Math.min(10, Number(e.target.value)||1)))} />
          </label>
          <label>
            Удовольствие (1-10)
            <input type="number" min={1} max={10} value={joy} onChange={(e) => setJoy(Math.max(1, Math.min(10, Number(e.target.value)||1)))} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tool-btn" onClick={skip}>Пропустить</button>
            <button className="tool-btn" onClick={submit}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WellbeingManager;
