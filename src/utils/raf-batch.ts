/**
 * Батчинг обновлений через requestAnimationFrame
 * Группирует несколько вызовов в один кадр анимации
 */

import { getLogger } from '../logger';

const log = getLogger('raf-batch');

let rafId: number | null = null;
let pendingCallbacks: Set<() => void> = new Set();

export function scheduleRAF(callback: () => void): void {
  pendingCallbacks.add(callback);
  
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      const callbacks = Array.from(pendingCallbacks);
      pendingCallbacks.clear();
      rafId = null;
      
      callbacks.forEach(cb => {
        try {
          cb();
        } catch (e) {
          log.error('raf:callback-error', { error: e instanceof Error ? e.message : String(e) });
        }
      });
    });
  }
}

export function cancelRAF(callback: () => void): void {
  pendingCallbacks.delete(callback);
}
