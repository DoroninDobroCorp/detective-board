
export const SAVED_INFO_KEY = 'ASSISTANT_SAVED_INFO_V1';
export const PROMPT_KEY = 'ASSISTANT_PROMPT_V1';
export const TEXT_PROVIDER_KEY = 'ASSISTANT_TEXT_PROVIDER_V1';
export const MODE_KEY = 'ASSISTANT_MODE_V1';
const MESSAGES_PREFIX = 'ASSISTANT_MESSAGES_V2:';

export type AssistantRole = 'user' | 'assistant' | 'system';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  ts: number;
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function safeParse<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function loadSavedInfo(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SAVED_INFO_KEY) || '';
  } catch {
    return '';
  }
}

export function saveSavedInfo(value: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(SAVED_INFO_KEY, value); } catch {}
}

export function loadPrompt(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    const stored = localStorage.getItem(PROMPT_KEY);
    if (stored && stored.trim()) return stored;
  } catch {}
  return '';
}

export function savePrompt(value: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(PROMPT_KEY, value); } catch {}
}

export function loadTextProvider(): 'openai' | 'google' {
  if (typeof localStorage === 'undefined') return 'google';
  try {
    const raw = localStorage.getItem(TEXT_PROVIDER_KEY);
    if (raw === 'google') return 'google';
    if (raw === 'openai') return 'openai';
  } catch {}
  return 'google';
}

export function saveTextProvider(provider: 'openai' | 'google'): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(TEXT_PROVIDER_KEY, provider); } catch {}
}

export function loadMode(): 'voice' | 'text' {
  if (typeof localStorage === 'undefined') return 'text';
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'voice' || raw === 'text') return raw;
  } catch {}
  return 'text';
}

export function saveMode(mode: 'voice' | 'text'): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

export function loadMessages(dateKey = todayKey()): AssistantMessage[] {
  if (typeof localStorage === 'undefined') return [];
  const key = MESSAGES_PREFIX + dateKey;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = safeParse<AssistantMessage[]>(stored, []);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m.text === 'string' && typeof m.role === 'string') : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: AssistantMessage[], dateKey = todayKey()): void {
  if (typeof localStorage === 'undefined') return;
  const key = MESSAGES_PREFIX + dateKey;
  try {
    const trimmed = messages.slice(-60);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {}
}

export function resetMessages(dateKey = todayKey()): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(MESSAGES_PREFIX + dateKey); } catch {}
}

export function appendMessage(list: AssistantMessage[], role: AssistantRole, text: string): AssistantMessage[] {
  const entry: AssistantMessage = { id: crypto.randomUUID(), role, text, ts: Date.now() };
  return [...list, entry];
}

