import { getLogger } from './logger';

const log = getLogger('imageSearch');

interface CSEImageItem {
  link?: string;
  image?: {
    thumbnailLink?: string;
  };
}

interface CSEApiResponse {
  items?: CSEImageItem[];
}

interface OpenverseItem {
  url?: string;
  thumbnail?: string;
}

interface OpenverseResponse {
  results?: OpenverseItem[];
}

interface WikipediaPage {
  pageid?: number;
  title?: string;
  thumbnail?: { source?: string };
  original?: { source?: string };
}

interface WikipediaResponse {
  query?: { pages?: Record<string, WikipediaPage> };
}

interface QwantImageItem {
  media?: string;
  thumbnail?: string;
}

interface QwantImageResponse {
  status?: string;
  data?: {
    result?: {
      items?: QwantImageItem[];
    };
  };
}

function ensureHttps(url: string): string {
  if (url.startsWith('http://')) {
    return `https://${url.slice(7)}`;
  }
  return url;
}

/**
 * Unsplash Source fallback (no API key required). Returns a URL that redirects
 * to a random image relevant to the query. We keep size at 600x600 to match UI.
 */
export function fallbackImageFromUnsplash(query: string, w = 600, h = 600): string {
  const q = encodeURIComponent(query);
  return `https://source.unsplash.com/${w}x${h}/?${q}`;
}

/**
 * Picsum seeded fallback: always returns an image and is cacheable.
 * Seed ensures stable image per title/kind.
 */
export function seededPicsumImage(seed: string, w = 600, h = 600): string {
  const s = encodeURIComponent(seed.trim() || 'cover');
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function placeholderDataUri(text: string, w = 600, h = 600): string {
  const safe = xmlEscape(text);
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='#f2f2f2'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif' font-size='24' fill='#888'>${safe}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export async function fetchFirstImageFromOpenverse(query: string): Promise<string | undefined> {
  try {
    const cacheKey = `img:openverse:${query.toLowerCase()}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { url?: string; ts?: number } | null;
        if (parsed?.url && typeof parsed.ts === 'number') {
          const ageDays = (Date.now() - parsed.ts) / (1000 * 60 * 60 * 24);
          if (ageDays <= 14) {
            return parsed.url;
          }
        }
      }
    } catch {/* noop */}

    const q = encodeURIComponent(query.trim());
    if (!q) return undefined;
    const resp = await fetch(`https://api.openverse.engineering/v1/images/?page_size=5&mature=false&format=json&q=${q}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      log.warn('openverse:bad_status', { status: resp.status });
      return undefined;
    }
    const data: OpenverseResponse = await resp.json();
    // Лучше использовать thumbnail (статический прямой jpeg), чем оригинальный url (может быть html-страницей)
    const pick = data?.results?.find((item) => item?.thumbnail || item?.url);
    if (pick) {
      const candidate = pick.thumbnail || pick.url;
      if (typeof candidate === 'string' && candidate) {
        const url = ensureHttps(candidate);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ url, ts: Date.now() }));
        } catch {/* noop */}
        return url;
      }
    }
  } catch (e) {
    log.warn('openverse:error', e as Error);
  }
  return undefined;
}

function normalizeCacheKey(prefix: string, text: string): string {
  return `${prefix}:${text.toLowerCase()}`;
}

async function loadWikipediaImage(lang: string, title: string): Promise<string | undefined> {
  const key = normalizeCacheKey(`img:wikipedia:${lang}`, title);
  try {
    const cachedRaw = localStorage.getItem(key);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as { url?: string; ts?: number } | null;
      if (cached?.url && typeof cached.ts === 'number') {
        const ageDays = (Date.now() - cached.ts) / (1000 * 60 * 60 * 24);
        if (ageDays <= 30) {
          return cached.url;
        }
      }
    }
  } catch { /* noop */ }

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: '600',
    titles: title,
  });
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;
  const resp = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    log.warn('wikipedia:bad_status', { lang, title, status: resp.status });
    return undefined;
  }
  const data: WikipediaResponse = await resp.json();
  const pages = data?.query?.pages;
  if (pages && typeof pages === 'object') {
    for (const page of Object.values(pages)) {
      const candidate = page?.thumbnail?.source || page?.original?.source;
      if (typeof candidate === 'string' && candidate) {
        const url = ensureHttps(candidate);
        try {
          localStorage.setItem(key, JSON.stringify({ url, ts: Date.now() }));
        } catch { /* noop */ }
        return url;
      }
    }
  }
  return undefined;
}

export async function fetchFirstImageFromWikipedia(title: string, extraVariants: string[] = []): Promise<string | undefined> {
  const base = title.trim();
  const variants = [base, ...extraVariants.map((v) => v.trim())].filter((v) => v.length > 0);
  if (!variants.length) return undefined;
  const langs = ['ru', 'en'];
  for (const variant of variants) {
    for (const lang of langs) {
      try {
        const result = await loadWikipediaImage(lang, variant);
        if (result) return result;
      } catch (e) {
        log.warn('wikipedia:error', { lang, title: variant, error: String(e instanceof Error ? e.message : e) });
      }
    }
  }
  return undefined;
}

export async function fetchFirstImageFromQwant(query: string): Promise<string | undefined> {
  try {
    const normalized = query.trim();
    if (!normalized) return undefined;
    const cacheKey = `img:qwant:${normalized.toLowerCase()}`;
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { url?: string; ts?: number } | null;
        if (cached?.url && typeof cached.ts === 'number') {
          const ageDays = (Date.now() - cached.ts) / (1000 * 60 * 60 * 24);
          if (ageDays <= 7) {
            return cached.url;
          }
        }
      }
    } catch { /* noop */ }

    const q = encodeURIComponent(normalized);
    const resp = await fetch(`https://api.qwant.com/v3/search/images?count=10&q=${q}&t=images&safesearch=1&locale=ru_ru&uiv=4`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      log.warn('qwant:bad_status', { status: resp.status });
      return undefined;
    }
    const data: QwantImageResponse = await resp.json();
    const item = data?.data?.result?.items?.find((it) => (typeof it?.media === 'string' && it.media) || (typeof it?.thumbnail === 'string' && it.thumbnail));
    const candidate = item?.media || item?.thumbnail;
    if (typeof candidate === 'string' && candidate) {
      const url = ensureHttps(candidate);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ url, ts: Date.now() }));
      } catch { /* noop */ }
      return url;
    }
  } catch (e) {
    log.warn('qwant:error', e as Error);
  }
  return undefined;
}

export function buildFallbackList(kind: 'book' | 'game' | 'movie' | 'purchase', title: string, existing?: string): string[] {
  const list: string[] = [];
  if (existing && !existing.trim().startsWith('data:')) list.push(existing);
  const t = title.trim();
  if (kind === 'book') {
    list.push(
      fallbackImageFromUnsplash(`${t} book cover`),
      fallbackImageFromUnsplash(`Книга ${t}`),
      fallbackImageFromUnsplash(t),
      fallbackImageFromUnsplash('book cover'),
      seededPicsumImage(`book-${t}`)
    );
  } else if (kind === 'game') {
    list.push(
      fallbackImageFromUnsplash(`${t} game cover`),
      fallbackImageFromUnsplash(`Игра ${t}`),
      fallbackImageFromUnsplash(t),
      fallbackImageFromUnsplash('video game cover'),
      seededPicsumImage(`game-${t}`)
    );
  } else if (kind === 'movie') {
    list.push(
      fallbackImageFromUnsplash(`${t} movie poster`),
      fallbackImageFromUnsplash(`Фильм ${t}`),
      fallbackImageFromUnsplash(t),
      fallbackImageFromUnsplash('movie poster'),
      seededPicsumImage(`movie-${t}`)
    );
  } else {
    // purchase
    list.push(
      fallbackImageFromUnsplash(`${t} product photo`),
      fallbackImageFromUnsplash(`Товар ${t}`),
      fallbackImageFromUnsplash(t),
      fallbackImageFromUnsplash('shopping product'),
      seededPicsumImage(`purchase-${t}`)
    );
  }
  list.push(placeholderDataUri('Нет изображения'));
  // remove duplicates
  return Array.from(new Set(list));
}

/**
 * Fetch first image URL from Google Custom Search (Image) API.
 * Requires VITE_GOOGLE_CSE_KEY and VITE_GOOGLE_CSE_CX to be set in env.
 * Returns https URL or undefined if not found/failed.
 */
export async function fetchFirstImageFromGoogle(query: string): Promise<string | undefined> {
  try {
    // Try cache first (7 days)
    const cacheKey = `img:cse:${query.toLowerCase()}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const obj = JSON.parse(raw) as { url: string; ts: number };
        const ageDays = (Date.now() - obj.ts) / (1000 * 60 * 60 * 24);
        if (obj.url && ageDays <= 7) {
          return obj.url;
        }
      }
    } catch { /* noop */ }

    const key = import.meta.env.VITE_GOOGLE_CSE_KEY as string | undefined;
    const cx = import.meta.env.VITE_GOOGLE_CSE_CX as string | undefined;
    if (!key || !cx) {
      log.warn('Google CSE is not configured (VITE_GOOGLE_CSE_KEY / VITE_GOOGLE_CSE_CX)');
      return undefined;
    }
    const q = encodeURIComponent(query);
    const url = `https://www.googleapis.com/customsearch/v1?searchType=image&num=1&safe=active&q=${q}&key=${key}&cx=${cx}`;
    const r = await fetch(url);
    if (!r.ok) {
      log.warn('CSE:bad_status', { status: r.status });
      return undefined;
    }
    const j: CSEApiResponse = await r.json();
    const link: string | undefined = j?.items?.[0]?.link || j?.items?.[0]?.image?.thumbnailLink;
    if (typeof link === 'string' && link) {
      const httpsUrl = link.replace('http://', 'https://');
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ url: httpsUrl, ts: Date.now() }));
      } catch { /* noop */ }
      return httpsUrl;
    }
  } catch (e) {
    log.warn('CSE:error', e as Error);
  }
  return undefined;
}
