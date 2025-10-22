import { test, expect } from '@playwright/test';

test('achievements page should load without errors', async ({ page, context }) => {
  console.log('Setting up test data...');
  
  // Navigate to app and set up gamification data
  await page.goto('http://localhost:5173/detective-board/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Inject test gamification data
  await page.evaluate(() => {
    const testData = {
      state: {
        xp: 4650,
        level: 9,
        xpHistory: [
          { id: '1', amount: 100, source: 'task', note: 'Test Task 1', taskId: 'task1', ts: Date.now() - 100000 },
          { id: '2', amount: 100, source: 'task', note: 'Test Task 2', taskId: 'task2', ts: Date.now() - 90000 },
          { id: '3', amount: 100, source: 'task', note: 'Test Task 3', taskId: 'task3', ts: Date.now() - 80000 },
        ],
        completions: [
          { id: 'task1', title: 'Test Task 1', completedAt: Date.now() - 100000, difficulty: 'medium', xp: 100, parentPath: [], iconEmoji: '📝' },
          { id: 'task2', title: 'Test Task 2', completedAt: Date.now() - 90000, difficulty: 'medium', xp: 100, parentPath: [], iconEmoji: '✅' },
          { id: 'task3', title: 'Test Task 3', completedAt: Date.now() - 80000, difficulty: 'medium', xp: 100, parentPath: ['Group 1'], iconEmoji: '🎯' },
        ],
        processedTasks: {},
        achievements: [],
        levelTitles: {
          1: { title: 'Новичок', assignedAt: Date.now() - 10000000 },
          2: { title: 'Практик', assignedAt: Date.now() - 9000000 },
          9: { title: 'Мастер', assignedAt: Date.now() },
        },
        claimedBonuses: {},
        pendingLevelUps: [],
        pendingManualCandidates: [],
      },
      version: 0,
    };
    localStorage.setItem('GAMIFICATION_STATE_V1', JSON.stringify(testData));
  });

  console.log('Navigating to achievements page...');
  await page.goto('http://localhost:5173/detective-board/achievements');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check for errors
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('Page error:', error.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('Console error:', msg.text());
    }
  });

  // Wait a bit to catch any errors
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/achievements-page.png', fullPage: true });

  // Check page loaded
  const title = await page.title();
  console.log('Page title:', title);

  // Check for level display
  const levelText = await page.locator('text=/Уровень \\d+/').first().textContent().catch(() => null);
  console.log('Level text:', levelText);

  // Check for history section
  const historyHeader = await page.locator('text=История уровней').count();
  console.log('History header found:', historyHeader);

  // Log any errors
  if (errors.length > 0) {
    console.log('Total errors found:', errors.length);
    errors.forEach((err, i) => console.log(`Error ${i + 1}:`, err));
  }

  // Assertions
  expect(errors.length).toBe(0);
  expect(historyHeader).toBeGreaterThan(0);
  expect(levelText).toBeTruthy();
});
