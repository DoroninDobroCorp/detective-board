import { test, expect, request } from '@playwright/test';

// Проверяет, что dev middleware /api/google/text принимает тело запроса и
// корректно обрабатывает тестовый триггер [TEST_SAVE_JSON] без ReferenceError.

test('google text endpoint handles TEST_SAVE_JSON without errors', async ({ baseURL }) => {
  test.setTimeout(30_000);
  const api = await request.newContext();
  const payload = {
    message: '[TEST_SAVE_JSON] Пожалуйста, обнови профиль',
    instructions: 'Тестовые инструкции',
    context: 'Тестовый контекст',
  };
  const resp = await api.post(`${baseURL}/api/google/text`, {
    data: payload,
    headers: { 'Content-Type': 'application/json' },
  });
  const status = resp.status();
  const json = await resp.json();
  expect(status).toBe(200);
  expect(typeof json?.text).toBe('string');
  expect(json.text).toContain('SAVE_JSON');
});
