import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleRAF, cancelRAF } from './raf-batch';

describe('raf-batch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('батчит несколько вызовов в один RAF', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const fn3 = vi.fn();

    // Mock requestAnimationFrame
    let rafCallback: (() => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    scheduleRAF(fn1);
    scheduleRAF(fn2);
    scheduleRAF(fn3);

    // Ещё не вызваны
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
    expect(fn3).not.toHaveBeenCalled();

    // Вызываем RAF callback
    rafCallback?.();

    // Теперь все вызваны
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
  });

  it('отменяет callback через cancelRAF', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    let rafCallback: (() => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    scheduleRAF(fn1);
    scheduleRAF(fn2);
    cancelRAF(fn1);

    rafCallback?.();

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('обрабатывает ошибки в callbacks без падения', () => {
    const errorFn = vi.fn(() => {
      throw new Error('Test error');
    });
    const goodFn = vi.fn();

    let rafCallback: (() => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    scheduleRAF(errorFn);
    scheduleRAF(goodFn);

    // Не должно упасть
    expect(() => rafCallback?.()).not.toThrow();

    // Оба вызваны
    expect(errorFn).toHaveBeenCalled();
    expect(goodFn).toHaveBeenCalled();
  });
});
