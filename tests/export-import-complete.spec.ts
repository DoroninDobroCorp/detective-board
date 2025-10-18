import { test, expect } from '@playwright/test';

test.describe('Полнота экспорта/импорта', () => {
  test('должен экспортировать все данные включая XP, wellbeing и assistant', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Добавляем тестовые данные в localStorage
    await page.evaluate(() => {
      // Геймификация (XP)
      const gamificationData = {
        xp: 1000,
        level: 5,
        xpHistory: [{ id: '1', amount: 100, source: 'task', ts: Date.now() }],
        completions: [],
        processedTasks: { 'task-1': true },
        achievements: [],
        levelTitles: { 1: { title: 'Новичок', assignedAt: Date.now() } },
        claimedBonuses: {},
        pendingLevelUps: [],
        pendingManualCandidates: [],
      };
      localStorage.setItem('GAMIFICATION_STATE_V1', JSON.stringify(gamificationData));

      // Wellbeing
      localStorage.setItem('WB_RAW_BY_DAY', JSON.stringify({ '2025-01-01': [{ awareness: 5, efficiency: 4, joy: 3, ts: Date.now() }] }));
      localStorage.setItem('WB_DAY_AVG_BY_DAY', JSON.stringify({ '2025-01-01': { awareness: 5, efficiency: 4, joy: 3 } }));
      localStorage.setItem('WB_MONTH_AVG_BY_MONTH', JSON.stringify({ '2025-01': { awareness: 5, efficiency: 4, joy: 3 } }));

      // Assistant
      localStorage.setItem('ASSISTANT_SAVED_INFO_V1', 'Test saved info');
      localStorage.setItem('ASSISTANT_PROMPT_V1', 'Test prompt');
      localStorage.setItem('ASSISTANT_TEXT_PROVIDER_V1', 'google');
      localStorage.setItem('ASSISTANT_MODE_V1', 'text');
      localStorage.setItem('ASSISTANT_MESSAGES_V2:2025-01-01', JSON.stringify([
        { id: '1', role: 'user', text: 'Hello', ts: Date.now() }
      ]));

      // Дополнительные данные
      localStorage.setItem('CUSTOM_KEY_TEST', 'custom value');
    });

    // Экспортируем данные через код (используем глобальную функцию)
    const exportedData = await page.evaluate(async () => {
      const module = await import('/src/exportImport.ts');
      return await module.getBackupData();
    });

    // Проверяем наличие всех секций
    expect(exportedData.gamification).toBeDefined();
    expect(exportedData.wellbeing).toBeDefined();
    expect(exportedData.assistant).toBeDefined();
    expect(exportedData.localStorageExtra).toBeDefined();

    // Проверяем gamification
    expect(exportedData.gamification).toHaveProperty('xp', 1000);
    expect(exportedData.gamification).toHaveProperty('level', 5);

    // Проверяем wellbeing
    expect(exportedData.wellbeing?.raw).toBeDefined();
    expect(exportedData.wellbeing?.daily).toBeDefined();
    expect(exportedData.wellbeing?.monthly).toBeDefined();

    // Проверяем assistant
    expect(exportedData.assistant?.savedInfo).toBe('Test saved info');
    expect(exportedData.assistant?.prompt).toBe('Test prompt');
    expect(exportedData.assistant?.textProvider).toBe('google');
    expect(exportedData.assistant?.mode).toBe('text');
    expect(exportedData.assistant?.messages).toBeDefined();
    expect(exportedData.assistant?.messages?.['2025-01-01']).toBeDefined();

    // Проверяем дополнительные данные
    expect(exportedData.localStorageExtra?.CUSTOM_KEY_TEST).toBe('custom value');

    console.log('✅ Все данные экспортированы корректно!');
  });

  test('должен импортировать все данные обратно без потерь', async ({ page }) => {
    // Слушаем console логи
    page.on('console', msg => {
      if (msg.text().includes('[backup]') || msg.text().includes('[TEST]')) {
        console.log('BROWSER:', msg.text());
      }
    });
    
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Создаем тестовый бэкап
    const testBackup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      nodes: [],
      links: [],
      users: [],
      books: [],
      movies: [],
      games: [],
      purchases: [],
      gamification: {
        xp: 2000,
        level: 10,
        xpHistory: [{ id: '2', amount: 200, source: 'achievement', ts: Date.now() }],
        completions: [],
        processedTasks: { 'task-2': true },
        achievements: [{ id: 'a1', title: 'Test Achievement', description: 'Test', xpReward: 100, createdAt: Date.now() }],
        levelTitles: { 1: { title: 'Новичок', assignedAt: Date.now() } },
        claimedBonuses: { '2025-01-15': { xp: 50, ts: Date.now() } },
        pendingLevelUps: [],
        pendingManualCandidates: [],
      },
      wellbeing: {
        raw: { '2025-01-15': [{ awareness: 4, efficiency: 5, joy: 4, ts: Date.now() }] },
        daily: { '2025-01-15': { awareness: 4, efficiency: 5, joy: 4 } },
        monthly: { '2025-01': { awareness: 4, efficiency: 5, joy: 4 } },
      },
      assistant: {
        savedInfo: 'Imported saved info',
        prompt: 'Imported prompt',
        textProvider: 'openai',
        mode: 'voice',
        messages: {
          '2025-01-15': [{ id: '3', role: 'assistant', text: 'Imported message', ts: Date.now() }]
        },
      },
      localStorageExtra: {
        IMPORTED_KEY: 'imported value'
      },
    };

    // Импортируем через код
    await page.evaluate(async (backup) => {
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const file = new File([blob], 'test-backup.json', { type: 'application/json' });
      const module = await import('/src/exportImport.ts');
      await module.importBackup(file, 'replace');
      console.log('[TEST] Import completed');
    }, testBackup);

    // Даем время на асинхронные операции
    await page.waitForTimeout(1000);

    // Проверяем, что данные импортированы
    const imported = await page.evaluate(() => {
      const gamifRaw = localStorage.getItem('GAMIFICATION_STATE_V1');
      console.log('[TEST] GAMIFICATION_STATE_V1 raw:', gamifRaw ? gamifRaw.substring(0, 100) : 'NULL');
      
      // Zustand persist оборачивает данные в {state: {...}}
      const gamifParsed = JSON.parse(localStorage.getItem('GAMIFICATION_STATE_V1') || '{}');
      const gamification = gamifParsed.state || gamifParsed; // Поддержка обоих форматов
      
      return {
        gamification,
        wellbeingRaw: JSON.parse(localStorage.getItem('WB_RAW_BY_DAY') || '{}'),
        wellbeingDaily: JSON.parse(localStorage.getItem('WB_DAY_AVG_BY_DAY') || '{}'),
        wellbeingMonthly: JSON.parse(localStorage.getItem('WB_MONTH_AVG_BY_MONTH') || '{}'),
        assistantInfo: localStorage.getItem('ASSISTANT_SAVED_INFO_V1'),
        assistantPrompt: localStorage.getItem('ASSISTANT_PROMPT_V1'),
        assistantProvider: localStorage.getItem('ASSISTANT_TEXT_PROVIDER_V1'),
        assistantMode: localStorage.getItem('ASSISTANT_MODE_V1'),
        assistantMessages: JSON.parse(localStorage.getItem('ASSISTANT_MESSAGES_V2:2025-01-15') || '[]'),
        customKey: localStorage.getItem('IMPORTED_KEY'),
      };
    });

    // Проверяем gamification
    expect(imported.gamification.xp).toBe(2000);
    expect(imported.gamification.level).toBe(10);
    expect(imported.gamification.achievements).toHaveLength(1);
    expect(imported.gamification.achievements[0].title).toBe('Test Achievement');
    expect(imported.gamification.claimedBonuses['2025-01-15'].xp).toBe(50);

    // Проверяем wellbeing
    expect(imported.wellbeingRaw['2025-01-15']).toBeDefined();
    expect(imported.wellbeingDaily['2025-01-15'].awareness).toBe(4);
    expect(imported.wellbeingMonthly['2025-01'].efficiency).toBe(5);

    // Проверяем assistant
    expect(imported.assistantInfo).toBe('Imported saved info');
    expect(imported.assistantPrompt).toBe('Imported prompt');
    expect(imported.assistantProvider).toBe('openai');
    expect(imported.assistantMode).toBe('voice');
    expect(imported.assistantMessages).toHaveLength(1);
    expect(imported.assistantMessages[0].text).toBe('Imported message');

    // Проверяем дополнительные данные
    expect(imported.customKey).toBe('imported value');

    console.log('✅ Все данные импортированы корректно без потерь!');
  });
});
