/* Simple structured logger with scopes and levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Initialize sane defaults as early as possible to avoid stale noisy settings
// causing performance issues before main.tsx runs.
try {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const logParam = url.searchParams.get('log');
    const diagParam = url.searchParams.get('diag');
    const lvl = (logParam && ['debug', 'info', 'warn', 'error'].includes(logParam)) ? logParam : 'info';
    const diag = diagParam === '1' ? '1' : '0';
    localStorage.setItem('LOG_LEVEL', lvl);
    localStorage.setItem('DEBUG_DIAG', diag);
  }
} catch {
  // ignore
}

function getGlobalLevel(): LogLevel {
  if (typeof window !== 'undefined') {
    const maybe = (window as unknown as { __LOG_LEVEL__?: unknown }).__LOG_LEVEL__;
    const fromStorage = localStorage.getItem('LOG_LEVEL');
    const lvl = (typeof maybe === 'string' ? maybe : undefined) || fromStorage || undefined;
    if (lvl && ['debug', 'info', 'warn', 'error'].includes(lvl)) return lvl as LogLevel;
  }
  // ОПТИМИЗАЦИЯ: по умолчанию warn вместо debug для меньшего объёма логов
  return 'warn';
}

export function getLogger(scope: string) {
  const base = `[${scope}]`;
  const level = getGlobalLevel();
  const min = LEVELS[level];
  // ОПТИМИЗАЦИЯ: отключаем mirror логов для экономии ресурсов
  const mirrorSend = (_lvl: LogLevel, _parts: unknown[]) => {
    // Отключено для производительности
  };
  const format = (args: unknown[]) => {
    try {
      return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    } catch {
      return args.map(String).join(' ');
    }
  };
  const out = (lvl: LogLevel, ...args: unknown[]) => {
    const ts = new Date().toISOString();
    const msg = `${ts} ${base} ${format(args)}`;
    if (LEVELS[lvl] < min) return;
    // Use console methods but ensure visibility of debug in some browsers
    if (lvl === 'debug') console.log(msg);
    else if (lvl === 'info') console.info(msg);
    else if (lvl === 'warn') console.warn(msg);
    else console.error(msg);
    mirrorSend(lvl, args);
  };
  return {
    debug: (...args: unknown[]) => out('debug', ...args),
    info: (...args: unknown[]) => out('info', ...args),
    warn: (...args: unknown[]) => out('warn', ...args),
    error: (...args: unknown[]) => out('error', ...args),
  };
}
