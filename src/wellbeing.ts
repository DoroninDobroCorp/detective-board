// Utilities to record and aggregate mindfulness/efficiency/joy ratings
// Stored in localStorage so they are available to both UI and the AI assistant

export type RatingTriple = {
  awareness: number; // 1..10
  efficiency: number; // 1..10
  joy: number; // 1..10
  ts: number; // unix ms
};

export type DayAverages = {
  awareness: number;
  efficiency: number;
  joy: number;
  count: number;
};

export type Snapshot = {
  today: {
    dateKey: string;
    raw: RatingTriple[];
    avg?: DayAverages;
  };
  daily: Record<string, DayAverages>; // yyyy-mm-dd -> avg
  monthly: Record<string, DayAverages>; // yyyy-mm -> avg
};

const RAW_KEY = 'WB_RAW_BY_DAY';
const DAILY_KEY = 'WB_DAY_AVG_BY_DAY';
const MONTHLY_KEY = 'WB_MONTH_AVG_BY_MONTH';

function safeParse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ym(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getRawMap(): Record<string, RatingTriple[]> {
  return safeParse<Record<string, RatingTriple[]>>(localStorage.getItem(RAW_KEY), {});
}

export function setRawMap(map: Record<string, RatingTriple[]>): void {
  localStorage.setItem(RAW_KEY, JSON.stringify(map));
}

export function getDailyMap(): Record<string, DayAverages> {
  return safeParse<Record<string, DayAverages>>(localStorage.getItem(DAILY_KEY), {});
}

export function setDailyMap(map: Record<string, DayAverages>): void {
  localStorage.setItem(DAILY_KEY, JSON.stringify(map));
}

export function getMonthlyMap(): Record<string, DayAverages> {
  return safeParse<Record<string, DayAverages>>(localStorage.getItem(MONTHLY_KEY), {});
}

export function setMonthlyMap(map: Record<string, DayAverages>): void {
  localStorage.setItem(MONTHLY_KEY, JSON.stringify(map));
}

export function recordEntry(entry: Omit<RatingTriple, 'ts'> & { ts?: number }, date?: string): void {
  const ts = entry.ts ?? Date.now();
  const originalDate = new Date(ts);
  let effectiveDate = originalDate;
  if (!date) {
    // Ответы, зафиксированные сразу после полуночи, относим к предыдущему дню.
    const hours = originalDate.getHours();
    const minutes = originalDate.getMinutes();
    if (hours === 0 && minutes < 15) {
      effectiveDate = new Date(ts - 60 * 60 * 1000);
    }
  }
  const dk = date ?? ymd(effectiveDate);
  const map = getRawMap();
  const list = map[dk] ?? [];
  list.push({ awareness: entry.awareness, efficiency: entry.efficiency, joy: entry.joy, ts });
  map[dk] = list;
  setRawMap(map);
}

export function computeAvg(list: RatingTriple[]): DayAverages | undefined {
  if (!list || list.length === 0) return undefined;
  const sum = list.reduce(
    (acc, r) => {
      acc.awareness += r.awareness;
      acc.efficiency += r.efficiency;
      acc.joy += r.joy;
      return acc;
    },
    { awareness: 0, efficiency: 0, joy: 0 }
  );
  return {
    awareness: +(sum.awareness / list.length).toFixed(2) as unknown as number,
    efficiency: +(sum.efficiency / list.length).toFixed(2) as unknown as number,
    joy: +(sum.joy / list.length).toFixed(2) as unknown as number,
    count: list.length,
  };
}

export function aggregateDay(dk: string): void {
  const raw = getRawMap();
  const list = raw[dk] ?? [];
  const avg = computeAvg(list);
  const daily = getDailyMap();
  if (avg) daily[dk] = avg; else delete daily[dk];
  setDailyMap(daily);
  // remove raw for that day after aggregation
  delete raw[dk];
  setRawMap(raw);
}

export function aggregateMonth(ymKey: string): void {
  const daily = getDailyMap();
  const entries = Object.entries(daily).filter(([k]) => k.startsWith(ymKey));
  const list: RatingTriple[] = [];
  for (const [k, v] of entries) {
    // convert avg back into a single sample with weight= count; more accurate to expand
    for (let i = 0; i < (v.count || 1); i++) {
      list.push({ awareness: v.awareness, efficiency: v.efficiency, joy: v.joy, ts: Date.parse(k) });
    }
  }
  const avg = computeAvg(list);
  const monthly = getMonthlyMap();
  if (avg) monthly[ymKey] = avg; else delete monthly[ymKey];
  setMonthlyMap(monthly);
  // remove daily records for that month
  for (const [k] of entries) delete daily[k];
  setDailyMap(daily);
}

export function getSnapshot(): Snapshot {
  const raw = getRawMap();
  const daily = getDailyMap();
  const monthly = getMonthlyMap();
  const dk = ymd();
  return {
    today: { dateKey: dk, raw: raw[dk] ?? [], avg: daily[dk] },
    daily,
    monthly,
  };
}

export function wellbeingBonusFromAverage(avg: DayAverages | undefined): number {
  if (!avg) return 0;
  const score = avg.awareness + avg.efficiency + avg.joy;
  const centered = score - 18; // 6/10 по каждой шкале = нулевая точка
  const weight = Math.min(1, avg.count / 3);
  const adjusted = centered * 12 * weight;
  if (!Number.isFinite(adjusted)) return 0;
  return Math.round(adjusted);
}

export function computeWellbeingBonuses(): Record<string, { xp: number; avg: DayAverages }> {
  const bonuses: Record<string, { xp: number; avg: DayAverages }> = {};
  const daily = getDailyMap();
  const raw = getRawMap();

  for (const [dateKey, avg] of Object.entries(daily)) {
    const xp = wellbeingBonusFromAverage(avg);
    bonuses[dateKey] = { xp, avg };
  }

  for (const [dateKey, list] of Object.entries(raw)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const avg = computeAvg(list);
    if (!avg) continue;
    const xp = wellbeingBonusFromAverage(avg);
    bonuses[dateKey] = { xp, avg };
  }

  return bonuses;
}

export function lastScheduledSlotsForDay(date: Date): string[] {
  void date;
  // returns list of ISO times (HH:mm) we consider scheduled
  return ['09:00', '12:00', '15:00', '18:00', '21:00', '00:00'];
}

export function nearestSlotKey(date = new Date()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}
