import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import type { AnyNode, LinkThread } from '../types';
import { getLogger } from '../logger';
import { runCoverBackfill } from '../coverBackfill';

interface GraphReport {
  nodeCount: number;
  linkCount: number;
  invalidParentIds: Array<{ id: string; parentId: string }>; // parentId points to missing node
  selfParent: string[]; // id where parentId === id
  cycles: string[][]; // list of cycles (ids)
  brokenLinks: Array<{ id: string; fromId?: string; toId?: string }>; // link endpoints missing
}

function analyze(nodes: AnyNode[], links: LinkThread[]): GraphReport {
  const byId = new Map(nodes.map(n => [n.id, n] as const));
  const invalidParentIds: Array<{ id: string; parentId: string }> = [];
  const selfParent: string[] = [];
  for (const n of nodes) {
    if (n.parentId) {
      if (n.parentId === n.id) selfParent.push(n.id);
      if (!byId.has(n.parentId)) invalidParentIds.push({ id: n.id, parentId: n.parentId });
    }
  }
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
      const next: string | null = byId.get(curr)?.parentId ?? null;
      curr = next;
      hops++;
    }
  }
  const brokenLinks: Array<{ id: string; fromId?: string; toId?: string }> = [];
  for (const l of links) {
    const fromOk = byId.has(l.fromId);
    const toOk = byId.has(l.toId);
    if (!fromOk || !toOk) brokenLinks.push({ id: l.id, fromId: fromOk ? undefined : l.fromId, toId: toOk ? undefined : l.toId });
  }
  return { nodeCount: nodes.length, linkCount: links.length, invalidParentIds, selfParent, cycles, brokenLinks };
}

export const DiagPage: React.FC = () => {
  const log = useMemo(() => getLogger('Diag'), []);
  const [nodes, setNodes] = useState<AnyNode[]>([]);
  const [links, setLinks] = useState<LinkThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [covers, setCovers] = useState<{ books: number; booksMissing: number; movies: number; moviesMissing: number; games: number; gamesMissing: number; purchases: number; purchasesMissing: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, l] = await Promise.all([db.nodes.toArray(), db.links.toArray()]);
      setNodes(n); setLinks(l);
      log.info('load:db:snapshot', { nodes: n.length, links: l.length });
      setMessage('');
      try {
        const [books, movies, games, purchases] = await Promise.all([
          db.books.toArray(),
          db.movies.toArray(),
          db.games.toArray(),
          db.purchases.toArray().catch(() => []),
        ]);
        setCovers({
          books: books.length,
          booksMissing: books.filter(b => !b.coverUrl).length,
          movies: movies.length,
          moviesMissing: movies.filter(m => !m.coverUrl).length,
          games: games.length,
          gamesMissing: games.filter(g => !g.coverUrl).length,
          purchases: purchases.length,
          purchasesMissing: purchases.filter(p => !p.coverUrl).length,
        });
      } catch (e) {
        log.warn('diag:covers:load_failed', { error: String(e instanceof Error ? e.message : e) });
      }
    } finally {
      setLoading(false);
    }
  }, [log]);
  useEffect(() => { void load(); }, [load]);

  const report = useMemo(() => analyze(nodes, links), [nodes, links]);

  const fixInvalidParents = async () => {
    const items = report.invalidParentIds;
    if (items.length === 0 && report.selfParent.length === 0) { setMessage('Нет невалидных parentId'); return; }
    setFixing(true);
    try {
      await db.transaction('rw', [db.nodes], async () => {
        for (const { id } of items) {
          const node = nodes.find(n => n.id === id);
          if (node) await db.nodes.put({ ...node, parentId: null, updatedAt: Date.now() } as AnyNode);
        }
        for (const id of report.selfParent) {
          const node = nodes.find(n => n.id === id);
          if (node) await db.nodes.put({ ...node, parentId: null, updatedAt: Date.now() } as AnyNode);
        }
      });
      setMessage(`Исправлено parentId: ${items.length + report.selfParent.length}`);
      await load();
    } finally {
      setFixing(false);
    }
  };

  const breakCycles = async () => {
    const cyc = report.cycles;
    if (cyc.length === 0) { setMessage('Циклы не найдены'); return; }
    setFixing(true);
    try {
      await db.transaction('rw', [db.nodes], async () => {
        for (const cycle of cyc) {
          // простая стратегия: у первого элемента цикла parentId -> null
          const first = cycle[0];
          const node = nodes.find(n => n.id === first);
          if (node && node.parentId) {
            await db.nodes.put({ ...node, parentId: null, updatedAt: Date.now() } as AnyNode);
          }
        }
      });
      setMessage(`Разорвано циклов: ${cyc.length}`);
      await load();
    } finally {
      setFixing(false);
    }
  };

  const removeBrokenLinks = async () => {
    const broken = report.brokenLinks;
    if (broken.length === 0) { setMessage('Битые ссылки не найдены'); return; }
    setFixing(true);
    try {
      await db.links.bulkDelete(broken.map(b => b.id));
      setMessage(`Удалено битых ссылок: ${broken.length}`);
      await load();
    } finally {
      setFixing(false);
    }
  };

  const clearSWAndCaches = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map(k => caches.delete(k)));
      }
      setMessage('SW и Cache очищены. Перезагрузите страницу.');
    } catch (e) {
      setMessage('Не удалось очистить SW/Cache: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="active-page">
      <div className="active-page__header">
        <Link to="/" className="tool-link">← Назад к доске</Link>
        <h1>Диагностика БД</h1>
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 820 }}>
        <div>Узлы: <b>{report.nodeCount}</b>, Связи: <b>{report.linkCount}</b></div>
        <div>Невалидные parentId: <b>{report.invalidParentIds.length}</b>; Самоссылающиеся: <b>{report.selfParent.length}</b>; Циклы: <b>{report.cycles.length}</b>; Битые ссылки: <b>{report.brokenLinks.length}</b></div>
        {covers ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Обложки</div>
            <div>Книги: {covers.books} (без обложки: {covers.booksMissing})</div>
            <div>Фильмы: {covers.movies} (без обложки: {covers.moviesMissing})</div>
            <div>Игры: {covers.games} (без обложки: {covers.gamesMissing})</div>
            <div>Покупки: {covers.purchases} (без обложки: {covers.purchasesMissing})</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="tool-btn" onClick={() => { void load(); }} disabled={loading}>Обновить</button>
              <button
                className="tool-btn"
                onClick={async () => {
                  setFixing(true);
                  try {
                    await runCoverBackfill(200);
                    await load();
                    setMessage('Бэкфилл обложек выполнен');
                  } finally { setFixing(false); }
                }}
                disabled={fixing}
              >Запустить бэкфилл обложек</button>
            </div>
          </div>
        ) : null}
        {report.invalidParentIds.length > 0 && (
          <details>
            <summary>Список невалидных parentId</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(report.invalidParentIds.slice(0, 50), null, 2)}</pre>
          </details>
        )}
        {report.cycles.length > 0 && (
          <details>
            <summary>Примеры циклов</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(report.cycles.slice(0, 10), null, 2)}</pre>
          </details>
        )}
        {report.brokenLinks.length > 0 && (
          <details>
            <summary>Битые ссылки</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(report.brokenLinks.slice(0, 50), null, 2)}</pre>
          </details>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="tool-btn" onClick={() => { void load(); }} disabled={loading}>Обновить</button>
          <button className="tool-btn" onClick={() => { void fixInvalidParents(); }} disabled={fixing}>Починить невалидные parentId и самоссылки</button>
          <button className="tool-btn" onClick={() => { void breakCycles(); }} disabled={fixing}>Разорвать циклы</button>
          <button className="tool-btn" onClick={() => { void removeBrokenLinks(); }} disabled={fixing}>Удалить битые связи</button>
          <button className="tool-btn" onClick={() => { void clearSWAndCaches(); }} disabled={fixing}>Очистить SW/Cache для origin</button>
        </div>
        {message ? <div className="badge">{message}</div> : null}
      </div>
    </div>
  );
};

export default DiagPage;
