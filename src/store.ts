import { create } from 'zustand';
import { db, type HistoryEntry } from './db';
import type { AnyNode, GroupNode, LinkThread, TaskNode, Tool, TaskStatus, PersonNode, PersonRole } from './types';
import { getLogger } from './logger';
import { computeNextDueDate, toIsoUTCFromYMD } from './recurrence';
import { useGamificationStore } from './gamification';
import { DebouncedBatcher } from './utils/debounce';

export interface AppState {
  nodes: AnyNode[];
  links: LinkThread[];
  users: { id: string; name: string; emoji?: string }[];

  viewport: { x: number; y: number; scale: number };
  currentParentId: string | null; // null = root
  // Запоминаем последний вид для каждого уровня (ключ '__ROOT__' для null)
  levelView: Record<string, { x: number; y: number; scale: number }>;

  tool: Tool;
  selection: string[]; // selected node ids
  editingNodeId: string | null;
  linkSelection: string[]; // selected link ids
  
  // КРИТИЧНО: Храним pendingLinkFrom в store чтобы избежать проблем с замыканиями!
  pendingLinkFrom: string | null;

  // history
  historyPast: Array<{ 
    nodes: AnyNode[]; 
    links: LinkThread[]; 
    viewport: { x: number; y: number; scale: number }; 
    currentParentId: string | null;
    gamification?: {
      xp: number;
      level: number;
      xpHistory: any[];
      completions: any[];
      processedTasks: Record<string, boolean>;
    };
  }>;
  historyFuture: Array<{ 
    nodes: AnyNode[]; 
    links: LinkThread[]; 
    viewport: { x: number; y: number; scale: number }; 
    currentParentId: string | null;
    gamification?: {
      xp: number;
      level: number;
      xpHistory: any[];
      completions: any[];
      processedTasks: Record<string, boolean>;
    };
  }>;

  // perf
  perfModeOverride: 'auto' | 'perf' | 'super';

  // init/load
  initialized: boolean;
  init: () => Promise<void>;
  resetAll: () => Promise<void>;

  // CRUD nodes
  addTask: (partial: Partial<Omit<TaskNode, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'width' | 'height'>>) => Promise<string>;
  addGroup: (name: string, position?: { x: number; y: number }) => Promise<string>;
  addPerson: (name?: string, role?: PersonRole, position?: { x: number; y: number }) => Promise<string>;
  updateNode: (id: string, patch: Partial<AnyNode>) => Promise<void>;
  updateNodeOptimized: (id: string, patch: Partial<AnyNode>) => void;
  flushPendingUpdates: (id?: string) => Promise<void>;
  moveNode: (id: string, x: number, y: number) => Promise<void>;
  moveNodeLocal: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => Promise<void>;
  deleteSelection: () => Promise<void>;
  groupSelection: (name?: string) => Promise<string | null>;

  // links
  addLink: (fromId: string, toId: string, color?: string) => Promise<string>;
  updateLink: (id: string, patch: Partial<LinkThread>) => Promise<void>;
  removeLink: (id: string) => Promise<void>;

  // navigation
  enterGroup: (id: string) => void;
  goUp: () => void;
  revealNode: (id: string) => void;

  // history actions
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  // ui
  setTool: (t: Tool) => void;
  setSelection: (ids: string[]) => void;
  setEditingNodeId: (id: string | null) => void;
  setLinkSelection: (ids: string[]) => void;
  setViewport: (vp: { x: number; y: number; scale: number }) => void;
  setPerfModeOverride: (mode: 'auto' | 'perf' | 'super') => void;
  setPendingLinkFrom: (id: string | null) => void;

  // helpers
  visibleNodes: () => AnyNode[];
  getNode: (id: string) => AnyNode | undefined;
  groupHasActive: (groupId: string) => boolean;
}

function now() {
  return Date.now();
}

const log = getLogger('store');

// Helper to capture current gamification state for history
function captureGamificationState() {
  try {
    const gamState = useGamificationStore.getState();
    return {
      xp: gamState.xp,
      level: gamState.level,
      xpHistory: [...gamState.xpHistory],
      completions: [...gamState.completions],
      processedTasks: { ...gamState.processedTasks },
      achievements: [...gamState.achievements],
      levelTitles: { ...gamState.levelTitles },
      claimedBonuses: { ...gamState.claimedBonuses },
      pendingLevelUps: [...gamState.pendingLevelUps],
      pendingManualCandidates: [...gamState.pendingManualCandidates],
    };
  } catch (err) {
    log.warn('captureGamificationState:failed', { error: String(err instanceof Error ? err.message : err) });
    return undefined;
  }
}

// Helper to save history stack to database
async function saveHistoryToDb(past: HistoryEntry[], future: HistoryEntry[]) {
  try {
    await db.history.put({
      id: 'history_state',
      past,
      future,
      updatedAt: Date.now(),
    });
    log.info('saveHistoryToDb:success', { pastLength: past.length, futureLength: future.length });
  } catch (err) {
    log.error('saveHistoryToDb:failed', { error: String(err instanceof Error ? err.message : err) });
  }
}

// Helper to load history stack from database
async function loadHistoryFromDb(): Promise<{ past: HistoryEntry[]; future: HistoryEntry[] }> {
  try {
    const historyState = await db.history.get('history_state');
    if (historyState) {
      log.info('loadHistoryFromDb:success', { pastLength: historyState.past.length, futureLength: historyState.future.length });
      return {
        past: historyState.past,
        future: historyState.future,
      };
    }
  } catch (err) {
    log.warn('loadHistoryFromDb:failed', { error: String(err instanceof Error ? err.message : err) });
  }
  return { past: [], future: [] };
}

// Helper to push new history entry and persist
function pushHistoryAndSave(get: any, set: any) {
  const s0 = get();
  const newEntry: HistoryEntry = {
    nodes: s0.nodes,
    links: s0.links,
    viewport: s0.viewport,
    currentParentId: s0.currentParentId,
    gamification: captureGamificationState(),
  };
  set((s: any) => ({
    historyPast: [...s.historyPast, newEntry],
    historyFuture: [],
  }));
  // Save to DB asynchronously (don't wait)
  const newPast = [...s0.historyPast, newEntry];
  saveHistoryToDb(newPast, []).catch((err) => {
    log.error('pushHistoryAndSave:save-failed', { error: String(err) });
  });
}

// Debounced batcher for optimized node updates
// Updates UI immediately but batches database writes (300ms delay)
const nodeUpdateBatcher = new DebouncedBatcher<string>(
  async (id, patch: Partial<AnyNode>) => {
    try {
      const currentNode = useAppStore.getState().nodes.find((n) => n.id === id);
      if (!currentNode) {
        log.warn('nodeUpdateBatcher:node-not-found', { id });
        return;
      }
      const updated = { ...currentNode, ...patch, updatedAt: now() };
      await db.nodes.put(updated);
      log.info('nodeUpdateBatcher:persisted', { id, patch });
    } catch (err) {
      log.error('nodeUpdateBatcher:failed', { id, error: String(err instanceof Error ? err.message : err) });
    }
  },
  300,
  (prev, next) => ({ ...prev, ...next }) // Merge patches
);

export const useAppStore = create<AppState>((set, get) => ({
  nodes: [],
  links: [],
  users: [],

  viewport: { x: 0, y: 0, scale: 1 },
  currentParentId: null,
  levelView: {},

  tool: 'none',
  selection: [],
  editingNodeId: null,
  linkSelection: [],
  pendingLinkFrom: null,

  historyPast: [],
  historyFuture: [],

  perfModeOverride: 'auto',

  initialized: false,
  init: async () => {
    log.info('init:start');
    try {
      const [nodes, links, users] = await Promise.all([
        db.nodes.toArray(),
        db.links.toArray(),
        db.users.toArray(),
      ]);

      // Normalize dueDate to midnight UTC and auto-apply recurrence rules on load
      const nodesCopy: AnyNode[] = nodes.slice();
      const toUpdate: AnyNode[] = [];
      for (let i = 0; i < nodesCopy.length; i++) {
        const n = nodesCopy[i];
        if (n.type === 'task') {
          const t = n as TaskNode;
          // Normalize dueDate to YYYY-MM-DDT00:00:00.000Z
          if (t.dueDate) {
            const key = t.dueDate.slice(0, 10);
            const normalized = toIsoUTCFromYMD(key);
            if (t.dueDate !== normalized) {
              const upd: TaskNode = { ...t, dueDate: normalized, updatedAt: now() };
              nodesCopy[i] = upd; toUpdate.push(upd);
            }
          }
          if (t.recurrence && t.recurrence.kind !== 'none') {
            const nextDue = computeNextDueDate(t.recurrence, new Date());
            if (nextDue) {
              const prevYmd = t.dueDate ? t.dueDate.slice(0, 10) : '';
              const nextYmd = nextDue.slice(0, 10);
              if (prevYmd !== nextYmd) {
                const updated: TaskNode = { ...t, dueDate: nextDue, updatedAt: now() };
                nodesCopy[i] = updated;
                toUpdate.push(updated);
              }
            }
          }
        }
      }
      if (toUpdate.length) {
        await db.nodes.bulkPut(toUpdate);
        log.info('init:recurrence:applied', { updated: toUpdate.length });
      }

      // Dev-only analytics: detect parentId cycles and log a warning to avoid hidden hangs
      try {
        const map = new Map<string, string | null>();
        nodes.forEach((n) => map.set(n.id, n.parentId));
        const cycles: string[][] = [];
        const visitedGlobal = new Set<string>();
        for (const n of nodes) {
          if (visitedGlobal.has(n.id)) continue;
          const seenIdx = new Map<string, number>();
          const path: string[] = [];
          let curr: string | null = n.id; let hops = 0;
          while (curr && !visitedGlobal.has(curr) && hops < 10000) {
            if (seenIdx.has(curr)) {
              const start = seenIdx.get(curr)!;
              const cyc = path.slice(start);
              cycles.push(cyc);
              break;
            }
            seenIdx.set(curr, path.length);
            path.push(curr);
            visitedGlobal.add(curr);
            curr = map.get(curr) ?? null;
            hops++;
          }
        }
        if (cycles.length > 0) {
          log.warn('init:graph:cycles-detected', { count: cycles.length, sample: cycles.slice(0, 3) });
        } else {
          log.info('init:graph:no-cycles');
        }
      } catch (e) {
        log.warn('init:graph:analyze-failed', { error: String(e instanceof Error ? e.message : e) });
      }

      async function tryBootstrapFromFile(): Promise<boolean> {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}bootstrap-backup.json`, { cache: 'no-store' });
          if (!res.ok) return false;
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            log.warn('init:bootstrap:not-json', { contentType });
            return false;
          }
          const data = await res.json();
          const nodesB = Array.isArray((data as any).nodes) ? (data as any).nodes : [];
          const linksB = Array.isArray((data as any).links) ? (data as any).links : [];
          const usersB = Array.isArray((data as any).users) ? (data as any).users : [];
          const booksB = Array.isArray((data as any).books) ? (data as any).books : [];
          const moviesB = Array.isArray((data as any).movies) ? (data as any).movies : [];
          const gamesB = Array.isArray((data as any).games) ? (data as any).games : [];
          const purchasesB = Array.isArray((data as any).purchases) ? (data as any).purchases : [];
          if (nodesB.length === 0 && linksB.length === 0 && usersB.length === 0 && booksB.length === 0 && moviesB.length === 0 && gamesB.length === 0 && purchasesB.length === 0) {
            return false;
          }
          await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases], async () => {
            if (nodesB.length) await db.nodes.bulkAdd(nodesB);
            if (linksB.length) await db.links.bulkAdd(linksB);
            if (usersB.length) await db.users.bulkAdd(usersB);
            if (booksB.length) await db.books.bulkAdd(booksB);
            if (moviesB.length) await db.movies.bulkAdd(moviesB);
            if (gamesB.length) await db.games.bulkAdd(gamesB);
            if (purchasesB.length) await db.purchases.bulkAdd(purchasesB);
          });
          set({ nodes: nodesB, links: linksB, users: usersB, initialized: true });
          log.info('init:bootstrap:imported', { nodes: nodesB.length, links: linksB.length, users: usersB.length });
          return true;
        } catch (e) {
          log.warn('init:bootstrap:failed', { error: String(e instanceof Error ? e.message : e) });
          return false;
        }
      }

      if (nodesCopy.length === 0) {
        // Try to import a bootstrap backup if present
        const imported = await tryBootstrapFromFile();
        if (!imported) {
          // seed demo data
          log.warn('init:empty-db, seeding demo data');
          const rootTask1: TaskNode = {
            id: crypto.randomUUID(),
            type: 'task',
            parentId: null,
            x: 200,
            y: 200,
            width: 200,
            height: 140,
            title: 'Начать доску',
            description: 'Добавить задачи и объединить в группы',
            status: 'in_progress',
            color: '#E8D8A6',
            createdAt: now(),
            updatedAt: now(),
            isActual: true,
          };
          const rootGroup: GroupNode = {
            id: crypto.randomUUID(),
            type: 'group',
            parentId: null,
            x: 520,
            y: 260,
            width: 220,
            height: 220,
            name: 'Закупки',
            color: '#9CC5B0',
            createdAt: now(),
            updatedAt: now(),
            isActual: true,
          };
          const innerTask: TaskNode = {
            id: crypto.randomUUID(),
            type: 'task',
            parentId: rootGroup.id,
            x: 40,
            y: 30,
            width: 200,
            height: 140,
            title: 'Поставщик X',
            description: 'Согласовать партию Y',
            status: 'inactive',
            color: '#F1C0B9',
            createdAt: now(),
            updatedAt: now(),
            isActual: true,
          };
          await db.nodes.bulkAdd([rootTask1, rootGroup, innerTask]);
          set({ nodes: [rootTask1, rootGroup, innerTask], links, users, initialized: true });
          log.info('init:seeded', { nodes: 3, links: links.length, users: users.length });
        }
      } else {
        // Восстановить текущий уровень вложенности из localStorage
        let restoredParentId: string | null = null;
        try {
          const savedParentId = localStorage.getItem('DETECTIVE_BOARD_CURRENT_GROUP');
          if (savedParentId && savedParentId !== 'null') {
            // Проверяем, что группа существует
            const groupExists = nodesCopy.find((n) => n.id === savedParentId && n.type === 'group');
            if (groupExists) {
              restoredParentId = savedParentId;
              log.info('init:restored-group', { groupId: savedParentId });
            } else {
              log.warn('init:saved-group-not-found', { groupId: savedParentId });
            }
          }
        } catch (err) {
          log.warn('init:restore-group-failed', { error: String(err instanceof Error ? err.message : err) });
        }
        
        // Load history stack from database
        const { past, future } = await loadHistoryFromDb();
        
        set({ nodes: nodesCopy, links, users, initialized: true, currentParentId: restoredParentId, historyPast: past, historyFuture: future });
        log.info('init:loaded', { nodes: nodesCopy.length, links: links.length, users: users.length, currentParentId: restoredParentId, historyPast: past.length, historyFuture: future.length });
      }
    } catch (err) {
      // Fallback to in-memory state (no persistence)
      log.error('init:indexeddb-failed, using in-memory state', err);
      // Try to load a bootstrap backup into memory if available
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}bootstrap-backup.json`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const nodesB = Array.isArray((data as any).nodes) ? (data as any).nodes : [];
          const linksB = Array.isArray((data as any).links) ? (data as any).links : [];
          const usersB = Array.isArray((data as any).users) ? (data as any).users : [];
          if (nodesB.length || linksB.length || usersB.length) {
            set({ nodes: nodesB, links: linksB, users: usersB, initialized: true });
            log.info('init:memory-bootstrap', { nodes: nodesB.length, links: linksB.length, users: usersB.length });
            return;
          }
        }
      } catch (e) {
        log.warn('init:memory-bootstrap:failed', { error: String(e instanceof Error ? e.message : e) });
      }
      const rootTask1: TaskNode = {
        id: crypto.randomUUID(),
        type: 'task',
        parentId: null,
        x: 200,
        y: 200,
        width: 200,
        height: 140,
        title: 'Начать доску',
        description: 'Добавить задачи и объединить в группы',
        status: 'in_progress',
        color: '#E8D8A6',
        createdAt: now(),
        updatedAt: now(),
        isActual: true,
      };
      const rootGroup: GroupNode = {
        id: crypto.randomUUID(),
        type: 'group',
        parentId: null,
        x: 520,
        y: 260,
        width: 220,
        height: 220,
        name: 'Закупки',
        color: '#9CC5B0',
        createdAt: now(),
        updatedAt: now(),
        isActual: true,
      };
      const innerTask: TaskNode = {
        id: crypto.randomUUID(),
        type: 'task',
        parentId: rootGroup.id,
        x: 40,
        y: 30,
        width: 200,
        height: 140,
        title: 'Поставщик X',
        description: 'Согласовать партию Y',
        status: 'inactive',
        color: '#F1C0B9',
        createdAt: now(),
        updatedAt: now(),
        isActual: true,
      };
      set({ nodes: [rootTask1, rootGroup, innerTask], links: [], users: [], initialized: true });
      log.info('init:memory-fallback-ready', { nodes: 3, links: 0, users: 0 });
    }
  },
  resetAll: async () => {
    await db.nodes.clear();
    await db.links.clear();
    await db.users.clear();
    await db.books.clear();
    await db.movies.clear();
    set({ nodes: [], links: [], users: [], selection: [], linkSelection: [], historyPast: [], historyFuture: [], currentParentId: null });
    // Очистить сохраненный уровень из localStorage
    try {
      localStorage.removeItem('DETECTIVE_BOARD_CURRENT_GROUP');
    } catch (err) {
      log.warn('resetAll:clear-localStorage-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.warn('resetAll:done');
  },

  addPerson: async (name = 'Новый человек', role: PersonRole = 'employee', position) => {
    pushHistoryAndSave(get, set);
    const id = crypto.randomUUID();
    const colorByRole: Record<PersonRole, string> = {
      employee: '#B3E5FC',
      partner: '#D1C4E9',
      bot: '#FFE082',
    };
    const node: PersonNode = {
      id,
      type: 'person',
      parentId: get().currentParentId,
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      width: 120,
      height: 120,
      role,
      name,
      avatarEmoji: role === 'bot' ? '🤖' : role === 'partner' ? '🤝' : '👤',
      color: colorByRole[role],
      createdAt: now(),
      updatedAt: now(),
      isActual: true,
    };
    await db.nodes.add(node);
    set((s) => ({ nodes: [...s.nodes, node] }));
    log.info('addPerson', { id, role, x: node.x, y: node.y });
    return id;
  },

  deleteSelection: async () => {
    pushHistoryAndSave(get, set);
    const ids = new Set(get().selection);
    const linkIds = new Set(get().linkSelection);
    if (ids.size === 0 && linkIds.size === 0) return;
    log.info('deleteSelection:start', { nodes: Array.from(ids), links: Array.from(linkIds) });
    const all = get().nodes;
    const toRemove = new Set<string>();
    const collect = (nid: string) => {
      toRemove.add(nid);
      all.filter((n) => n.parentId === nid).forEach((child) => collect(child.id));
    };
    Array.from(ids).forEach((id) => collect(id));
    
    // Откатить XP для всех удаляемых задач
    const revertTaskXp = useGamificationStore.getState().revertTaskXp;
    toRemove.forEach((nodeId) => {
      const node = all.find((n) => n.id === nodeId);
      if (node && node.type === 'task' && node.status === 'done') {
        revertTaskXp(nodeId);
      }
    });
    
    if (toRemove.size > 0) {
      await db.nodes.bulkDelete(Array.from(toRemove));
      set((s) => ({
        nodes: s.nodes.filter((n) => !toRemove.has(n.id)),
      }));
    }

    const removedByNodes = get().links.filter((l) => toRemove.has(l.fromId) || toRemove.has(l.toId)).map((l) => l.id);
    const linksToRemove = Array.from(new Set([...removedByNodes, ...Array.from(linkIds)]));
    if (linksToRemove.length) {
      await db.links.bulkDelete(linksToRemove);
      set((s) => ({ links: s.links.filter((l) => !linksToRemove.includes(l.id)) }));
    }
    set({ selection: [], linkSelection: [] });
    log.info('deleteSelection:done', { removedNodes: Array.from(toRemove), removedLinks: linksToRemove });
  },

  groupSelection: async (name) => {
    pushHistoryAndSave(get, set);
    const parentId = get().currentParentId;
    const selectedIds = new Set(get().selection);
    const levelNodes = get().nodes.filter((n) => n.parentId === parentId && selectedIds.has(n.id));
    if (levelNodes.length === 0) {
      log.warn('groupSelection:no-nodes-at-level', { parentId });
      return null;
    }

    // compute bounding box
    const minX = Math.min(...levelNodes.map((n) => n.x));
    const minY = Math.min(...levelNodes.map((n) => n.y));
    const maxX = Math.max(...levelNodes.map((n) => n.x + n.width));
    const maxY = Math.max(...levelNodes.map((n) => n.y + n.height));
    const pad = 30;
    const w = maxX - minX;
    const h = maxY - minY;
    const size = Math.max(w, h) + pad * 2;
    const gx = minX - pad;
    const gy = minY - pad;

    const id = crypto.randomUUID();
    const group: GroupNode = {
      id,
      type: 'group',
      parentId,
      x: gx,
      y: gy,
      width: size,
      height: size,
      name: name || 'Группа',
      color: '#9CC5B0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActual: true,
    };

    // persist group
    await db.nodes.add(group);

    // reparent children into group with local coordinates
    const updatedChildren: AnyNode[] = levelNodes.map((n) => ({
      ...n,
      parentId: id,
      x: n.x - gx,
      y: n.y - gy,
      updatedAt: Date.now(),
    }));
    await db.nodes.bulkPut(updatedChildren);

    set((s) => ({
      nodes: [
        ...s.nodes
          .filter((n) => !levelNodes.some((ln) => ln.id === n.id)),
        group,
        ...updatedChildren,
      ],
      selection: [id],
    }));

    log.info('groupSelection:done', { id, name: group.name, children: levelNodes.map((n) => n.id) });
    return id;
  },

  addTask: async (partial) => {
    // history
    pushHistoryAndSave(get, set);
    const id = crypto.randomUUID();
    const node: TaskNode = {
      id,
      type: 'task',
      parentId: partial.parentId ?? get().currentParentId ?? null,
      x: partial.x ?? 0,
      y: partial.y ?? 0,
      width: 200,
      height: 140,
      title: partial.title ?? 'Новая задача',
      description: partial.description,
      dueDate: partial.dueDate,
      priority: partial.priority ?? 'med',
      durationMinutes: partial.durationMinutes,
      status: (partial.status as TaskStatus) ?? 'inactive',
      color: partial.color ?? '#E8D8A6',
      iconEmoji: partial.iconEmoji,
      textSize: partial.textSize,
      subtasks: partial.subtasks,
      recurrence: (partial as any).recurrence,
      everyDayMode: (partial as any).everyDayMode,
      createdAt: now(),
      updatedAt: now(),
      isActual: true,
    };
    await db.nodes.add(node);
    set((s) => ({ nodes: [...s.nodes, node] }));
    log.info('addTask', { id, parentId: node.parentId, x: node.x, y: node.y, title: node.title });
    return id;
  },

  addGroup: async (name, position) => {
    pushHistoryAndSave(get, set);
    const id = crypto.randomUUID();
    const node: GroupNode = {
      id,
      type: 'group',
      parentId: get().currentParentId,
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      width: 200,
      height: 200,
      name: name || 'Группа',
      color: '#AEC6CF',
      createdAt: now(),
      updatedAt: now(),
      isActual: true,
    };
    await db.nodes.add(node);
    set((s) => ({ nodes: [...s.nodes, node] }));
    log.info('addGroup', { id, name: node.name, x: node.x, y: node.y });
    return id;
  },

  updateNode: async (id, patch) => {
    pushHistoryAndSave(get, set);
    const prev = get().nodes.find((n) => n.id === id);
    if (!prev) return;
    
    // Откатить XP если задача меняет статус с 'done' на другой
    if (prev.type === 'task') {
      const prevTask = prev as TaskNode;
      const patchTask = patch as Partial<TaskNode>;
      if (prevTask.status === 'done' && patchTask.status && patchTask.status !== 'done') {
        const revertTaskXp = useGamificationStore.getState().revertTaskXp;
        revertTaskXp(id);
      }
    }
    
    const next = { ...prev, ...patch, updatedAt: now() } as AnyNode;
    await db.nodes.put(next);
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? next : n)) }));
  },

  updateNodeOptimized: (id, patch) => {
    // Immediate UI update (synchronous)
    const prev = get().nodes.find((n) => n.id === id);
    if (!prev) return;
    
    // Handle XP revert for status changes
    if (prev.type === 'task') {
      const prevTask = prev as TaskNode;
      const patchTask = patch as Partial<TaskNode>;
      if (prevTask.status === 'done' && patchTask.status && patchTask.status !== 'done') {
        const revertTaskXp = useGamificationStore.getState().revertTaskXp;
        revertTaskXp(id);
      }
    }
    
    const next = { ...prev, ...patch, updatedAt: now() } as AnyNode;
    // Update UI immediately (synchronous)
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? next : n)) }));
    
    // Schedule debounced database write
    nodeUpdateBatcher.schedule(id, patch);
    
    log.info('updateNodeOptimized', { id, patch, pending: nodeUpdateBatcher.getPendingCount() });
  },

  flushPendingUpdates: async (id) => {
    if (id !== undefined) {
      nodeUpdateBatcher.flush(id);
    } else {
      nodeUpdateBatcher.flush();
    }
    log.info('flushPendingUpdates', { id });
  },

  moveNode: async (id, x, y) => {
    // ОПТИМИЗАЦИЯ: не сохраняем в history при каждом движении (только при dragEnd)
    const prev = get().nodes.find((n) => n.id === id);
    if (!prev) return;
    const next = { ...prev, x, y, updatedAt: now() } as AnyNode;
    await db.nodes.put(next);
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? next : n)) }));
  },

  moveNodeLocal: (id, x, y) => {
    const prev = get().nodes.find((n) => n.id === id);
    if (!prev) return;
    const next = { ...prev, x, y } as AnyNode;
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? next : n)) }));
  },

  removeNode: async (id) => {
    pushHistoryAndSave(get, set);
    // Remove node and its descendants
    log.info('removeNode:start', { id });
    const all = get().nodes;
    const toRemove = new Set<string>();
    const collect = (nid: string) => {
      toRemove.add(nid);
      all.filter((n) => n.parentId === nid).forEach((child) => collect(child.id));
    };
    collect(id);
    
    // Откатить XP для всех удаляемых задач
    const revertTaskXp = useGamificationStore.getState().revertTaskXp;
    toRemove.forEach((nodeId) => {
      const node = all.find((n) => n.id === nodeId);
      if (node && node.type === 'task' && node.status === 'done') {
        revertTaskXp(nodeId);
      }
    });
    
    await db.nodes.bulkDelete(Array.from(toRemove));
    set((s) => ({ nodes: s.nodes.filter((n) => !toRemove.has(n.id)) }));

    // Remove links connected to any removed node
    const linksToRemove = get().links.filter((l) => toRemove.has(l.fromId) || toRemove.has(l.toId)).map((l) => l.id);
    if (linksToRemove.length) {
      await db.links.bulkDelete(linksToRemove);
      set((s) => ({ links: s.links.filter((l) => !linksToRemove.includes(l.id)) }));
    }
  },

  addLink: async (fromId, toId, color = '#C94545') => {
    if (fromId === toId) {
      log.warn('addLink:self-link-blocked', { fromId, toId });
      return '';
    }
    // prevent duplicate link with the same orientation only
    const exists = get().links.some((l) => (l.fromId === fromId && l.toId === toId));
    if (exists) {
      log.warn('addLink:duplicate-blocked', { fromId, toId });
      return '';
    }
    // Сохраняем history только если связь реально создается
    pushHistoryAndSave(get, set);
    const id = crypto.randomUUID();
    const link: LinkThread = { id, fromId, toId, color, dir: 'one' };
    await db.links.add(link);
    set((s) => ({ links: [...s.links, link] }));
    log.info('addLink:success', { id, fromId, toId, color });
    return id;
  },

  updateLink: async (id, patch) => {
    pushHistoryAndSave(get, set);
    const prev = get().links.find((l) => l.id === id);
    if (!prev) return;
    const next = { ...prev, ...patch } as LinkThread;
    await db.links.put(next);
    set((s) => ({ links: s.links.map((l) => (l.id === id ? next : l)) }));
    log.info('updateLink', { id, patch });
  },

  removeLink: async (id) => {
    pushHistoryAndSave(get, set);
    await db.links.delete(id);
    set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
    log.info('removeLink', { id });
  },

  enterGroup: (id) => {
    const node = get().nodes.find((n) => n.id === id && n.type === 'group');
    if (!node) return;
    // сохранить текущий вид для текущего уровня
    const currKey = get().currentParentId ?? '__ROOT__';
    const currVp = get().viewport;
    const saved = { x: currVp.x, y: currVp.y, scale: currVp.scale };
    const targetKey = id;
    const nextVp = get().levelView[targetKey];
    set((s) => ({
      currentParentId: id,
      levelView: { ...s.levelView, [currKey]: saved },
      viewport: nextVp ? { ...nextVp } : s.viewport,
    }));
    // Сохранить текущий уровень в localStorage
    try {
      localStorage.setItem('DETECTIVE_BOARD_CURRENT_GROUP', id);
    } catch (err) {
      log.warn('enterGroup:save-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.info('enterGroup', { id });
  },
  goUp: () => {
    const curr = get().currentParentId;
    if (!curr) return;
    const group = get().nodes.find((n) => n.id === curr && n.type === 'group') as GroupNode | undefined;
    const parentId = group?.parentId ?? null;
    // сохранить текущий вид для текущего уровня
    const currKey = curr;
    const currVp = get().viewport;
    const saved = { x: currVp.x, y: currVp.y, scale: currVp.scale };
    const targetKey = parentId ?? '__ROOT__';
    const nextVp = get().levelView[targetKey];
    set((s) => ({
      currentParentId: parentId,
      levelView: { ...s.levelView, [currKey]: saved },
      viewport: nextVp ? { ...nextVp } : s.viewport,
    }));
    // Сохранить текущий уровень в localStorage
    try {
      localStorage.setItem('DETECTIVE_BOARD_CURRENT_GROUP', parentId === null ? 'null' : parentId);
    } catch (err) {
      log.warn('goUp:save-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.info('goUp', { from: curr, to: parentId });
  },
  revealNode: (id) => {
    const n = get().nodes.find((x) => x.id === id);
    if (!n) return;
    const parentId = ((): string | null => {
      const p = n.parentId;
      // берем ближайшего родителя-группу (если есть)
      return p ?? null;
    })();
    set({ currentParentId: parentId });
    // Сохранить текущий уровень в localStorage
    try {
      localStorage.setItem('DETECTIVE_BOARD_CURRENT_GROUP', parentId === null ? 'null' : parentId);
    } catch (err) {
      log.warn('revealNode:save-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.info('revealNode', { id, parentId });
  },

  undo: async () => {
    const past = get().historyPast;
    if (past.length === 0) return;
    const current = { nodes: get().nodes, links: get().links, viewport: get().viewport, currentParentId: get().currentParentId, gamification: captureGamificationState() };
    const prev = past[past.length - 1];
    set((s) => ({
      historyPast: s.historyPast.slice(0, -1),
      historyFuture: [current, ...s.historyFuture],
      nodes: prev.nodes,
      links: prev.links,
      viewport: prev.viewport,
      currentParentId: prev.currentParentId,
    }));
    
    // Restore gamification state if present
    if (prev.gamification) {
      try {
        const gamStore = useGamificationStore.getState();
        set(() => ({})); // trigger a state update to ensure gamification store updates
        useGamificationStore.setState({
          xp: prev.gamification.xp,
          level: prev.gamification.level,
          xpHistory: prev.gamification.xpHistory,
          completions: prev.gamification.completions,
          processedTasks: prev.gamification.processedTasks,
          achievements: prev.gamification.achievements || gamStore.achievements,
          levelTitles: prev.gamification.levelTitles || gamStore.levelTitles,
          claimedBonuses: prev.gamification.claimedBonuses || gamStore.claimedBonuses,
          pendingLevelUps: prev.gamification.pendingLevelUps || gamStore.pendingLevelUps,
          pendingManualCandidates: prev.gamification.pendingManualCandidates || gamStore.pendingManualCandidates,
        }, false); // partial update to preserve functions
        log.info('undo:gamification-restored', { xp: prev.gamification.xp, level: prev.gamification.level });
      } catch (err) {
        log.warn('undo:gamification-restore-failed', { error: String(err instanceof Error ? err.message : err) });
      }
    }
    
    await db.nodes.clear();
    await db.nodes.bulkAdd(get().nodes);
    await db.links.clear();
    await db.links.bulkAdd(get().links);
    // Сохранить восстановленный уровень в localStorage
    try {
      localStorage.setItem('DETECTIVE_BOARD_CURRENT_GROUP', prev.currentParentId === null ? 'null' : prev.currentParentId);
    } catch (err) {
      log.warn('undo:save-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.info('undo');
  },
  redo: async () => {
    const future = get().historyFuture;
    if (future.length === 0) return;
    const current = { nodes: get().nodes, links: get().links, viewport: get().viewport, currentParentId: get().currentParentId, gamification: captureGamificationState() };
    const next = future[0];
    set((s) => ({
      historyPast: [...s.historyPast, current],
      historyFuture: s.historyFuture.slice(1),
      nodes: next.nodes,
      links: next.links,
      viewport: next.viewport,
      currentParentId: next.currentParentId,
    }));
    
    // Restore gamification state if present
    if (next.gamification) {
      try {
        const gamStore = useGamificationStore.getState();
        set(() => ({})); // trigger a state update to ensure gamification store updates
        useGamificationStore.setState({
          xp: next.gamification.xp,
          level: next.gamification.level,
          xpHistory: next.gamification.xpHistory,
          completions: next.gamification.completions,
          processedTasks: next.gamification.processedTasks,
          achievements: next.gamification.achievements || gamStore.achievements,
          levelTitles: next.gamification.levelTitles || gamStore.levelTitles,
          claimedBonuses: next.gamification.claimedBonuses || gamStore.claimedBonuses,
          pendingLevelUps: next.gamification.pendingLevelUps || gamStore.pendingLevelUps,
          pendingManualCandidates: next.gamification.pendingManualCandidates || gamStore.pendingManualCandidates,
        }, false); // partial update to preserve functions
        log.info('redo:gamification-restored', { xp: next.gamification.xp, level: next.gamification.level });
      } catch (err) {
        log.warn('redo:gamification-restore-failed', { error: String(err instanceof Error ? err.message : err) });
      }
    }
    
    await db.nodes.clear();
    await db.nodes.bulkAdd(get().nodes);
    await db.links.clear();
    await db.links.bulkAdd(get().links);
    // Сохранить восстановленный уровень в localStorage
    try {
      localStorage.setItem('DETECTIVE_BOARD_CURRENT_GROUP', next.currentParentId === null ? 'null' : next.currentParentId);
    } catch (err) {
      log.warn('redo:save-failed', { error: String(err instanceof Error ? err.message : err) });
    }
    log.info('redo');
  },

  setTool: (t) => {
    set({ tool: t });
  },

  setSelection: (ids) => {
    set({ selection: ids, linkSelection: [] });
  },

  setEditingNodeId: (id) => {
    set({ editingNodeId: id });
  },

  setLinkSelection: (ids) => {
    set({ linkSelection: ids, selection: [] });
  },

  setViewport: (vp) => {
    const key = get().currentParentId ?? '__ROOT__';
    set((s) => ({ viewport: vp, levelView: { ...s.levelView, [key]: { x: vp.x, y: vp.y, scale: vp.scale } } }));
  },
  setPerfModeOverride: (mode) => {
    log.info('setPerfModeOverride', { mode });
    set({ perfModeOverride: mode });
  },
  
  setPendingLinkFrom: (id) => {
    console.log('🏪 [STORE] setPendingLinkFrom called with:', id);
    set({ pendingLinkFrom: id });
  },

  visibleNodes: () => {
    const parentId = get().currentParentId;
    const list = get().nodes.filter((n) => n.parentId === parentId);
    return list;
  },

  getNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    return node;
  },

  groupHasActive: (groupId: string): boolean => {
    const all = get().nodes;
    const seen = new Set<string>();
    const rec = (gid: string, depth: number): boolean => {
      if (seen.has(gid)) return false; // break cycles
      if (depth > 1000) return false; // safety
      seen.add(gid);
      const children = all.filter((n) => n.parentId === gid);
      for (const ch of children) {
        if (ch.type === 'task' && (ch.status === 'in_progress' || ch.status === 'active')) return true;
        if (ch.type === 'group' && rec(ch.id, depth + 1)) return true;
      }
      return false;
    };
    const result = rec(groupId, 0);
    return result;
  },
}));
