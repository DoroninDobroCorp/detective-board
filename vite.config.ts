// @ts-nocheck
import { defineConfig, type Plugin, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

type TelegramRatingEntry = {
  awareness: number;
  efficiency: number;
  joy: number;
  ts: number;
};

type TelegramService = {
  start: () => void;
  stop: () => void;
  drainPending: () => TelegramRatingEntry[];
  scheduleNextQuestion: (delayMs?: number) => void;
};

interface TelegramServiceOptions {
  token?: string;
  defaultDelayMs?: number;
}

function createTelegramWellbeingService(options: TelegramServiceOptions): TelegramService {
  const token = (options.token || '').trim();
  const defaultDelayMs = options.defaultDelayMs ?? 60_000;
  const disabledService: TelegramService = {
    start: () => { console.warn(`[tg] TELEGRAM_BOT_TOKEN is not configured, Telegram integration disabled.`); },
    stop: () => {},
    drainPending: () => [],
    scheduleNextQuestion: () => {},
  };
  if (!token) {
    return disabledService;
  }

  const apiBase = `https://api.telegram.org/bot${token}`;
  const pending: TelegramRatingEntry[] = [];
  // Persist chat ids across dev server restarts
  const chatIdsFile = path.join(process.cwd(), '.tg_chat_ids.json');
  const loadChatIds = (): number[] => {
    try {
      if (fs.existsSync(chatIdsFile)) {
        const raw = fs.readFileSync(chatIdsFile, 'utf8');
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
      }
    } catch (e) {
      // ignore read/parse errors
    }
    // allow seeding via env if file is missing
    const seeded = (process.env.TELEGRAM_CHAT_IDS || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    return seeded;
  };
  const chatIds = new Set<number>(loadChatIds());
  const persistChatIds = () => {
    try {
      const arr = Array.from(chatIds.values());
      fs.writeFileSync(chatIdsFile, JSON.stringify(arr, null, 2), 'utf8');
    } catch (e) {
      // non-fatal
    }
  };
  let pollOffset = 0;
  let polling = false;
  let pollInterval: NodeJS.Timeout | null = null;
  let scheduleTimer: NodeJS.Timeout | null = null;
  let started = false;

  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, payload?: Record<string, unknown>) => {
    const now = new Date();
    // Local ISO-like with timezone offset, e.g. 2025-09-23T00:56:50+02:00
    const tzMin = -now.getTimezoneOffset();
    const sign = tzMin >= 0 ? '+' : '-';
    const absMin = Math.abs(tzMin);
    const offH = String(Math.floor(absMin / 60)).padStart(2, '0');
    const offM = String(absMin % 60).padStart(2, '0');
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .replace('Z', `${sign}${offH}:${offM}`);
    const base = `[tg:${level}] ${message}`;
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' ? 'log' : 'info';
    if (payload) console[method](`${localIso} ${base}`, payload);
    else console[method](`${localIso} ${base}`);
  };

  const clampRating = (n: number) => Math.min(10, Math.max(1, Math.round(n)));

  const sendRequest = async <T = unknown>(path: string, init?: RequestInit): Promise<T | undefined> => {
    try {
      const resp = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
      const json = await resp.json() as { ok?: boolean } & T;
      if (!resp.ok || (json as { ok?: boolean }).ok === false) {
        log('warn', 'telegram request failed', { path, status: resp.status, body: json });
        return undefined;
      }
      return json;
    } catch (error) {
      log('error', 'telegram request threw', { path, error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  };

  const sendMessage = async (chatId: number, text: string) => {
    await sendRequest('/sendMessage', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  };

  const storeRatings = async (chatId: number, awareness: number, efficiency: number, joy: number, sourceTs: number | undefined) => {
    const entry: TelegramRatingEntry = {
      awareness: clampRating(awareness),
      efficiency: clampRating(efficiency),
      joy: clampRating(joy),
      ts: sourceTs ? sourceTs * 1000 : Date.now(),
    };
    pending.push(entry);
    log('info', 'rating captured', { chatId, awareness: entry.awareness, efficiency: entry.efficiency, joy: entry.joy });
    await sendMessage(chatId, `Записал: осознанность ${entry.awareness}, эффективность ${entry.efficiency}, удовольствие ${entry.joy}.`);
    // Reschedule next question in 3 hours from now
    scheduleNextQuestion(3 * 60 * 60 * 1000);
  };

  const parseAndStoreRatings = async (chatId: number, text: string, msgTs: number | undefined) => {
    const trimmed = text.trim();
    // Поддерживаем формат X/Y/Z (например, 7/8/9), а также старый формат с пробелами
    const slash = trimmed.match(/^(?:wb\s+)?(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})$/i);
    const spaced = !slash && trimmed.match(/^(?:wb\s+)?(\d{1,2})[\s,;]+(\d{1,2})[\s,;]+(\d{1,2})$/i);
    const m = slash || spaced;
    if (!m) return false;
    const [aw, ef, joy] = m.slice(1, 4).map((val) => clampRating(Number(val)));
    await storeRatings(chatId, aw, ef, joy, msgTs);
    return true;
  };

  const handleCallbackQuery = async (callback: any) => {
    if (!callback || typeof callback !== 'object') return;
    const data = typeof callback.data === 'string' ? callback.data : '';
    const chatId = callback.message?.chat?.id;
    if (typeof chatId !== 'number') return;
    const before = chatIds.size;
    chatIds.add(chatId);
    if (chatIds.size !== before) persistChatIds();
    if (data.startsWith('wb:')) {
      const parts = data.slice(3).split(':');
      if (parts.length === 3) {
        const nums = parts.map((part) => clampRating(Number(part)));
        await storeRatings(chatId, nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, callback.message?.date);
      }
    }
  };

  const handleMessage = async (message: any) => {
    if (!message || typeof message !== 'object') return;
    const chatId = message.chat?.id;
    if (typeof chatId !== 'number') return;
    const before = chatIds.size;
    chatIds.add(chatId);
    if (chatIds.size !== before) persistChatIds();
    if (typeof message.text === 'string') {
      const text: string = message.text;
      if (text.startsWith('/start')) {
        await sendMessage(chatId, 'Привет! Я буду спрашивать про самочувствие каждые 3 часа после твоего отчета. Ответь в формате 7/8/9 (осознанность/эффективность/удовольствие).');
        return;
      }
      if (text.startsWith('/ping')) {
        await sendMessage(chatId, 'pong');
        return;
      }
      const parsed = await parseAndStoreRatings(chatId, text, message.date);
      if (parsed) return;
    }
  };

  const sendQuestion = async () => {
    if (chatIds.size === 0) {
      log('warn', 'question skipped, no chat ids yet');
      scheduleNextQuestion(30_000);
      return;
    }
    const text = 'Как твоё состояние? Пришли ответ в формате 7/8/9 (осознанность/эффективность/удовольствие).';
    let sent = 0;
    for (const chatId of chatIds) {
      const payload = { chat_id: chatId, text };
      const result = await sendRequest('/sendMessage', { method: 'POST', body: JSON.stringify(payload) });
      if (result) sent += 1;
    }
    log('info', 'question sent', { sent, targets: chatIds.size });
    if (sent === 0) {
      // Network might be down; retry soon instead of waiting for the next fixed slot
      const retryDelay = Math.min(2 * 60_000, computeNextSlotDelayMs(new Date()));
      scheduleNextQuestion(retryDelay);
    } else {
      scheduleNextQuestion();
    }
  };

  const pollUpdates = async () => {
    if (polling) return;
    polling = true;
    try {
      const qs = new URLSearchParams({ timeout: '0', offset: String(pollOffset) }).toString();
      const resp = await fetch(`${apiBase}/getUpdates?${qs}`);
      const data = await resp.json() as { ok?: boolean; result?: any[] };
      if (!resp.ok || !data.ok) {
        log('warn', 'getUpdates failed', { status: resp.status, body: data });
        return;
      }
      const updates = Array.isArray(data.result) ? data.result : [];
      for (const update of updates) {
        if (typeof update?.update_id === 'number') pollOffset = Math.max(pollOffset, update.update_id + 1);
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      log('error', 'polling error', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      polling = false;
    }
  };

  const ensurePolling = () => {
    if (pollInterval) return;
    pollInterval = setInterval(() => { void pollUpdates(); }, 5_000);
    void pollUpdates();
  };

  // Default: 3 hours from current time (dynamic intervals)
  const computeNextSlotDelayMs = (_from: Date = new Date()): number => {
    // Always return 3 hours (10,800,000 ms)
    return 3 * 60 * 60 * 1000;
  };

  const scheduleNextQuestion = (delayMs?: number) => {
    const delay = typeof delayMs === 'number' ? Math.max(1_000, delayMs) : computeNextSlotDelayMs(new Date());
    if (scheduleTimer) clearTimeout(scheduleTimer);
    const plannedAt = Date.now() + delay;
    scheduleTimer = setTimeout(() => { void sendQuestion(); }, delay);
    log('info', 'next question scheduled', { delayMs: delay, plannedAt });
  };

  const start = () => {
    if (started) return;
    started = true;
    log('info', 'service starting');
    ensurePolling();
    scheduleNextQuestion();
  };

  const stop = () => {
    if (!started) return;
    started = false;
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
    log('info', 'service stopped');
  };

  const drainPending = () => {
    if (pending.length === 0) return [];
    const items = pending.splice(0, pending.length);
    log('debug', 'draining pending ratings', { count: items.length });
    return items;
  };

  return {
    start,
    stop,
    drainPending,
    scheduleNextQuestion,
  };
}

// Demo helper for OpenAI text when API key is absent
function buildDemoTextResponse(message: string | undefined): { text: string; model: string; stub: true } {
  const lower = (message || '').toLowerCase();
  const wantsSave = /обнов|сохран|save_json/.test(lower);
  const lines = [
    'Ассистент (демо): работаю офлайн, поэтому отвечаю здесь без обращения к OpenAI.',
  ];
  if (wantsSave) {
    lines.push('Фиксирую изменения в профиле пользователя и сохраняю их.');
    lines.push('SAVE_JSON: { "about_me": "Родился в Грозном. Гражданство России. Жена и дети — украинцы.", "environment": "Черногория, город Бар" }');
  } else {
    lines.push('Пока просто отвечаю и жду конкретных указаний, что сохранить.');
  }
  lines.push('Чтобы получить ответы реальной модели, задайте переменную окружения OPENAI_API_KEY.');
  return { text: lines.join('\n'), model: 'demo-offline', stub: true };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const OPENAI_API_KEY = env.OPENAI_API_KEY;
  const GOOGLE_API_KEY = env.GOOGLE_API_KEY;
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;

  return {
    server: {
      middlewareMode: false,
    },
    plugins: [
      react(),
      {
        name: 'client-log-endpoint',
        apply: 'serve',
        configureServer(server) {
          const telegramService = createTelegramWellbeingService({ token: TELEGRAM_BOT_TOKEN, defaultDelayMs: 60_000 });
          telegramService.start();
          server.httpServer?.once('close', () => { telegramService.stop(); });

          server.middlewares.use('/api/tg/pending', (req, res) => {
            if (req.method !== 'GET') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
            const items = telegramService.drainPending();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ items }));
          });

          server.middlewares.use('/api/tg/schedule', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
            telegramService.scheduleNextQuestion(1_000);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          });

          // Text completion endpoint (Google Gemini)
          server.middlewares.use('/api/google/text', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
            try {
              // Read and parse request body
              const chunks: Uint8Array[] = [];
              req.on('data', (c: Uint8Array) => chunks.push(c));
              await new Promise<void>((resolve) => req.on('end', () => resolve()));
              const bodyStr = Buffer.concat(chunks).toString('utf8');
              const body = bodyStr ? JSON.parse(bodyStr) as { message?: string; instructions?: string; context?: string } : {};
              const message = (body.message || '').slice(0, 4000);
              const instructions = (body.instructions || '').slice(0, 8000);
              const context = (body.context || '').slice(0, 16000);
              const sys = instructions || 'Ты ассистент и отвечаешь кратко и по делу на русском.';
              const user = context ? `${message}\n\nКОНТЕКСТ:\n${context}` : message;
              const textModel = (process.env.GOOGLE_TEXT_MODEL || 'gemini-1.5-flash-latest');

              // Test stub: allow Playwright to request deterministic SAVE_JSON application
              if (message && message.startsWith('[TEST_SAVE_JSON]')) {
                const text = [
                  'Ассистент: Обновляю сохранённую информацию согласно вашему запросу.',
                  'SAVE_JSON: { "about_me": "Родился в Грозном. Гражданство России. Жена и дети — украинцы.", "environment": "Черногория, город Бар" }'
                ].join('\n');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text, model: textModel, stub: true }));
                return;
              }

              const apiKey = GOOGLE_API_KEY;
              if (!apiKey) {
                res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'GOOGLE_API_KEY is not set on server' }));
                return;
              }

              const payload: {
                contents: Array<{ role: string; parts: Array<{ text: string }> }>;
                systemInstruction?: { role: string; parts: Array<{ text: string }> };
                safetySettings?: Array<{ category: string; threshold: string }>;
                generationConfig: { temperature: number };
              } = {
                contents: [
                  { role: 'user', parts: [{ text: user }] },
                ],
                generationConfig: { temperature: 0.3 },
              };
              if (sys) {
                payload.systemInstruction = { role: 'system', parts: [{ text: sys }] };
              }
              payload.safetySettings = [
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              ];

              const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`;
              const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              type GeminiContentPart = { text?: string };
              type GeminiCandidate = { content?: { parts?: GeminiContentPart[] }; text?: string };
              type GeminiResponse = { candidates?: GeminiCandidate[]; error?: { message?: string } };
              const json = await resp.json() as GeminiResponse;
              if (!resp.ok) {
                throw new Error(json?.error?.message || 'Google response not OK');
              }
              let text = '';
              const candidate = json?.candidates?.[0];
              const parts = candidate?.content?.parts;
              if (Array.isArray(parts)) {
                text = parts.map((part) => (part?.text ?? '')).join('').trim();
              }
              if (!text && candidate?.text) {
                text = candidate.text;
              }
              res.statusCode = resp.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ text, model: textModel }));
            } catch (e) {
              console.error('/api/google/text error', e);
              res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'google_text_failed' }));
            }
          });

          // Text completion endpoint (OpenAI, fallback)
          server.middlewares.use('/api/openai/text', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
            try {
              // Read body first to support local test stubs
              const chunks: Uint8Array[] = [];
              req.on('data', (c: Uint8Array) => chunks.push(c));
              await new Promise<void>((resolve) => req.on('end', () => resolve()));
              const bodyStr = Buffer.concat(chunks).toString('utf8');
              const body = bodyStr ? JSON.parse(bodyStr) as { message?: string; instructions?: string; context?: string } : {};
              const message = (body.message || '').slice(0, 4000);
              const instructions = (body.instructions || '').slice(0, 8000);
              const context = (body.context || '').slice(0, 16000);
              const sys = instructions || 'Ты ассистент и отвечаешь кратко и по делу на русском.';
              const user = context ? `${message}\n\nКОНТЕКСТ:\n${context}` : message;
              const textModel = (env.OPENAI_TEXT_MODEL || 'gpt-4o-mini');

              // Test stub: allow Playwright to request deterministic SAVE_JSON application
              if (message && message.startsWith('[TEST_SAVE_JSON]')) {
                const text = [
                  'Ассистент: Обновляю сохранённую информацию согласно вашему запросу.',
                  'SAVE_JSON: { "about_me": "Родился в Грозном. Гражданство России. Жена и дети — украинцы.", "environment": "Черногория, город Бар" }'
                ].join('\n');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text, model: textModel, stub: true }));
                return;
              }

              if (!OPENAI_API_KEY) {
                const demo = buildDemoTextResponse(message);
                res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(demo));
                return;
              }

              // Minimal OpenAI chat.completions flow
              const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: textModel,
                  messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: user },
                  ],
                  temperature: 0.3,
                }),
              });
              const json = await resp.json();
              if (!resp.ok) {
                const err = (json && typeof json === 'object' && (json as any).error && (json as any).error.message) || `HTTP ${resp.status}`;
                throw new Error(String(err));
              }
              const text = (json?.choices?.[0]?.message?.content ?? '').trim();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ text, model: textModel }));

            } catch (e) {
              console.error('/api/openai/text error', e);
              if (!OPENAI_API_KEY) {
                const demo = buildDemoTextResponse(undefined);
                res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(demo));
                return;
              }
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Серверная ошибка при обращении к OpenAI', message: e instanceof Error ? e.message : String(e) }));
            }
          });

          // ... (остальные middleware)
        },
      },
    ],
  };
});
