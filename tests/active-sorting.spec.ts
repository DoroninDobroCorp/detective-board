// @ts-nocheck
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function resetAndSeed(page: Page) {
  await page.goto('/active');
  await page.waitForFunction(() => Boolean((globalThis as any).__appStore));
  const seedOk = await page.evaluate(async () => {
    const store = (globalThis as any).__appStore;
    if (!store) return false;
    // reset DB/state
    await store.getState().resetAll();
    // Add three tasks with ascending dates 18 < 19 < 20
    const add = store.getState().addTask;
    const mkISO = (y: number, m1: number, d: number, hh = 10, mm = 0) => new Date(Date.UTC(y, m1 - 1, d, hh, mm, 0, 0)).toISOString();
    await add({ title: 'A-18', status: 'active', priority: 'med', dueDate: mkISO(2025, 9, 18, 2, 0) });
    await add({ title: 'B-19', status: 'active', priority: 'med', dueDate: mkISO(2025, 9, 19, 2, 0) });
    await add({ title: 'C-20', status: 'active', priority: 'med', dueDate: mkISO(2025, 9, 20, 2, 0) });
    return true;
  });
  expect(seedOk).toBeTruthy();
}

test.describe('Active page sorting', () => {
  test('dates are strictly ascending by day', async ({ page }) => {
    await resetAndSeed(page);
    await page.goto('/active');
    await page.waitForFunction(() => {
      const store = (globalThis as any).__appStore;
      if (!store?.getState) return false;
      const nodes = store.getState().nodes;
      return Array.isArray(nodes) && nodes.filter((n: any) => n?.type === 'task').length >= 3;
    }, { timeout: 10_000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="date-header"]').length >= 3, { timeout: 5_000 });
    const headers = page.locator('[data-testid="date-header"]');
    const count = await headers.count();
    expect(count).toBeGreaterThanOrEqual(3);
    const keys = (await headers.evaluateAll((els) => (els as any[]).map((e: any) => e.getAttribute('data-date-key'))))
      .filter(Boolean) as string[];
    // filter out no-date buckets
    const filtered = keys.filter((k) => k !== '__NO_DATE__');
    // deduplicate preserving order
    const uniq: string[] = [];
    for (const k of filtered) if (!uniq.includes(k)) uniq.push(k);
    // Should contain our seeded days in ascending order
    const expected = ['2025-09-18', '2025-09-19', '2025-09-20'];
    const found = uniq.slice(0, expected.length);
    expect(found).toEqual(expected);
    // And ensure overall is non-decreasing
    const sorted = [...uniq].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(uniq).toEqual(sorted);
  });
});
