import type { Recurrence } from './types';

function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

export function todayYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function toIsoUTCFromYMD(ymd: string): string {
  // ymd is YYYY-MM-DD
  const [y, m, d] = ymd.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
}

function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((s) => Number(s));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = dt.getUTCMonth() + 1;
  const dd = dt.getUTCDate();
  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}

function clampDay(year: number, month1: number, day: number): number {
  // month1: 1..12
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return Math.max(1, Math.min(lastDay, day));
}

export function computeNextDueDate(rule: Recurrence, from: Date | string = new Date()): string | null {
  if (!rule || rule.kind === 'none') return null;
  const base = typeof from === 'string' ? new Date(from) : from;
  // Work in local date for weekday, but output in UTC YMD
  const y = base.getFullYear();
  const m = base.getMonth() + 1; // 1..12
  const d = base.getDate();
  const dow = base.getDay(); // 0..6, Sunday=0
  const today = `${y}-${pad2(m)}-${pad2(d)}`;

  if (rule.kind === 'daily') {
    // today is the next occurrence
    return toIsoUTCFromYMD(today);
  }
  if (rule.kind === 'weekly') {
    const targetDow = ((rule.weekday % 7) + 7) % 7;
    let delta = (targetDow - dow + 7) % 7;
    // if today is the day, return today
    const ymd = addDaysYMD(today, delta);
    return toIsoUTCFromYMD(ymd);
  }
  if (rule.kind === 'monthly') {
    // if today day <= target day -> this month, else next month
    let year = y;
    let month1 = m;
    let day = rule.day;
    if (d > day) {
      month1++;
      if (month1 > 12) { month1 = 1; year++; }
    }
    const dd = clampDay(year, month1, day);
    const ymd = `${year}-${pad2(month1)}-${pad2(dd)}`;
    return toIsoUTCFromYMD(ymd);
  }
  if (rule.kind === 'interval') {
    const every = Math.max(1, Math.floor(rule.everyDays));
    const anchor = new Date(rule.anchorDate);
    // Work with UTC days difference
    const start = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
    const baseUTC = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
    const diffDays = Math.floor((baseUTC - start) / 86400000);
    const k = diffDays <= 0 ? 0 : Math.ceil(diffDays / every);
    const nextUTC = start + k * every * 86400000;
    const next = new Date(nextUTC);
    const y2 = next.getUTCFullYear();
    const m2 = next.getUTCMonth() + 1;
    const d2 = next.getUTCDate();
    const ymd = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return toIsoUTCFromYMD(ymd);
  }
  return null;
}
