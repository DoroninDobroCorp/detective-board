import { db } from './db';
import { getLogger } from './logger';
import { buildFallbackList, fetchFirstImageFromGoogle, fetchFirstImageFromOpenverse, fetchFirstImageFromQwant, fetchFirstImageFromWikipedia } from './imageSearch';
import { resolveBookCover, resolveGameCover, resolveMoviePoster, resolvePurchaseImage } from './coverBackfill';

const log = getLogger('coverAudit');

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function loadImageOk(src: string, maxMs = 12000): Promise<boolean> {
  return timeout(new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  }), maxMs).catch(() => false);
}

function unique(list: string[]): string[] { return Array.from(new Set(list.filter(Boolean))); }

function shouldReprocessCover(url?: string): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('data:')) return true;
  return false;
}

async function candidateUrls(kind: 'book'|'movie'|'game'|'purchase', title: string, existing?: string): Promise<string[]> {
  const base = buildFallbackList(kind, title, existing);
  const t = title.trim();
  const dyn: string[] = [];
  // domain-specific resolvers first (usually более точные)
  try {
    if (kind === 'book') { const u = await resolveBookCover(t); if (u) dyn.push(u); }
    else if (kind === 'movie') { const u = await resolveMoviePoster(t); if (u) dyn.push(u); }
    else if (kind === 'game') { const u = await resolveGameCover(t); if (u) dyn.push(u); }
    else { const u = await resolvePurchaseImage(t); if (u) dyn.push(u); }
  } catch (e) { log.warn('resolver_failed', { kind, title, error: String(e instanceof Error ? e.message : e) }); }
  // Openverse, Google (дополнительно)
  try {
    const q = kind === 'book' ? `${t} book cover`
      : kind === 'movie' ? `${t} movie poster`
      : kind === 'game' ? `${t} game cover`
      : `${t} product photo`;
    const ov = await fetchFirstImageFromOpenverse(q);
    if (ov) dyn.push(ov);
  } catch (e) { log.warn('openverse_failed', { kind, title, error: String(e instanceof Error ? e.message : e) }); }
  try {
    const wiki = kind === 'book'
      ? await fetchFirstImageFromWikipedia(t, [`${t} (book)`, `Книга ${t}`, `${t} роман`])
      : kind === 'movie'
        ? await fetchFirstImageFromWikipedia(t, [`${t} (film)`, `Фильм ${t}`])
        : kind === 'game'
          ? await fetchFirstImageFromWikipedia(t, [`${t} (video game)`, `Игра ${t}`])
          : await fetchFirstImageFromWikipedia(t, [`${t} (product)`, `товар ${t}`]);
    if (wiki) dyn.push(wiki);
  } catch (e) { log.warn('wikipedia_failed', { kind, title, error: String(e instanceof Error ? e.message : e) }); }
  try {
    const q = kind === 'book' ? `${t} book cover`
      : kind === 'movie' ? `${t} movie poster`
      : kind === 'game' ? `${t} game cover`
      : `${t} product photo`;
    const qw = await fetchFirstImageFromQwant(q);
    if (qw) dyn.push(qw);
  } catch (e) { log.warn('qwant_failed', { kind, title, error: String(e instanceof Error ? e.message : e) }); }
  try {
    const q = kind === 'book' ? `${t} book cover OR Книга ${t}`
      : kind === 'movie' ? `${t} movie poster OR Фильм ${t}`
      : kind === 'game' ? `${t} game cover OR Игра ${t}`
      : `${t} product photo OR Товар ${t}`;
    const g = await fetchFirstImageFromGoogle(q);
    if (g) dyn.push(g);
  } catch (e) { log.warn('google_failed', { kind, title, error: String(e instanceof Error ? e.message : e) }); }
  return unique([...dyn, ...base]);
}

async function pickFirstWorking(kind: 'book'|'movie'|'game'|'purchase', title: string, existing?: string): Promise<string|undefined> {
  const urls = await candidateUrls(kind, title, existing);
  for (const u of urls) {
    // Пропускаем data: плейсхолдер — оставим его последним шансом
    if (u.startsWith('data:')) continue;
    const ok = await loadImageOk(u);
    if (ok) return u;
  }
  // если ничего не сработало — вернём последний элемент списка (плейсхолдер)
  return urls[urls.length - 1];
}

export interface AuditResult { updated: number; checked: number; perKind: Record<string, { checked: number; updated: number }>; }

type KindCtx = { kind: 'book'|'movie'|'game'|'purchase'; list: Array<{ id: string; title: string; coverUrl?: string }>; upd: (id: string, url: string) => Promise<unknown> };
export async function auditAndFixAllCovers(limitPerKind = 500, concurrency = 4): Promise<AuditResult> {
  const kinds: KindCtx[] = [];
  const [books, movies, games, purchases] = await Promise.all([
    db.books.toArray(),
    db.movies.toArray(),
    db.games.toArray(),
    db.purchases.toArray().catch(() => []),
  ]);
  kinds.push({ kind: 'book', list: books.map(b => ({ id: b.id, title: b.title, coverUrl: b.coverUrl })), upd: (id, url) => db.books.update(id, { coverUrl: url }) });
  kinds.push({ kind: 'movie', list: movies.map(m => ({ id: m.id, title: m.title, coverUrl: m.coverUrl })), upd: (id, url) => db.movies.update(id, { coverUrl: url }) });
  kinds.push({ kind: 'game', list: games.map(g => ({ id: g.id, title: g.title, coverUrl: g.coverUrl })), upd: (id, url) => db.games.update(id, { coverUrl: url }) });
  kinds.push({ kind: 'purchase', list: purchases.map(p => ({ id: p.id, title: p.title, coverUrl: p.coverUrl })), upd: (id, url) => db.purchases.update(id, { coverUrl: url }) });

  let updated = 0; let checked = 0;
  const perKind: Record<string, { checked: number; updated: number }> = {};

  for (const K of kinds) {
    perKind[K.kind] = { checked: 0, updated: 0 };
    const pending = K.list.filter((x) => shouldReprocessCover(x.coverUrl));
    const queue = (Number.isFinite(limitPerKind) ? pending.slice(0, limitPerKind) : pending.slice());
    const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => (async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        try {
          const url = await pickFirstWorking(K.kind, item.title, item.coverUrl);
          perKind[K.kind].checked++; checked++;
          if (url && url !== item.coverUrl) {
            await K.upd(item.id, url);
            perKind[K.kind].updated++; updated++;
          }
        } catch (e) {
          log.warn('audit:item_failed', { kind: K.kind, title: item.title, error: String(e instanceof Error ? e.message : e) });
        }
      }
    })());
    await Promise.all(workers);
  }

  log.info('audit:done', { updated, checked, perKind });
  return { updated, checked, perKind };
}
