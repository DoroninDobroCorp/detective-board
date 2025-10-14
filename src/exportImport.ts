import { db } from './db';
import { getLogger } from './logger';
import type { AnyNode, LinkThread, User, BookItem, MovieItem, GameItem, PurchaseItem } from './types';
import { useAppStore } from './store';
import { buildAssistantContext, type AssistantContextData } from './assistant/context';
import { loadMessages, loadPrompt, loadSavedInfo, todayKey } from './assistant/storage';

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
};

const log = getLogger('backup');

function makeFilename() {
  const iso = new Date().toISOString().replace(/[:]/g, '-');
  return `detective-board-backup-${iso}.json`;
}

export async function getBackupData(): Promise<BackupData> {
  const [nodes, links, users, books, movies, games, purchases] = await Promise.all([
    db.nodes.toArray(),
    db.links.toArray(),
    db.users.toArray(),
    db.books.toArray(),
    db.movies.toArray(),
    db.games.toArray(),
    db.purchases.toArray(),
  ]);
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

  if (mode === 'replace') {
    await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases], async () => {
      await db.nodes.clear();
      await db.links.clear();
      await db.users.clear();
      await db.books.clear();
      await db.movies.clear();
      await db.games.clear();
      await db.purchases.clear();
      if (nodes.length) await db.nodes.bulkAdd(nodes);
      if (links.length) await db.links.bulkAdd(links);
      if (users.length) await db.users.bulkAdd(users);
      if (books.length) await db.books.bulkAdd(books);
      if (movies.length) await db.movies.bulkAdd(movies);
      if (games.length) await db.games.bulkAdd(games);
      if (purchases.length) await db.purchases.bulkAdd(purchases);
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
    log.info('import:replace:done', { nodes: nodes.length, links: links.length, users: users.length, books: books.length, movies: movies.length, games: games.length, purchases: purchases.length });
  } else {
    // merge: просто дозаписываем id-совместимые сущности, конфликты по id заменяются (put)
    await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases], async () => {
      if (nodes.length) await db.nodes.bulkPut(nodes);
      if (links.length) await db.links.bulkPut(links);
      if (users.length) await db.users.bulkPut(users);
      if (books.length) await db.books.bulkPut(books);
      if (movies.length) await db.movies.bulkPut(movies);
      if (games.length) await db.games.bulkPut(games);
      if (purchases.length) await db.purchases.bulkPut(purchases);
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
    log.info('import:merge:done', { nodes: nodes.length, links: links.length, users: users.length, books: books.length, movies: movies.length, games: games.length, purchases: purchases.length });
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
