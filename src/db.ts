import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { AnyNode, LinkThread, User, BookItem, MovieItem, GameItem, PurchaseItem, DiaryEntry } from './types';
import { getLogger } from './logger';

export class DetectiveDB extends Dexie {
  nodes!: Table<AnyNode, string>;
  links!: Table<LinkThread, string>;
  users!: Table<User, string>;
  books!: Table<BookItem, string>;
  movies!: Table<MovieItem, string>;
  games!: Table<GameItem, string>;
  purchases!: Table<PurchaseItem, string>;
  diary!: Table<DiaryEntry, string>;

  constructor() {
    super('detective_board_db');
    this.version(1).stores({
      nodes: 'id, parentId, type, updatedAt',
      links: 'id, fromId, toId',
      users: 'id, name',
    });
    // v2: add books and movies tables
    this.version(2).stores({
      nodes: 'id, parentId, type, updatedAt',
      links: 'id, fromId, toId',
      users: 'id, name',
      books: 'id, title, createdAt',
      movies: 'id, title, createdAt',
    });
    // v3: add games table
    this.version(3).stores({
      nodes: 'id, parentId, type, updatedAt',
      links: 'id, fromId, toId',
      users: 'id, name',
      books: 'id, title, createdAt',
      movies: 'id, title, createdAt',
      games: 'id, title, createdAt',
    });
    // v4: add purchases table
    this.version(4).stores({
      nodes: 'id, parentId, type, updatedAt',
      links: 'id, fromId, toId',
      users: 'id, name',
      books: 'id, title, createdAt',
      movies: 'id, title, createdAt',
      games: 'id, title, createdAt',
      purchases: 'id, title, createdAt',
    });
    // v5: add diary table
    this.version(5).stores({
      nodes: 'id, parentId, type, updatedAt',
      links: 'id, fromId, toId',
      users: 'id, name',
      books: 'id, title, createdAt',
      movies: 'id, title, createdAt',
      games: 'id, title, createdAt',
      purchases: 'id, title, createdAt',
      diary: 'id, date, createdAt',
    });
  }
}

const log = getLogger('db');
log.info('dexie:construct');
export const db = new DetectiveDB();
log.info('dexie:ready');
