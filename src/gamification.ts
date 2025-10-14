import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TaskPathInfo } from './taskUtils';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface TaskCompletionSummary extends TaskPathInfo {
  completedAt: number;
  difficulty: Difficulty;
  xp: number;
  note?: string;
}

export type XpSource = 'task' | 'achievement' | 'bonus' | 'manual';

export interface XPEntry {
  id: string;
  amount: number;
  source: XpSource;
  note?: string;
  taskId?: string;
  achievementId?: string;
  ts: number;
}

export interface ManualCompletionCandidate {
  id: string;
  info: TaskPathInfo;
  completedAt: number;
}

export interface LevelUpEvent {
  level: number;
  totalXp: number;
  completions: TaskCompletionSummary[];
  triggeredAt: number;
}

export interface LevelTitleInfo {
  title: string;
  assignedAt: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  imageUrl?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface WellbeingBonusMeta {
  awareness: number;
  efficiency: number;
  joy: number;
  count: number;
}

export interface ClaimedBonusInfo {
  xp: number;
  ts: number;
  meta?: WellbeingBonusMeta;
}

export interface GamificationState {
  xp: number;
  level: number;
  xpHistory: XPEntry[];
  completions: TaskCompletionSummary[];
  processedTasks: Record<string, boolean>;
  achievements: Achievement[];
  levelTitles: Record<number, LevelTitleInfo>;
  claimedBonuses: Record<string, ClaimedBonusInfo>;
  pendingLevelUps: LevelUpEvent[];
  pendingManualCandidates: ManualCompletionCandidate[];
  registerTaskCompletion: (info: TaskPathInfo, xp: number, difficulty: Difficulty, note?: string, completedAt?: number) => void;
  ignoreTaskCompletion: (taskId: string) => void;
  addXp: (entry: { amount: number; source: XpSource; note?: string; taskId?: string; achievementId?: string; ts?: number }) => void;
  revertTaskXp: (taskId: string) => void;
  assignLevelTitle: (level: number, title: string) => void;
  clearLevelUpEvent: (level: number) => void;
  addAchievement: (input: { title: string; description: string; xpReward: number; imageUrl?: string }) => Achievement;
  updateAchievement: (achievement: Achievement) => void;
  removeAchievement: (id: string) => void;
  markBonusClaimed: (dateKey: string, xp: number, meta?: WellbeingBonusMeta) => void;
  enqueueManualCompletion: (candidate: ManualCompletionCandidate) => void;
  removeManualCompletion: (id: string) => void;
}

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const storage = createJSONStorage(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage;
});

function xpRequiredForNext(level: number): number {
  // Slightly increased difficulty (v2): ~+12% to next-level thresholds
  const base = 250;
  const scale = 1.12; // keep it subtle
  const core = base * Math.pow(Math.max(level, 1), 1.35) + 180;
  return Math.max(150, Math.round(core * scale));
}

export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpRequiredForNext(i);
  }
  return total;
}

export function levelForXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= totalXpForLevel(level + 1)) {
    level += 1;
    if (level > 999) break;
  }
  return level;
}

export function progressWithinLevel(totalXp: number, level: number): { current: number; required: number } {
  const base = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  return { current: Math.max(0, totalXp - base), required: Math.max(1, next - base) };
}

function normalizeXp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

const MAX_HISTORY = 200;
const MAX_COMPLETIONS = 200;

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      xp: 0,
      level: 1,
      xpHistory: [],
      completions: [],
      processedTasks: {},
      achievements: [],
      levelTitles: { 1: { title: 'Новичок', assignedAt: Date.now() } },
      claimedBonuses: {},
      pendingLevelUps: [],
      pendingManualCandidates: [],
      registerTaskCompletion: (info, amount, difficulty, note, completedAt) => {
        const raw = normalizeXp(amount);
        const xp = Math.max(0, raw);
        const summary: TaskCompletionSummary = {
          ...info,
          completedAt: completedAt ?? Date.now(),
          difficulty,
          xp,
          note,
        };
        set((state) => ({
          completions: [...state.completions, summary].slice(-MAX_COMPLETIONS),
          processedTasks: { ...state.processedTasks, [info.id]: true },
        }));
        if (xp > 0) {
          get().addXp({ amount: xp, source: 'task', note: note || info.title, taskId: info.id, ts: summary.completedAt });
        }
      },
      ignoreTaskCompletion: (taskId) => {
        set((state) => ({
          processedTasks: { ...state.processedTasks, [taskId]: true },
        }));
      },
      addXp: ({ amount, source, note, taskId, achievementId, ts }) => {
        const xpDeltaRaw = normalizeXp(amount);
        if (xpDeltaRaw === 0) return;
        set((state) => {
          const applied = xpDeltaRaw < 0 ? Math.max(xpDeltaRaw, -state.xp) : xpDeltaRaw;
          if (applied === 0) return {};
          const nextXp = state.xp + applied;
          const history: XPEntry[] = [...state.xpHistory, {
            id: crypto.randomUUID(),
            amount: applied,
            source,
            note,
            taskId,
            achievementId,
            ts: ts ?? Date.now(),
          }].slice(-MAX_HISTORY);
          const prevLevel = state.level;
          const titles = { ...state.levelTitles };
          const nextLevel = levelForXp(nextXp);
          let pending = state.pendingLevelUps.filter((evt) => evt.level <= nextLevel);
          if (nextLevel > prevLevel) {
            const completions = state.completions.slice(-8);
            for (let lvl = prevLevel + 1; lvl <= nextLevel; lvl++) {
              pending = [...pending, { level: lvl, totalXp: nextXp, completions, triggeredAt: Date.now() }];
              if (!titles[lvl]) {
                titles[lvl] = { title: `Уровень ${lvl}`, assignedAt: Date.now() };
              }
            }
          }
          if (nextLevel < prevLevel) {
            // Убираем уровни, которые больше нового.
            pending = pending.filter((evt) => evt.level <= nextLevel);
          }
          return {
            xp: nextXp,
            level: nextLevel,
            xpHistory: history,
            pendingLevelUps: pending,
            levelTitles: titles,
          };
        });
      },
      revertTaskXp: (taskId) => {
        set((state) => {
          // Найти completion для этой задачи
          const completion = state.completions.find((c) => c.id === taskId);
          if (!completion) {
            // Задача не была обработана или уже удалена
            const newProcessed = { ...state.processedTasks };
            delete newProcessed[taskId];
            return { processedTasks: newProcessed };
          }

          // Найти все XP записи для этой задачи
          const relatedEntries = state.xpHistory.filter((e) => e.taskId === taskId);
          const totalXpToRevert = relatedEntries.reduce((sum, e) => sum + e.amount, 0);

          // Убрать записи из истории
          const newHistory = state.xpHistory.filter((e) => e.taskId !== taskId);
          
          // Убрать completion
          const newCompletions = state.completions.filter((c) => c.id !== taskId);
          
          // Убрать из processedTasks
          const newProcessed = { ...state.processedTasks };
          delete newProcessed[taskId];

          // Вычесть XP
          const nextXp = Math.max(0, state.xp - totalXpToRevert);
          const nextLevel = levelForXp(nextXp);
          
          // Обновить pending level-ups (удалить уровни, которые больше не достигнуты)
          const pending = state.pendingLevelUps.filter((evt) => evt.level <= nextLevel);

          return {
            xp: nextXp,
            level: nextLevel,
            xpHistory: newHistory,
            completions: newCompletions,
            processedTasks: newProcessed,
            pendingLevelUps: pending,
          };
        });
      },
      assignLevelTitle: (level, title) => {
        set((state) => ({
          levelTitles: { ...state.levelTitles, [level]: { title, assignedAt: Date.now() } },
          pendingLevelUps: state.pendingLevelUps.filter((evt) => evt.level !== level),
        }));
      },
      clearLevelUpEvent: (level) => {
        set((state) => ({
          pendingLevelUps: state.pendingLevelUps.filter((evt) => evt.level !== level),
        }));
      },
      addAchievement: ({ title, description, xpReward, imageUrl }) => {
        const achievement: Achievement = {
          id: crypto.randomUUID(),
          title,
          description,
          xpReward: Math.max(0, normalizeXp(xpReward)),
          imageUrl,
          createdAt: Date.now(),
        };
        set((state) => ({ achievements: [...state.achievements, achievement] }));
        if (achievement.xpReward !== 0) {
          get().addXp({ amount: achievement.xpReward, source: 'achievement', note: title, achievementId: achievement.id });
        }
        return achievement;
      },
      updateAchievement: (achievement) => {
        set((state) => ({
          achievements: state.achievements.map((a) => (a.id === achievement.id ? { ...achievement, updatedAt: Date.now() } : a)),
        }));
      },
      removeAchievement: (id) => {
        set((state) => ({ achievements: state.achievements.filter((a) => a.id !== id) }));
      },
      markBonusClaimed: (dateKey, xp, meta) => {
        const target = normalizeXp(xp);
        set((state) => {
          const prevInfo = state.claimedBonuses[dateKey];
          const prevXp = prevInfo?.xp ?? 0;
          const deltaRaw = target - prevXp;
          if (deltaRaw === 0) {
            if (!meta || (prevInfo && prevInfo.meta)) return {};
            return {
              claimedBonuses: {
                ...state.claimedBonuses,
                [dateKey]: { xp: prevXp, ts: Date.now(), meta },
              },
            };
          }
          const applied = deltaRaw < 0 ? Math.max(deltaRaw, -state.xp) : deltaRaw;
          if (applied === 0) {
            return {
              claimedBonuses: {
                ...state.claimedBonuses,
                [dateKey]: {
                  xp: prevXp,
                  ts: Date.now(),
                  meta,
                },
              },
            };
          }
          const nextXp = state.xp + applied;
          const nextLevel = levelForXp(nextXp);
          let pending = state.pendingLevelUps.filter((evt) => evt.level <= nextLevel);
          const titles = { ...state.levelTitles };
          if (nextLevel > state.level) {
            const completions = state.completions.slice(-8);
            for (let lvl = state.level + 1; lvl <= nextLevel; lvl++) {
              pending = [...pending, { level: lvl, totalXp: nextXp, completions, triggeredAt: Date.now() }];
              if (!titles[lvl]) {
                titles[lvl] = { title: `Уровень ${lvl}`, assignedAt: Date.now() };
              }
            }
          }
          const appliedNote = meta
            ? `Самочувствие ${dateKey}: осозн. ${meta.awareness}, эфф. ${meta.efficiency}, радость ${meta.joy}`
            : `Бонус за ${dateKey}`;
          const entryTs = Date.parse(`${dateKey}T12:00:00Z`);
          const history: XPEntry[] = [...state.xpHistory, {
            id: crypto.randomUUID(),
            amount: applied,
            source: 'bonus' as XpSource,
            note: appliedNote,
            ts: Number.isFinite(entryTs) ? entryTs : Date.now(),
          }].slice(-MAX_HISTORY);
          return {
            xp: nextXp,
            level: nextLevel,
            xpHistory: history,
            pendingLevelUps: pending,
            levelTitles: titles,
            claimedBonuses: {
              ...state.claimedBonuses,
              [dateKey]: {
                xp: prevXp + applied,
                ts: Date.now(),
                meta,
              },
            },
          };
        });
      },
      enqueueManualCompletion: (candidate) => {
        set((state) => {
          if (state.pendingManualCandidates.some((c) => c.id === candidate.id)) {
            return {};
          }
          return { pendingManualCandidates: [...state.pendingManualCandidates, candidate] };
        });
      },
      removeManualCompletion: (id) => {
        set((state) => ({
          pendingManualCandidates: state.pendingManualCandidates.filter((c) => c.id !== id),
        }));
      },
    }),
    {
      name: 'GAMIFICATION_STATE_V1',
      storage,
      partialize: (state) => ({
        xp: state.xp,
        level: state.level,
        xpHistory: state.xpHistory,
        completions: state.completions,
        processedTasks: state.processedTasks,
        achievements: state.achievements,
        levelTitles: state.levelTitles,
        claimedBonuses: state.claimedBonuses,
        pendingLevelUps: state.pendingLevelUps,
        pendingManualCandidates: state.pendingManualCandidates,
      }),
    }
  )
);
