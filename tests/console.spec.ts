import { test, expect } from '@playwright/test';

test.describe('Detective Board - smoke and console check', () => {
  test('no console errors on main flows', async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const consoleInfos: string[] = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const txt = msg.text();
      if (type === 'error') consoleErrors.push(txt);
      if (type === 'warning') consoleWarnings.push(txt);
      if (type === 'log' || type === 'info') consoleInfos.push(txt);
    });

    await page.goto('/');
    // Wait for toolbar to appear
    await expect(page.getByRole('link', { name: 'Активные задачи' })).toBeVisible();

    // Switch tools and perform a simple create task action
    const addTaskBtn = page.getByRole('button', { name: 'Добавить задачу' });
    await addTaskBtn.click();
    // Click near center to add a task
    const viewport = page.viewportSize() || { width: 1200, height: 800 };
    await page.mouse.click(Math.floor(viewport.width * 0.5), Math.floor(viewport.height * 0.5));

    // Toggle add tool off (selection is always available in 'none')
    await addTaskBtn.click();

    // Navigate to Active page and back
    await page.getByRole('link', { name: 'Активные задачи' }).click();
    await expect(page.getByRole('heading', { name: 'Активные задачи' })).toBeVisible();
    await page.getByRole('link', { name: 'Назад к доске' }).click();
    await expect(page.getByRole('link', { name: 'Активные задачи' })).toBeVisible();

    // Ensure no console errors
    if (consoleErrors.length) {
      console.log('Console errors captured:', consoleErrors);
    }
    expect(consoleErrors, 'Должно не быть ошибок в консоли браузера').toHaveLength(0);

    // Optionally, we can be strict about runtime warnings; keep it as info for now
    // expect(consoleWarnings, 'Неожиданные предупреждения в консоли').toHaveLength(0);

    // Expect some app logs to be present
    expect(consoleInfos.some((l) => l.includes('[main]') || l.includes('[App]'))).toBeTruthy();
  });
});
