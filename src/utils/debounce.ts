// Debounce utility for batching updates

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { flush: () => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  let lastThis: any = null;

  const debounced = function (this: any, ...args: any[]) {
    lastArgs = args;
    lastThis = this;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(lastThis, lastArgs!);
      timeoutId = null;
      lastArgs = null;
      lastThis = null;
    }, delay);
  } as T & { flush: () => void; cancel: () => void };

  debounced.flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      fn.apply(lastThis, lastArgs);
      timeoutId = null;
      lastArgs = null;
      lastThis = null;
    }
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastArgs = null;
      lastThis = null;
    }
  };

  return debounced;
}

/**
 * Debounce manager that maintains separate debounced timers per key
 * Useful for debouncing updates to individual items (e.g., nodes by ID)
 */
export class DebouncedBatcher<K = string> {
  private timers = new Map<K, ReturnType<typeof setTimeout>>();
  private pendingUpdates = new Map<K, any>();

  constructor(
    private readonly handler: (key: K, accumulated: any) => void | Promise<void>,
    private readonly delay: number,
    private readonly merge: (prev: any, next: any) => any = (_, next) => next
  ) {}

  schedule(key: K, update: any): void {
    // Cancel existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Merge with pending update
    const existing = this.pendingUpdates.get(key);
    const merged = existing ? this.merge(existing, update) : update;
    this.pendingUpdates.set(key, merged);

    // Schedule new timer
    const timer = setTimeout(() => {
      const accumulated = this.pendingUpdates.get(key);
      this.pendingUpdates.delete(key);
      this.timers.delete(key);
      if (accumulated !== undefined) {
        this.handler(key, accumulated);
      }
    }, this.delay);

    this.timers.set(key, timer);
  }

  flush(key?: K): void {
    if (key !== undefined) {
      // Flush specific key
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
      const accumulated = this.pendingUpdates.get(key);
      if (accumulated !== undefined) {
        this.pendingUpdates.delete(key);
        this.handler(key, accumulated);
      }
    } else {
      // Flush all
      for (const [k, timer] of this.timers.entries()) {
        clearTimeout(timer);
      }
      this.timers.clear();
      for (const [k, accumulated] of this.pendingUpdates.entries()) {
        this.handler(k, accumulated);
      }
      this.pendingUpdates.clear();
    }
  }

  cancel(key?: K): void {
    if (key !== undefined) {
      // Cancel specific key
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
      this.pendingUpdates.delete(key);
    } else {
      // Cancel all
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
      this.pendingUpdates.clear();
    }
  }

  hasPending(key: K): boolean {
    return this.pendingUpdates.has(key);
  }

  getPendingCount(): number {
    return this.pendingUpdates.size;
  }
}
