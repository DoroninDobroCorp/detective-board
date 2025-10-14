import { test, expect } from '@playwright/test';

// Тест проверяет, что голосовой режим не вылетает мгновенно:
// - выбираем "Голос", жмём Подключить микрофон
// - проверяем, что кнопка "Отключить" видна минимум ~2.5s
// - статус не становится мгновенно "Отключено"

test.describe('Assistant Voice stability', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Стабильнее всего выполняется в Chromium');
  test('режим голос не вылетает мгновенно', async ({ page }) => {
    test.setTimeout(60_000);

    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race<T>([
        p,
        new Promise<T>((_r, rej) => setTimeout(() => rej(new Error(`Safety timeout: ${label} (${ms}ms)`)), ms)) as unknown as Promise<T>,
      ]);
    };

    await page.route('**/api/openai/rt/token', async (route) => {
      const payload = {
        client_secret: { value: 'demo-offline-token', expires_at: Date.now() + 60_000, demo: true },
        model: 'gpt-4o-realtime-preview',
        demo: true,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await withTimeout(page.goto('/'), 10_000, 'page.goto');

    await page.getByRole('button', { name: 'ИИ-ассистент (аудио)' }).click();
    const modal = page.getByTestId('assistant-modal');
    await expect(modal).toBeVisible();

    // Вкладка Диалог
    await modal.getByRole('button', { name: 'Диалог' }).click();

    // Режим Голос (по умолчанию уже голос, но явно выставим)
    const modeSelect = modal.locator('label:has-text("Режим") select');
    await modeSelect.selectOption('voice');

    // Подключение
    const connectBtnName = 'Подключить микрофон';
    await modal.getByRole('button', { name: connectBtnName }).click();

    // Должна появиться кнопка Отключить и держаться хотя бы 2.5s
    const disconnectBtn = modal.getByRole('button', { name: 'Отключить' });
    await withTimeout(expect(disconnectBtn).toBeVisible({ timeout: 8_000 }) as unknown as Promise<void>, 8_500, 'ожидание кнопки Отключить');

    // Проверим статус через 500мс и 3сек, что не мгновенно "Отключено"
    const status = page.getByTestId('assistant-status');
    await page.waitForTimeout(500);
    const s1 = await status.textContent();
    expect((s1 || '').toLowerCase()).not.toContain('отключено');

    await page.waitForTimeout(3200);
    const s2 = await status.textContent();
    expect((s2 || '').toLowerCase()).toContain('подключ');

    // демо-режим присылает текстовый ответ вместо аудио
    const transcript = modal.getByTestId('assistant-transcript');
    await expect(transcript).toContainText('Ассистент (демо-голос)');
  });
});
