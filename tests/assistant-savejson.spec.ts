// @ts-nocheck
import { test, expect } from '@playwright/test';

// Тест проверяет применение SAVE_JSON через текстовый режим в демо-окружении
// (без реального обращения к OpenAI API).

test.describe('Assistant SAVE_JSON (text mode)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Стабильно работает в Chromium в headless-окружении агента');
  test('обновляет сохранённую информацию через SAVE_JSON', async ({ page }) => {
    test.setTimeout(60_000);

    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race<T>([
        p,
        new Promise<T>((_r, rej) => setTimeout(() => rej(new Error(`Safety timeout: ${label} (${ms}ms)`)), ms)) as unknown as Promise<T>,
      ]);
    };

    await page.route('**/api/openai/text', async (route) => {
      const replyLines = [
        'Рад помочь! Я обновил краткий профиль так, как вы попросили.',
        'SAVE_JSON: {"about_me":"Родился в Грозном. Гражданство России. Жена и дети — украинцы.","environment":"Черногория, город Бар"}',
        'Если нужно что-то ещё — уточните.'
      ];
      const payload = {
        id: 'resp_mock_123',
        model: 'gpt-5-mini',
        output: [
          {
            id: 'msg_1',
            type: 'message' as const,
            role: 'assistant',
            content: [
              { type: 'output_text' as const, text: replyLines.join('\n') },
            ],
          },
        ],
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await withTimeout(page.goto('/'), 10_000, 'page.goto');

    // Открыть ассистента
    await page.getByRole('button', { name: 'ИИ-ассистент (аудио)' }).click();
    const modal = page.getByTestId('assistant-modal');
    await expect(modal).toBeVisible();

    // Диалог -> Текст -> Подключиться
    await modal.getByRole('button', { name: 'Диалог' }).click();
    const modeSelect = modal.locator('label:has-text("Режим") select');
    await modeSelect.selectOption('text');
    await modal.getByRole('button', { name: 'Подключиться' }).click();

    const input = page.getByTestId('assistant-input');
    await withTimeout(expect(input).toBeEnabled({ timeout: 20_000 }) as unknown as Promise<void>, 22_000, 'ожидание активного ввода');

    // Отправить тестовый запрос, вызывающий SAVE_JSON
    const cmd = 'Пожалуйста, обнови профиль: Родился в Грозном, гражданство России. Жена и дети — украинцы. Живём в Черногории, город Бар.';
    await input.fill(cmd);
    await modal.getByRole('button', { name: 'Отправить' }).click();

    // Перейти на вкладку «Сохранённая информация»
    await modal.getByRole('button', { name: 'Сохранённая информация' }).click();
    const infoTextarea = modal.locator('textarea');
    const infoStr = await withTimeout(infoTextarea.inputValue(), 15_000, 'чтение сохранённой информации');

    let json: any;
    try {
      json = JSON.parse(infoStr || '{}');
    } catch (e) {
      throw new Error('Сохранённая информация не является валидным JSON');
    }

    expect(typeof json).toBe('object');
    expect(String(json.about_me || '')).toContain('Родился в Грозном');
    expect(String(json.about_me || '')).toContain('Гражданство России');
    expect(String(json.environment || '')).toContain('Черногория');
    expect(String(json.environment || '')).toContain('город Бар');

    // Проверяем, что транскрипт содержит как текст ответа, так и информацию после SAVE_JSON
    const transcript = modal.getByTestId('assistant-transcript');
    await expect(transcript).toContainText('Рад помочь');
    await expect(transcript).toContainText('SAVE_JSON:');

    // Проверяем, что статус сообщает об успешном ответе, а не о пустом
    const statusText = await page.getByTestId('assistant-status').innerText();
    expect(statusText).toContain('Ответ получен');
    expect(statusText).toContain('gpt-5-mini');

    const persisted = await page.evaluate(() => localStorage.getItem('ASSISTANT_SAVED_INFO_V1'));
    expect(persisted).toBeTruthy();
    const parsedPersisted = JSON.parse(persisted || '{}');
    expect(String(parsedPersisted.about_me || '')).toContain('Родился в Грозном');
    expect(String(parsedPersisted.environment || '')).toContain('город Бар');
  });
});
