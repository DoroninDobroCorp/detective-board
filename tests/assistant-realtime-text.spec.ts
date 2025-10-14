// @ts-nocheck
import { test, expect } from '@playwright/test';

// Тест открывает ассистента, переключает его в текстовый режим и эмулирует
// ответ OpenAI через dev-заглушку, проверяя, что UI показывает содержательный
// ответ и не ругается на пустой ответ модели.

test.describe('Assistant text chat (stubbed API)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Стабильно выполняется в Chromium');
  test('подключается в текстовом режиме и даёт осмысленный ответ', async ({ page }) => {
    test.setTimeout(45_000);

    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race<T>([
        p,
        new Promise<T>((_r, rej) => setTimeout(() => rej(new Error(`Safety timeout: ${label} (${ms}ms)`)), ms)) as unknown as Promise<T>,
      ]);
    };

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.route('**/api/openai/text', async (route) => {
      let body: any = {};
      try {
        body = route.request().postDataJSON?.() ?? JSON.parse(route.request().postData() || '{}');
      } catch {
        body = {};
      }
      const userMessage = typeof body?.message === 'string' ? body.message : '';
      const replyLines = [
        'Ассистент: да, я вижу твои задачи, книги, игры и сохранённую информацию.',
        'Готов подхватить контекст и продолжать работу пошагово. '
        + 'Если захочешь, могу обновить профиль командой SAVE_JSON.',
      ];
      if (/save_json|обнов|сохран/i.test(userMessage)) {
        replyLines.push('SAVE_JSON: {"about_me":"Родился в Грозном. Гражданство России. Жена и дети — украинцы.","environment":"Черногория, город Бар"}');
      }
      const payload = {
        id: 'resp_demo_text',
        model: 'demo-stub',
        output: [
          {
            id: 'msg_demo',
            type: 'message' as const,
            role: 'assistant' as const,
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

    await page.getByRole('button', { name: 'ИИ-ассистент (аудио)' }).click();
    const modal = page.getByTestId('assistant-modal');
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Диалог' }).click();
    const modeSelect = modal.locator('label:has-text("Режим") select');
    await modeSelect.selectOption('text');
    await modal.getByRole('button', { name: 'Подключиться' }).click();

    const input = page.getByTestId('assistant-input');
    await withTimeout(expect(input).toBeEnabled({ timeout: 15_000 }) as unknown as Promise<void>, 17_000, 'ожидание готовности текстового режима');

    const question = 'Расскажи, видишь ли ты мои задачи, книги и игры и можешь ли использовать сохранённую информацию?';
    await input.fill(question);
    await modal.getByRole('button', { name: 'Отправить' }).click();

    const transcript = page.getByTestId('assistant-transcript');
    await withTimeout(expect(transcript).toContainText('Ассистент: да, я вижу твои задачи', { timeout: 20_000 }) as unknown as Promise<void>, 22_000, 'ожидание ответа ассистента');
    await expect(transcript).toContainText('книги');
    await expect(transcript).toContainText('игры');

    const statusText = (await page.getByTestId('assistant-status').innerText()).toLowerCase();
    expect(statusText).toContain('ответ получен');

    expect(consoleErrors, 'Ошибок в консоли не должно быть').toHaveLength(0);

    await modal.getByRole('button', { name: 'Закрыть' }).click();
    await expect(modal).not.toBeVisible();
  });
});
