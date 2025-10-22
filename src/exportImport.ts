import { db } from './db';
import { getLogger } from './logger';
import type { AnyNode, LinkThread, User, BookItem, MovieItem, GameItem, PurchaseItem, DiaryEntry } from './types';
import { useAppStore } from './store';
import { buildAssistantContext, type AssistantContextData } from './assistant/context';
import { loadMessages, loadPrompt, loadSavedInfo, todayKey } from './assistant/storage';
import { useGamificationStore } from './gamification';

export type BackupData = {
  $schema?: string;
  version: 1;
  exportedAt: string; // ISO
  nodes: AnyNode[];
  links: LinkThread[];
  users: User[];
  books: BookItem[];
  movies: MovieItem[];
  games: GameItem[];
  purchases: PurchaseItem[];
  diary: DiaryEntry[];
  gamification?: unknown; // данные геймификации из localStorage
  wellbeing?: {
    raw?: unknown;
    daily?: unknown;
    monthly?: unknown;
  };
  assistant?: {
    savedInfo?: string;
    prompt?: string;
    textProvider?: string;
    mode?: string;
    messages?: Record<string, unknown>;
  };
  localStorageExtra?: Record<string, string>; // все остальные данные из localStorage
};

const log = getLogger('backup');

function makeFilename() {
  const iso = new Date().toISOString().replace(/[:]/g, '-');
  return `detective-board-backup-${iso}.json`;
}

/**
 * Импорт данных геймификации с автопочинкой
 */
async function importGamificationData(
  gamificationData: unknown | undefined,
  nodes: AnyNode[],
  books: BookItem[],
  movies: MovieItem[],
  games: GameItem[],
  purchases: PurchaseItem[]
): Promise<void> {
  if (gamificationData === undefined) {
    log.info('import:gamification:skipped');
    return;
  }

  try {
    const gamif = gamificationData as any;
    
    // Автопочинка 1: очищаем pendingManualCandidates чтобы избежать дубликатов при импорте
    if (gamif.pendingManualCandidates) {
      gamif.pendingManualCandidates = [];
      log.info('import:gamification:auto-fix:cleared-pending-candidates');
    }
    
    // Автопочинка 2: синхронизируем processedTasks со всеми завершенными задачами
    const processedTasks = gamif.processedTasks || {};
    let addedCount = 0;

    // Собираем все завершенные задачи из nodes
    const completedTaskNodes = nodes.filter(
      (n) => n.type === 'task' && (n as any).status === 'done'
    );
    
    for (const task of completedTaskNodes) {
      if (!processedTasks[task.id]) {
        processedTasks[task.id] = true;
        addedCount++;
      }
    }

    // Собираем завершенные элементы из медиаколлекций
    const completedMedia = [
      ...books.filter((item) => item.status === 'done').map((item) => ({ type: 'book', item })),
      ...movies.filter((item) => item.status === 'done').map((item) => ({ type: 'movie', item })),
      ...games.filter((item) => item.status === 'done').map((item) => ({ type: 'game', item })),
      ...purchases.filter((item) => item.status === 'done').map((item) => ({ type: 'purchase', item })),
    ];

    for (const { type, item } of completedMedia) {
      if (typeof item.completedAt === 'number') {
        const completionId = `${type}:${item.id}:${item.completedAt}`;
        if (!processedTasks[completionId]) {
          processedTasks[completionId] = true;
          addedCount++;
        }
      }
    }

    gamif.processedTasks = processedTasks;
    if (addedCount > 0) {
      log.info('import:gamification:auto-fix:processed-tasks', { added: addedCount });
    }
    
    // Сохраняем в localStorage с обёрткой zustand persist
    const zustandFormat = {
      state: gamif,
      version: 0,
    };
    localStorage.setItem('GAMIFICATION_STATE_V1', JSON.stringify(zustandFormat));
    
    // Принудительно перезагружаем zustand store из localStorage
    try {
      // Используем rehydrate чтобы загрузить из localStorage с правильной обёрткой
      await useGamificationStore.persist.rehydrate();
      log.info('import:gamification:rehydrated');
    } catch (rehydrateErr) {
      log.warn('import:gamification:rehydrate-failed', { error: String(rehydrateErr) });
      // Fallback: устанавливаем напрямую
      try {
        useGamificationStore.setState({
          xp: gamif.xp || 0,
          level: gamif.level || 1,
          xpHistory: gamif.xpHistory || [],
          completions: gamif.completions || [],
          processedTasks: gamif.processedTasks || {},
          achievements: gamif.achievements || [],
          levelTitles: gamif.levelTitles || { 1: { title: 'Новичок', assignedAt: Date.now() } },
          claimedBonuses: gamif.claimedBonuses || {},
          pendingLevelUps: gamif.pendingLevelUps || [],
          pendingManualCandidates: gamif.pendingManualCandidates || [],
        });
        log.info('import:gamification:state-updated-fallback');
      } catch (stateErr) {
        log.warn('import:gamification:state-update-failed', { error: String(stateErr) });
      }
    }
    
    log.info('import:gamification:done');
  } catch (err) {
    log.warn('import:gamification:failed', { error: String(err) });
  }
}

export async function getBackupData(): Promise<BackupData> {
  const [nodes, links, users, books, movies, games, purchases, diary] = await Promise.all([
    db.nodes.toArray(),
    db.links.toArray(),
    db.users.toArray(),
    db.books.toArray(),
    db.movies.toArray(),
    db.games.toArray(),
    db.purchases.toArray(),
    db.diary.toArray(),
  ]);
  
  // Экспортируем данные геймификации из localStorage
  let gamification: unknown = undefined;
  try {
    const gamificationRaw = localStorage.getItem('GAMIFICATION_STATE_V1');
    if (gamificationRaw) {
      const parsed = JSON.parse(gamificationRaw);
      // Zustand persist wraps data in {state: {...}, version: ...}, extract the state
      gamification = parsed.state || parsed;
    }
  } catch (err) {
    console.warn('Не удалось экспортировать данные геймификации:', err);
  }
  
  // Экспортируем данные wellbeing
  let wellbeing: BackupData['wellbeing'] = undefined;
  try {
    const rawData = localStorage.getItem('WB_RAW_BY_DAY');
    const dailyData = localStorage.getItem('WB_DAY_AVG_BY_DAY');
    const monthlyData = localStorage.getItem('WB_MONTH_AVG_BY_MONTH');
    if (rawData || dailyData || monthlyData) {
      wellbeing = {
        raw: rawData ? JSON.parse(rawData) : undefined,
        daily: dailyData ? JSON.parse(dailyData) : undefined,
        monthly: monthlyData ? JSON.parse(monthlyData) : undefined,
      };
    }
  } catch (err) {
    console.warn('Не удалось экспортировать данные wellbeing:', err);
  }
  
  // Экспортируем данные ассистента
  let assistant: BackupData['assistant'] = undefined;
  try {
    const savedInfo = localStorage.getItem('ASSISTANT_SAVED_INFO_V1');
    const prompt = localStorage.getItem('ASSISTANT_PROMPT_V1');
    const textProvider = localStorage.getItem('ASSISTANT_TEXT_PROVIDER_V1');
    const mode = localStorage.getItem('ASSISTANT_MODE_V1');
    
    // Собираем все сообщения ассистента
    const messages: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ASSISTANT_MESSAGES_V2:')) {
        const dateKey = key.replace('ASSISTANT_MESSAGES_V2:', '');
        const value = localStorage.getItem(key);
        if (value) {
          try {
            messages[dateKey] = JSON.parse(value);
          } catch { /* skip invalid */ }
        }
      }
    }
    
    if (savedInfo || prompt || textProvider || mode || Object.keys(messages).length > 0) {
      assistant = {
        savedInfo: savedInfo || undefined,
        prompt: prompt || undefined,
        textProvider: textProvider || undefined,
        mode: mode || undefined,
        messages: Object.keys(messages).length > 0 ? messages : undefined,
      };
    }
  } catch (err) {
    console.warn('Не удалось экспортировать данные ассистента:', err);
  }
  
  // Экспортируем все остальные данные из localStorage
  const localStorageExtra: Record<string, string> = {};
  try {
    const knownKeys = new Set([
      'GAMIFICATION_STATE_V1',
      'WB_RAW_BY_DAY',
      'WB_DAY_AVG_BY_DAY',
      'WB_MONTH_AVG_BY_MONTH',
      'ASSISTANT_SAVED_INFO_V1',
      'ASSISTANT_PROMPT_V1',
      'ASSISTANT_TEXT_PROVIDER_V1',
      'ASSISTANT_MODE_V1',
      'LOG_LEVEL',
      'DEBUG_DIAG',
    ]);
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !knownKeys.has(key) && !key.startsWith('ASSISTANT_MESSAGES_V2:')) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          localStorageExtra[key] = value;
        }
      }
    }
  } catch (err) {
    console.warn('Не удалось экспортировать дополнительные данные localStorage:', err);
  }
  
  const data: BackupData = {
    $schema: 'https://example.local/detective-board/backup.schema.json',
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes,
    links,
    users,
    books,
    movies,
    games,
    purchases,
    diary,
    gamification,
    wellbeing,
    assistant,
    localStorageExtra: Object.keys(localStorageExtra).length > 0 ? localStorageExtra : undefined,
  };
  return data;
}

export async function exportBackup(): Promise<void> {
  const data = await getBackupData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = makeFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log.info('export:done', {
      nodes: data.nodes.length,
      links: data.links.length,
      users: data.users.length,
      books: data.books.length,
      movies: data.movies.length,
      games: data.games.length,
      purchases: data.purchases.length,
      diary: data.diary.length,
      hasGamification: !!data.gamification,
      hasWellbeing: !!data.wellbeing,
      hasAssistant: !!data.assistant,
      extraKeys: data.localStorageExtra ? Object.keys(data.localStorageExtra).length : 0,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importBackup(file: File, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
  const text = await file.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('Некорректный JSON'); }
  const data = json as Partial<BackupData>;
  if (!data || data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
    throw new Error('Неподдерживаемый формат бэкапа');
  }
  
  const nodes = data.nodes as AnyNode[];
  const links = data.links as LinkThread[];
  const users = Array.isArray(data.users) ? (data.users as User[]) : [];
  const books = Array.isArray(data.books) ? (data.books as BookItem[]) : [];
  const movies = Array.isArray(data.movies) ? (data.movies as MovieItem[]) : [];
  const games = Array.isArray(data.games) ? (data.games as GameItem[]) : [];
  const purchases = Array.isArray(data.purchases) ? (data.purchases as PurchaseItem[]) : [];
  const diary = Array.isArray(data.diary) ? (data.diary as DiaryEntry[]) : [];
  
  // Импортируем данные wellbeing в localStorage
  if (data.wellbeing) {
    try {
      if (data.wellbeing.raw !== undefined) {
        localStorage.setItem('WB_RAW_BY_DAY', JSON.stringify(data.wellbeing.raw));
      }
      if (data.wellbeing.daily !== undefined) {
        localStorage.setItem('WB_DAY_AVG_BY_DAY', JSON.stringify(data.wellbeing.daily));
      }
      if (data.wellbeing.monthly !== undefined) {
        localStorage.setItem('WB_MONTH_AVG_BY_MONTH', JSON.stringify(data.wellbeing.monthly));
      }
      log.info('import:wellbeing:done');
    } catch (err) {
      console.warn('Не удалось импортировать данные wellbeing:', err);
    }
  }
  
  // Импортируем данные ассистента в localStorage
  if (data.assistant) {
    try {
      if (data.assistant.savedInfo !== undefined) {
        localStorage.setItem('ASSISTANT_SAVED_INFO_V1', data.assistant.savedInfo);
      }
      if (data.assistant.prompt !== undefined) {
        localStorage.setItem('ASSISTANT_PROMPT_V1', data.assistant.prompt);
      }
      if (data.assistant.textProvider !== undefined) {
        localStorage.setItem('ASSISTANT_TEXT_PROVIDER_V1', data.assistant.textProvider);
      }
      if (data.assistant.mode !== undefined) {
        localStorage.setItem('ASSISTANT_MODE_V1', data.assistant.mode);
      }
      if (data.assistant.messages) {
        for (const [dateKey, messages] of Object.entries(data.assistant.messages)) {
          localStorage.setItem(`ASSISTANT_MESSAGES_V2:${dateKey}`, JSON.stringify(messages));
        }
      }
      log.info('import:assistant:done');
    } catch (err) {
      console.warn('Не удалось импортировать данные ассистента:', err);
    }
  }
  
  // Импортируем все остальные данные в localStorage
  if (data.localStorageExtra) {
    try {
      for (const [key, value] of Object.entries(data.localStorageExtra)) {
        localStorage.setItem(key, value);
      }
      log.info('import:localStorage-extra:done', { keys: Object.keys(data.localStorageExtra).length });
    } catch (err) {
      console.warn('Не удалось импортировать дополнительные данные localStorage:', err);
    }
  }

  if (mode === 'replace') {
    await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases, db.diary], async () => {
      await db.nodes.clear();
      await db.links.clear();
      await db.users.clear();
      await db.books.clear();
      await db.movies.clear();
      await db.games.clear();
      await db.purchases.clear();
      await db.diary.clear();
      if (nodes.length) await db.nodes.bulkAdd(nodes);
      if (links.length) await db.links.bulkAdd(links);
      if (users.length) await db.users.bulkAdd(users);
      if (books.length) await db.books.bulkAdd(books);
      if (movies.length) await db.movies.bulkAdd(movies);
      if (games.length) await db.games.bulkAdd(games);
      if (purchases.length) await db.purchases.bulkAdd(purchases);
      if (diary.length) await db.diary.bulkAdd(diary);
    });
    useAppStore.setState({
      nodes,
      links,
      users,
      selection: [],
      linkSelection: [],
      historyPast: [],
      historyFuture: [],
      currentParentId: null,
    });
    
    // Импортируем данные геймификации ПОСЛЕ импорта данных в БД
    await importGamificationData(data.gamification, nodes, books, movies, games, purchases);
    
    log.info('import:replace:done', { nodes: nodes.length, links: links.length, users: users.length, books: books.length, movies: movies.length, games: games.length, purchases: purchases.length, diary: diary.length });
  } else {
    // merge: просто дозаписываем id-совместимые сущности, конфликты по id заменяются (put)
    await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases, db.diary], async () => {
      if (nodes.length) await db.nodes.bulkPut(nodes);
      if (links.length) await db.links.bulkPut(links);
      if (users.length) await db.users.bulkPut(users);
      if (books.length) await db.books.bulkPut(books);
      if (movies.length) await db.movies.bulkPut(movies);
      if (games.length) await db.games.bulkPut(games);
      if (purchases.length) await db.purchases.bulkPut(purchases);
      if (diary.length) await db.diary.bulkPut(diary);
    });
    // синхронизируем стор с БД
    const [n2, l2, u2] = await Promise.all([db.nodes.toArray(), db.links.toArray(), db.users.toArray()]);
    useAppStore.setState((s) => ({
      nodes: n2,
      links: l2,
      users: u2,
      selection: [],
      linkSelection: [],
      historyPast: [],
      historyFuture: [],
      currentParentId: s.currentParentId,
    }));
    
    // Импортируем данные геймификации ПОСЛЕ импорта данных в БД
    const [books2, movies2, games2, purchases2] = await Promise.all([
      db.books.toArray(),
      db.movies.toArray(),
      db.games.toArray(),
      db.purchases.toArray(),
    ]);
    await importGamificationData(data.gamification, n2, books2, movies2, games2, purchases2);
    
    log.info('import:merge:done', { nodes: nodes.length, links: links.length, users: users.length, books: books.length, movies: movies.length, games: games.length, purchases: purchases.length, diary: diary.length });
  }
}

export interface AssistantExportData extends AssistantContextData {
  exportedAt: string;
}

export async function getAssistantExportData(): Promise<AssistantExportData> {
  const dayKey = todayKey();
  const history = loadMessages(dayKey);
  const savedInfo = loadSavedInfo();
  const prompt = loadPrompt();
  const context = await buildAssistantContext({ savedInfo, prompt, messages: history });
  return { ...context, exportedAt: new Date().toISOString() };
}

export async function exportAssistantContext(): Promise<void> {
  const data = await getAssistantExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `assistant-context-${data.generatedAt.replace(/[:]/g, '-')}.json`;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log.info('export:assistant-context', { tasks: data.activeTasks.length, history: data.history.length });
  } finally {
    URL.revokeObjectURL(url);
  }
}
