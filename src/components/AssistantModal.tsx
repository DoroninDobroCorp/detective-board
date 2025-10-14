import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getLogger } from '../logger';
import {
  appendMessage,
  loadMessages,
  loadMode,
  loadPrompt,
  loadSavedInfo,
  loadTextProvider,
  resetMessages,
  saveMessages,
  saveMode,
  savePrompt,
  saveSavedInfo,
  saveTextProvider,
  todayKey,
  type AssistantMessage,
} from '../assistant/storage';
import { buildAssistantContext } from '../assistant/context';
import { extractAssistantText } from '../assistant/api';

const log = getLogger('AssistantModal');

const DEFAULT_PROMPT = `Ты — внимательный психолог-коуч и стратег задач.
Твоя базовая задача — помочь понять приоритеты и выбрать уместную следующую задачу, учитывая состояние пользователя. При этом будь всегда готов оказать психологическую поддержку: мягко отражай, помогай проживать эмоции и снижать напряжение.

Ограничения действий модели:
- Ты МОЖЕШЬ изменять только «Сохранённую информацию» пользователя (профиль/контекст), НО НИЧЕГО БОЛЬШЕ.
- Если считаешь, что стоит обновить «Сохранённую информацию», выводи отдельной строкой команду:
  SAVE_JSON: { ...патч JSON... }`;

function classNames(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}

function mergeSavedInfo(current: string, patchLine: string): { next: string; applied: boolean } {
  const prefix = 'SAVE_JSON:';
  if (!patchLine.trim().startsWith(prefix)) return { next: current, applied: false };
  const jsonPart = patchLine.slice(prefix.length).trim();
  try {
    const patch = JSON.parse(jsonPart);
    const base = current.trim() ? JSON.parse(current) : {};
    const merged = { ...base, ...patch };
    const formatted = JSON.stringify(merged, null, 2);
    return { next: formatted, applied: true };
  } catch (e) {
    log.warn('assistant:savejson:failed', { error: e instanceof Error ? e.message : String(e) });
    return { next: current, applied: false };
  }
}

interface VoiceConnectionHandle {
  disconnect: () => void;
}

type AssistantTab = 'chat' | 'prompt' | 'info';

type Mode = 'voice' | 'text';

type TextProvider = 'openai' | 'google';

interface StatusEntry {
  id: string;
  text: string;
  kind: 'info' | 'error' | 'success';
  ts: number;
}

export const AssistantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const dayKey = useMemo(() => todayKey(), []);
  const [tab, setTab] = useState<AssistantTab>('chat');
  const [mode, setMode] = useState<Mode>(() => loadMode());
  const [textProvider, setTextProvider] = useState<TextProvider>(() => loadTextProvider());
  const [prompt, setPrompt] = useState<string>(() => loadPrompt() || DEFAULT_PROMPT);
  const [savedInfo, setSavedInfo] = useState<string>(() => loadSavedInfo());
  const [messages, setMessages] = useState<AssistantMessage[]>(() => loadMessages(dayKey));
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Окно ассистента неактивно');
  const [textReady, setTextReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [suggestedContextCount, setSuggestedContextCount] = useState<number | null>(null);
  const [statusMessages, setStatusMessages] = useState<StatusEntry[]>([]);
  const autoConnectRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<VoiceConnectionHandle | null>(null);
  const voiceDemoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pushStatus = useCallback(
    (text: string, kind: StatusEntry['kind'] = 'info') => {
      setStatus(text);
      setStatusMessages((prev) => {
        const entry: StatusEntry = { id: crypto.randomUUID(), text, kind, ts: Date.now() };
        return [...prev.slice(-8), entry];
      });
    },
    []
  );

  useEffect(() => {
    saveMode(mode);
  }, [mode]);

  useEffect(() => {
    saveTextProvider(textProvider);
  }, [textProvider]);

  useEffect(() => {
    savePrompt(prompt);
  }, [prompt]);

  useEffect(() => {
    saveSavedInfo(savedInfo);
  }, [savedInfo]);

  useEffect(() => {
    saveMessages(messages, dayKey);
  }, [messages, dayKey]);

  const connectText = useCallback(async (auto = false) => {
    if (!open) return;
    const phase = auto ? 'Автоподготовка' : 'Подготовка';
    try {
      setIsConnecting(true);
      pushStatus(`${phase} контекста для Google…`);
      const context = await buildAssistantContext({ savedInfo, prompt, messages });
      setSuggestedContextCount(context.activeTasks.length);
      setTextReady(true);
      pushStatus(`Контекст готов: ${context.activeTasks.length} актуальных задач.`, 'success');
      log.info('assistant:text:connected', { tasks: context.activeTasks.length, auto });
    } catch (e) {
      log.error('assistant:text:connect_failed', e);
      setTextReady(false);
      const message = e instanceof Error ? e.message : String(e);
      pushStatus(`Не удалось подготовить контекст: ${message}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  }, [open, savedInfo, prompt, messages, pushStatus]);

  useEffect(() => {
    if (!open) {
      autoConnectRef.current = false;
      setStatus('Окно ассистента неактивно');
      setStatusMessages([]);
      return;
    }
    if (!autoConnectRef.current) {
      if (mode !== 'text') {
        setMode('text');
        return;
      }
      if (textProvider !== 'google') {
        setTextProvider('google');
        return;
      }
      autoConnectRef.current = true;
      pushStatus('Открыто окно ассистента. Готовлю контекст Google…');
      void connectText(true);
    }
  }, [open, mode, textProvider, connectText, pushStatus]);

  useEffect(() => {
    if (!open && voiceRef.current) {
      try { voiceRef.current.disconnect(); } catch {}
      voiceRef.current = null;
      setVoiceConnected(false);
    }
  }, [open]);

  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTab('chat');
    }
    wasOpenRef.current = open;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = bottomRef.current;
    if (!anchor) return;
    const rafId = requestAnimationFrame(() => {
      try {
        anchor.scrollIntoView({ block: 'end', behavior: 'smooth' });
      } catch {}
    });
    return () => cancelAnimationFrame(rafId);
  }, [messages.length, open]);

  async function connectVoice() {
    if (voiceConnected) return;
    try {
      setIsConnecting(true);
      pushStatus('Подключаю голосовой режим…');
      const resp = await fetch('/api/openai/rt/token', { method: 'POST' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // Даже если токен демо, считаем успехом
      const json = await resp.json().catch(() => ({}));
      log.info('assistant:voice:token', json);
      setVoiceConnected(true);
      pushStatus('Голосовой режим подключён (демо).', 'success');
      const handle: VoiceConnectionHandle = {
        disconnect: () => {
          if (voiceDemoTimeoutRef.current) {
            clearTimeout(voiceDemoTimeoutRef.current);
            voiceDemoTimeoutRef.current = null;
          }
          setVoiceConnected(false);
          pushStatus('Голосовой режим отключён.');
        },
      };
      voiceRef.current = handle;
      const assistantLine = 'Ассистент (демо-голос): Подключение активно — я слушаю и отвечу голосом в полном режиме. В демо окне показываю текст.';
      voiceDemoTimeoutRef.current = setTimeout(() => {
        setMessages((prev) => appendMessage(prev, 'assistant', assistantLine));
      }, 1200);
    } catch (e) {
      log.error('assistant:voice:connect_failed', e);
      const message = e instanceof Error ? e.message : String(e);
      pushStatus(`Не удалось подключиться к голосовому режиму: ${message}`, 'error');
    } finally {
      setIsConnecting(false);
    }
  }

  function disconnectVoice() {
    try {
      voiceRef.current?.disconnect();
    } catch {}
    voiceRef.current = null;
  }

  async function sendUserText() {
    if (!textReady) {
      pushStatus('Текстовый режим ещё не готов.', 'error');
      return;
    }
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText('');
    const nextMessages = appendMessage(messages, 'user', trimmed);
    setMessages(nextMessages);
    const instructions = (prompt && prompt.trim()) || DEFAULT_PROMPT;

    const doRequest = async (endpoint: string, providerLabel: string) => {
      setIsSending(true);
      pushStatus(`Отправка запроса (${providerLabel})…`);
      try {
        const context = await buildAssistantContext({ savedInfo, prompt: instructions, messages: nextMessages });
        setSuggestedContextCount(context.activeTasks.length);
        const body = {
          message: trimmed,
          instructions,
          context: context.contextText,
        };
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        let json: unknown = null;
        try { json = await resp.json(); } catch {}
        if (!resp.ok) {
          let errMsg = `HTTP ${resp.status}`;
          if (json && typeof json === 'object') {
            const obj = json as Record<string, unknown>;
            if (typeof obj.error === 'string') errMsg = obj.error;
            else if (typeof obj.message === 'string') errMsg = obj.message;
          }
          throw new Error(errMsg);
        }
        const { text, model } = extractAssistantText(json);
        if (text) {
          log.info('assistant:text:reply', { provider: providerLabel, model });
          const withReply = appendMessage(nextMessages, 'assistant', text);
          setMessages(withReply);
          let updatedInfo = savedInfo;
          let appliedPatch = false;
          text.split('\n').forEach((line) => {
            const result = mergeSavedInfo(updatedInfo, line);
            if (result.applied) {
              appliedPatch = true;
              updatedInfo = result.next;
            }
          });
          if (appliedPatch) {
            setSavedInfo(updatedInfo);
          }
          const patchSuffix = appliedPatch ? ' + SAVE_JSON' : '';
          const modelLabel = model ? `: ${model}` : '';
          pushStatus(`Ответ получен (${providerLabel}${modelLabel})${patchSuffix}`, 'success');
        } else {
          pushStatus('Пустой ответ ассистента.', 'error');
        }
      } finally {
        setIsSending(false);
      }
    };

    try {
      const providerLabel = textProvider === 'google' ? 'Google' : 'OpenAI';
      const endpoint = textProvider === 'google' ? '/api/google/text' : '/api/openai/text';
      await doRequest(endpoint, providerLabel);
    } catch (err) {
      log.error('assistant:text:request_failed', err);
      if (textProvider === 'google') {
        const message = err instanceof Error ? err.message : String(err);
        pushStatus(`Ошибка запроса к Google API (${message}) — пробую OpenAI…`, 'error');
        try {
          await doRequest('/api/openai/text', 'OpenAI');
        } catch (err2) {
          log.error('assistant:text:fallback_failed', err2);
          const fallbackMessage = err2 instanceof Error ? err2.message : String(err2);
          pushStatus(`Ошибка текстового запроса: ${fallbackMessage}`, 'error');
        }
      } else {
        const message = err instanceof Error ? err.message : String(err);
        pushStatus(`Ошибка запроса к OpenAI (${message}) — пробую Google…`, 'error');
        try {
          await doRequest('/api/google/text', 'Google');
        } catch (err2) {
          log.error('assistant:text:fallback_failed', err2);
          const fallbackMessage = err2 instanceof Error ? err2.message : String(err2);
          pushStatus(`Ошибка текстового запроса: ${fallbackMessage}`, 'error');
        }
      }
    }
  }

  function clearHistory() {
    resetMessages(dayKey);
    setMessages([]);
    log.info('assistant:history:cleared');
    pushStatus('История диалога очищена.');
  }

  function onCloseClick() {
    disconnectVoice();
    onClose();
  }

  const transcript = messages.map((msg) => (
    <div key={msg.id} style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 'bold', color: msg.role === 'assistant' ? '#6fe' : msg.role === 'system' ? '#ff9' : '#fff' }}>
        {msg.role === 'assistant' ? 'Ассистент' : msg.role === 'system' ? 'Система' : 'Пользователь'}
        <span style={{ marginLeft: 6, fontSize: 12, color: '#888' }}>
          {new Date(msg.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{msg.text}</div>
    </div>
  ));

  return (
    <div
      data-testid="assistant-modal"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: open ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        style={{
          width: 'min(1120px, 94vw)',
          height: '90vh',
          minHeight: 0,
          background: '#0f1418',
          color: '#f5f5f5',
          borderRadius: 18,
          border: '1px solid #1e2a33',
          boxShadow: '0 24px 72px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #1f2b34', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>ИИ-ассистент</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {suggestedContextCount !== null ? (
              <span style={{ fontSize: 12, color: '#6fa8dc' }}>
                Контекст: {suggestedContextCount} задач
              </span>
            ) : null}
            <button className="tool-btn" onClick={onCloseClick}>Закрыть</button>
          </div>
        </div>
        <div style={{ padding: '12px 24px', display: 'flex', gap: 12 }}>
          <button className={classNames('tool-btn', tab === 'chat' && 'active')} onClick={() => setTab('chat')}>Диалог</button>
          <button className={classNames('tool-btn', tab === 'prompt' && 'active')} onClick={() => setTab('prompt')}>Промпт</button>
          <button className={classNames('tool-btn', tab === 'info' && 'active')} onClick={() => setTab('info')}>Сохранённая информация</button>
        </div>
        {tab === 'chat' ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 24px 24px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Режим
                <select value={mode} onChange={(e) => { const next = e.target.value as Mode; setMode(next); if (next === 'voice') { setTextReady(false); } else if (open) { void connectText(false); } }}>
                  <option value="text">Текст</option>
                  <option value="voice">Голос</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Провайдер
                <select value={textProvider} onChange={(e) => setTextProvider(e.target.value as TextProvider)}>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                </select>
              </label>
              {mode === 'text' ? (
                <button className="tool-btn" onClick={() => void connectText(false)} disabled={isConnecting}>
                  Обновить контекст
                </button>
              ) : (
                <button className="tool-btn" onClick={voiceConnected ? disconnectVoice : () => void connectVoice()} disabled={isConnecting}>
                  {voiceConnected ? 'Отключить' : 'Подключить микрофон'}
                </button>
              )}
              <span data-testid="assistant-status" style={{ fontSize: 12, color: '#9fb8c9', flex: 1 }}>
                {status}
              </span>
              <button className="tool-btn" style={{ fontSize: 12 }} onClick={clearHistory}>Очистить историю</button>
            </div>
            {statusMessages.length ? (
              <div style={{ marginBottom: 12, maxHeight: 96, overflowY: 'auto', border: '1px solid #1e2f3a', borderRadius: 10, padding: 10, background: '#131c22' }}>
                {statusMessages.map((entry) => (
                  <div
                    key={entry.id}
                    style={{ fontSize: 12, color: entry.kind === 'error' ? '#ff9b9b' : entry.kind === 'success' ? '#85f7c6' : '#9fb8c9' }}
                  >
                    {new Date(entry.ts).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                    : {entry.text}
                  </div>
                ))}
              </div>
            ) : null}
            <div ref={transcriptRef} data-testid="assistant-transcript" style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflowY: 'auto', border: '1px solid #1f2b34', borderRadius: 10, padding: 16, background: '#131c22' }}>
              {messages.length ? transcript : <div style={{ color: '#6c7a84' }}>Сообщений за сегодня ещё нет.</div>}
              <div ref={bottomRef} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <textarea
                data-testid="assistant-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendUserText();
                  }
                }}
                placeholder={mode === 'text' ? 'Напишите сообщение…' : 'Текстовый ввод доступен только в режиме «Текст»'}
                disabled={!textReady || isSending || mode !== 'text'}
                style={{ flex: 1, minHeight: 64, borderRadius: 10, padding: 10, background: '#10181f', border: '1px solid #1f2b34', color: '#fff', resize: 'vertical' }}
              />
              <button className="tool-btn" onClick={() => void sendUserText()} disabled={!textReady || isSending || mode !== 'text'}>
                Отправить
              </button>
            </div>
          </div>
        ) : null}
        {tab === 'prompt' ? (
          <div style={{ flex: 1, padding: '0 24px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, color: '#9fb8c9', marginBottom: 8 }}>
              Базовый промпт ассистента. Используется как системная инструкция для модели.
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ flex: 1, borderRadius: 10, padding: 12, minHeight: 240, background: '#10181f', border: '1px solid #1f2b34', color: '#fff', resize: 'vertical' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#617381' }}>
              Изменения сохраняются автоматически. Можно вернуться к дефолту кнопкой ниже.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="tool-btn" onClick={() => setPrompt(DEFAULT_PROMPT)}>Вернуть дефолт</button>
            </div>
          </div>
        ) : null}
        {tab === 'info' ? (
          <div style={{ flex: 1, padding: '0 24px 24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, color: '#9fb8c9', marginBottom: 8 }}>
              Здесь хранится JSON с фактами о вас, которые ассистент может обновлять командой SAVE_JSON.
            </div>
            <textarea
              value={savedInfo}
              onChange={(e) => setSavedInfo(e.target.value)}
              style={{ flex: 1, borderRadius: 10, padding: 12, minHeight: 260, background: '#10181f', border: '1px solid #1f2b34', color: '#fff', resize: 'vertical' }}
            />
            <div style={{ marginTop: 12, fontSize: 12, color: '#617381' }}>
              Советуем держать формат JSON. Для очистки можно удалить всё содержимое.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AssistantModal;

