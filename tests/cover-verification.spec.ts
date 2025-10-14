import { test, expect } from '@playwright/test';

test.describe('Cover Image Verification', () => {
  test('all book items should have a real cover image', async ({ page }) => {
    // Увеличим таймаут для ожидания, т.к. бэкфилл и аудит могут занять время
    test.setTimeout(60000); // 60 секунд

    // Переходим на страницу и принудительно запускаем аудит
    await page.goto('/books?audit=1&backfill=1');

    // Ждём появления списка элементов
    await page.waitForSelector('div[style*="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))"] > div');

    // Дадим время на загрузку и обработку изображений
    await page.waitForTimeout(15000);

    const items = await page.locator('div[style*="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))"] > div').all();

    expect(items.length).toBeGreaterThan(0);

    let placeholdersFound = 0;
    const failedItems: { title: string, src: string }[] = [];

    for (const item of items) {
      const img = item.locator('img');
      const src = await img.getAttribute('src');
      const title = await item.locator('div[style*="font-weight: 700"]').textContent() || 'Unknown Title';

      if (src && src.startsWith('data:image/svg+xml')) {
        placeholdersFound++;
        failedItems.push({ title, src });
      }
    }

    if (placeholdersFound > 0) {
      console.log(`Found ${placeholdersFound} items with placeholder images:`);
      console.table(failedItems);
    }

    // Тест упадет, если найден хотя бы один плейсхолдер
    expect(placeholdersFound).toBe(0);
  });
});
