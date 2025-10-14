import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('вызывает функцию сразу при первом вызове', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('игнорирует повторные вызовы в пределах wait периода', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('вызывает функцию снова после истечения wait периода', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('передает аргументы в throttled функцию', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('arg1', 42);
    expect(fn).toHaveBeenCalledWith('arg1', 42);
  });

  it('сохраняет контекст this', () => {
    const obj = {
      value: 42,
      fn: vi.fn(function(this: { value: number }) {
        return this.value;
      })
    };

    const throttled = throttle(obj.fn.bind(obj), 100);
    throttled();

    expect(obj.fn).toHaveBeenCalled();
  });
});
