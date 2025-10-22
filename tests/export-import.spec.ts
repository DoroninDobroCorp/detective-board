import { test, expect } from '@playwright/test';

test.describe('Export/Import Data Migration', () => {
  test('should export and import all data including gamification, achievements, and diary', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:5173/detective-board/');
    await page.waitForLoadState('networkidle');

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Step 1: Create test data via console
    await page.evaluate(async () => {
      const { db } = await import('./src/db');
      const { useGamificationStore } = await import('./src/gamification');

      // Clear existing data first
      await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases, db.diary], async () => {
        await db.nodes.clear();
        await db.links.clear();
        await db.users.clear();
        await db.books.clear();
        await db.movies.clear();
        await db.games.clear();
        await db.purchases.clear();
        await db.diary.clear();
      });

      // Add test nodes
      await db.nodes.add({
        id: 'test-task-1',
        type: 'task',
        title: 'Test Task 1',
        status: 'done',
        parentId: null,
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now() - 1000,
      } as any);

      // Add diary entry
      await db.diary.add({
        id: 'diary-1',
        date: '2025-10-21',
        content: 'Test diary entry with important data',
        mood: '😊',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Setup gamification data
      const gamifStore = useGamificationStore.getState();
      
      // Add achievement with image
      const achievement = gamifStore.addAchievement({
        title: 'Test Achievement',
        description: 'This is a test achievement',
        xpReward: 100,
        imageUrl: 'test-image-url',
        achievedAt: Date.now(),
      });

      // Set level and XP
      useGamificationStore.setState({
        level: 5,
        xp: 1500,
        levelTitles: {
          1: { title: 'Новичок', assignedAt: Date.now() - 10000 },
          5: { title: 'Эксперт', assignedAt: Date.now() },
        },
      });

      // Store test image in localStorage
      localStorage.setItem(`img:${achievement.id}`, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

      console.log('Test data created');
    });

    // Step 2: Export data
    const exportData = await page.evaluate(async () => {
      const { getBackupData } = await import('./src/exportImport');
      return await getBackupData();
    });

    console.log('Export data:', {
      nodes: exportData.nodes?.length,
      diary: exportData.diary?.length,
      gamification: exportData.gamification,
      hasLocalStorageExtra: !!exportData.localStorageExtra,
      localStorageKeys: exportData.localStorageExtra ? Object.keys(exportData.localStorageExtra) : [],
    });

    // Step 3: Verify export contains all data
    expect(exportData.nodes).toBeDefined();
    expect(exportData.nodes.length).toBeGreaterThan(0);
    expect(exportData.diary).toBeDefined();
    expect(exportData.diary.length).toBe(1);
    expect(exportData.diary[0].content).toBe('Test diary entry with important data');

    // Verify gamification data
    expect(exportData.gamification).toBeDefined();
    const gamif = exportData.gamification as any;
    expect(gamif.level).toBe(5);
    expect(gamif.xp).toBe(1500);
    expect(gamif.achievements).toBeDefined();
    expect(gamif.achievements.length).toBeGreaterThan(0);
    expect(gamif.achievements[0].title).toBe('Test Achievement');
    expect(gamif.levelTitles).toBeDefined();
    expect(gamif.levelTitles['5']).toBeDefined();
    expect(gamif.levelTitles['5'].title).toBe('Эксперт');

    // Verify localStorage extra contains images
    expect(exportData.localStorageExtra).toBeDefined();
    const imgKeys = Object.keys(exportData.localStorageExtra || {}).filter(k => k.startsWith('img:'));
    console.log('Image keys found:', imgKeys);
    expect(imgKeys.length).toBeGreaterThan(0);

    // Step 4: Clear all data
    await page.evaluate(async () => {
      const { db } = await import('./src/db');
      const { useGamificationStore } = await import('./src/gamification');

      await db.transaction('rw', [db.nodes, db.links, db.users, db.books, db.movies, db.games, db.purchases, db.diary], async () => {
        await db.nodes.clear();
        await db.links.clear();
        await db.users.clear();
        await db.books.clear();
        await db.movies.clear();
        await db.games.clear();
        await db.purchases.clear();
        await db.diary.clear();
      });

      localStorage.clear();
      useGamificationStore.setState({
        xp: 0,
        level: 1,
        xpHistory: [],
        completions: [],
        processedTasks: {},
        achievements: [],
        levelTitles: { 1: { title: 'Новичок', assignedAt: Date.now() } },
        claimedBonuses: {},
        pendingLevelUps: [],
        pendingManualCandidates: [],
      });

      console.log('All data cleared');
    });

    // Step 5: Import data back
    await page.evaluate(async (data) => {
      const { importBackup } = await import('./src/exportImport');
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const file = new File([blob], 'test-backup.json', { type: 'application/json' });
      await importBackup(file, 'replace');
    }, exportData);

    // Reload page to trigger zustand rehydration from localStorage
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Step 6: Verify imported data
    const verifyResult = await page.evaluate(async () => {
      const { db } = await import('./src/db');
      const { useGamificationStore } = await import('./src/gamification');

      const nodes = await db.nodes.toArray();
      const diary = await db.diary.toArray();
      const gamifState = useGamificationStore.getState();

      // Check localStorage images
      const imgKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('img:')) {
          imgKeys.push(key);
        }
      }

      return {
        nodes: nodes.length,
        diaryCount: diary.length,
        diaryContent: diary[0]?.content,
        level: gamifState.level,
        xp: gamifState.xp,
        achievements: gamifState.achievements.length,
        achievementTitle: gamifState.achievements[0]?.title,
        levelTitles: gamifState.levelTitles,
        imgKeys: imgKeys.length,
      };
    });

    console.log('Verify result:', verifyResult);

    // Assertions
    expect(verifyResult.nodes).toBeGreaterThan(0);
    expect(verifyResult.diaryCount).toBe(1);
    expect(verifyResult.diaryContent).toBe('Test diary entry with important data');
    expect(verifyResult.level).toBe(5);
    expect(verifyResult.xp).toBe(1500);
    expect(verifyResult.achievements).toBeGreaterThan(0);
    expect(verifyResult.achievementTitle).toBe('Test Achievement');
    expect(verifyResult.levelTitles['5']).toBeDefined();
    expect(verifyResult.levelTitles['5'].title).toBe('Эксперт');
    expect(verifyResult.imgKeys).toBeGreaterThan(0);

    console.log('✅ All export/import tests passed!');
  });
});
