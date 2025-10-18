import { test, expect } from '@playwright/test';

test.describe('Console Errors Check', () => {
  test('should not have any console errors on page load', async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    // Собираем ошибки консоли
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    // Собираем ошибки страницы
    page.on('pageerror', (error) => {
      consoleErrors.push(`Page Error: ${error.message}`);
    });

    // Переходим на главную страницу
    await page.goto('http://localhost:5173');

    // Ждем, чтобы все скрипты загрузились
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Проверяем, что страница загрузилась
    await expect(page.locator('body')).toBeVisible();

    // Выводим предупреждения, если есть (но не фейлим тест)
    if (consoleWarnings.length > 0) {
      console.log('⚠️  Console warnings:', consoleWarnings);
    }

    // Проверяем, что нет ошибок
    if (consoleErrors.length > 0) {
      console.error('❌ Console errors found:', consoleErrors);
    }
    
    expect(consoleErrors).toHaveLength(0);
  });

  test('should not have errors when interacting with board', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      consoleErrors.push(`Page Error: ${error.message}`);
    });

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Пробуем взаимодействовать с холстом
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible()) {
      await canvas.click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(1000);
    }

    if (consoleErrors.length > 0) {
      console.error('❌ Console errors during interaction:', consoleErrors);
    }

    expect(consoleErrors).toHaveLength(0);
  });
});
