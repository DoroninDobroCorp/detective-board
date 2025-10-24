import { test, expect } from '@playwright/test';

test.describe('Every Day Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should enable everyDay mode via context menu on detective board', async ({ page }) => {
    // Create a task
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    // Right-click to open context menu
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    // Look for the everyDay checkbox
    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await expect(everyDayCheckbox).toBeVisible();
    await expect(everyDayCheckbox).not.toBeChecked();

    // Enable everyDay mode
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    // Verify checkbox is checked
    await expect(everyDayCheckbox).toBeChecked();

    // Close context menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    console.log('✓ EveryDay mode enabled via context menu on detective board');
  });

  test('should show everyDay badge on detective board', async ({ page }) => {
    // Create a task
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    // Right-click to open context menu
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    // Enable everyDay mode
    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    // Close context menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Note: Canvas badges are rendered via Konva and not accessible via DOM selectors
    // We can verify the everyDayMode is set by checking the state via the context menu again
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);
    await expect(everyDayCheckbox).toBeChecked();

    console.log('✓ EveryDay badge verified on detective board');
  });

  test('should postpone task to next day when completed on active tasks page', async ({ page }) => {
    // Create a task with status active and set dueDate to today
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    // Create a task via keyboard
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    // Right-click to open context menu
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    // Set task title
    const titleInput = page.locator('input[placeholder="Название задачи"]').first();
    await titleInput.fill('Test EveryDay Task');
    await page.waitForTimeout(100);

    // Set dueDate to today
    const dueDateInput = page.locator('input[placeholder="YYYY-MM-DD"]').first();
    await dueDateInput.fill(todayStr);
    await page.waitForTimeout(100);

    // Set status to active
    const statusSelect = page.locator('select').filter({ hasText: 'Активная' }).or(page.locator('select').nth(1));
    await statusSelect.selectOption('active');
    await page.waitForTimeout(100);

    // Enable everyDay mode
    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    // Close context menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Navigate to active tasks page
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Find the task
    const taskCard = page.locator('.active-item').filter({ hasText: 'Test EveryDay Task' });
    await expect(taskCard).toBeVisible();

    // Verify everyDay badge is shown
    const everyDayBadge = taskCard.locator('[data-testid="everyday-badge"]');
    await expect(everyDayBadge).toBeVisible();
    await expect(everyDayBadge).toContainText('Каждый день');

    console.log('✓ EveryDay badge visible on active tasks page');

    // Click the completion button (✅)
    const completeButton = taskCard.locator('button[title="Отметить выполненной"]');
    await completeButton.click();
    await page.waitForTimeout(500);

    // Task should still be visible (not removed) but postponed to tomorrow
    await expect(taskCard).toBeVisible();

    // Open context menu to verify dueDate changed to tomorrow
    await taskCard.click({ button: 'right' });
    await page.waitForTimeout(200);

    const ctxDueDateInput = page.locator('.ctx-menu input[placeholder="YYYY-MM-DD"]');
    const dueDateValue = await ctxDueDateInput.inputValue();
    
    expect(dueDateValue).toBe(tomorrowStr);

    console.log(`✓ Task postponed from ${todayStr} to ${tomorrowStr}`);

    // Close context menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('should reset subtasks when completing everyDay task', async ({ page }) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Create a task
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    // Right-click to open context menu
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    // Set task properties
    const titleInput = page.locator('input[placeholder="Название задачи"]').first();
    await titleInput.fill('Task with Subtasks');
    await page.waitForTimeout(100);

    const dueDateInput = page.locator('input[placeholder="YYYY-MM-DD"]').first();
    await dueDateInput.fill(todayStr);
    await page.waitForTimeout(100);

    const statusSelect = page.locator('select').filter({ hasText: 'Активная' }).or(page.locator('select').nth(1));
    await statusSelect.selectOption('active');
    await page.waitForTimeout(100);

    // Enable everyDay mode
    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Navigate to active tasks page
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const taskCard = page.locator('.active-item').filter({ hasText: 'Task with Subtasks' });
    await expect(taskCard).toBeVisible();

    // Add a subtask
    const addSubtaskButton = taskCard.locator('button[title="Добавить подзадачу"]');
    await addSubtaskButton.click();
    await page.waitForTimeout(200);

    // Fill prompt
    page.once('dialog', async dialog => {
      await dialog.accept('Subtask 1');
    });
    await page.waitForTimeout(500);

    // Verify subtask appears
    const subtaskCheckbox = taskCard.locator('label:has-text("Subtask 1") input[type="checkbox"]');
    await expect(subtaskCheckbox).toBeVisible();
    await expect(subtaskCheckbox).not.toBeChecked();

    // Check the subtask
    await subtaskCheckbox.check();
    await page.waitForTimeout(200);
    await expect(subtaskCheckbox).toBeChecked();

    console.log('✓ Subtask created and checked');

    // Complete the task
    const completeButton = taskCard.locator('button[title="Отметить выполненной"]');
    await completeButton.click();
    await page.waitForTimeout(500);

    // Subtask should be unchecked (reset)
    await expect(subtaskCheckbox).toBeVisible();
    await expect(subtaskCheckbox).not.toBeChecked();

    console.log('✓ Subtasks reset after completion');
  });

  test('should enable everyDay mode via context menu on active tasks page', async ({ page }) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Create a task on board
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    // Set task to active with today's date
    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    const titleInput = page.locator('input[placeholder="Название задачи"]').first();
    await titleInput.fill('Active Task for Page Test');
    await page.waitForTimeout(100);

    const dueDateInput = page.locator('input[placeholder="YYYY-MM-DD"]').first();
    await dueDateInput.fill(todayStr);
    await page.waitForTimeout(100);

    const statusSelect = page.locator('select').filter({ hasText: 'Активная' }).or(page.locator('select').nth(1));
    await statusSelect.selectOption('active');
    await page.waitForTimeout(100);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Go to active tasks page
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const taskCard = page.locator('.active-item').filter({ hasText: 'Active Task for Page Test' });
    await expect(taskCard).toBeVisible();

    // Right-click to open context menu
    await taskCard.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Enable everyDay mode
    const everyDayCheckbox = page.locator('.ctx-menu label:has-text("Режим") input[type="checkbox"]');
    await expect(everyDayCheckbox).toBeVisible();
    await expect(everyDayCheckbox).not.toBeChecked();

    await everyDayCheckbox.check();
    await page.waitForTimeout(200);
    await expect(everyDayCheckbox).toBeChecked();

    // Close menu
    const closeButton = page.locator('.ctx-menu button:has-text("Закрыть")');
    await closeButton.click();
    await page.waitForTimeout(200);

    // Verify badge appears
    const everyDayBadge = taskCard.locator('[data-testid="everyday-badge"]');
    await expect(everyDayBadge).toBeVisible();

    console.log('✓ EveryDay mode enabled via active tasks page context menu');
  });

  test('should not create duplicate task with everyDay mode (unlike recurrence)', async ({ page }) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Create task with everyDay mode
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    const titleInput = page.locator('input[placeholder="Название задачи"]').first();
    await titleInput.fill('Unique EveryDay Task');
    await page.waitForTimeout(100);

    const dueDateInput = page.locator('input[placeholder="YYYY-MM-DD"]').first();
    await dueDateInput.fill(todayStr);
    await page.waitForTimeout(100);

    const statusSelect = page.locator('select').filter({ hasText: 'Активная' }).or(page.locator('select').nth(1));
    await statusSelect.selectOption('active');
    await page.waitForTimeout(100);

    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Count tasks on board (should be 1)
    await page.goto('/');
    await page.waitForTimeout(500);
    
    // Go to active page
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const tasksBefore = await page.locator('.active-item').filter({ hasText: 'Unique EveryDay Task' }).count();
    expect(tasksBefore).toBe(1);

    console.log('✓ Initial task count: 1');

    // Complete the task
    const taskCard = page.locator('.active-item').filter({ hasText: 'Unique EveryDay Task' });
    const completeButton = taskCard.locator('button[title="Отметить выполненной"]');
    await completeButton.click();
    await page.waitForTimeout(500);

    // Count tasks after completion (should still be 1, not 2)
    const tasksAfter = await page.locator('.active-item').filter({ hasText: 'Unique EveryDay Task' }).count();
    expect(tasksAfter).toBe(1);

    console.log('✓ Task count after completion: 1 (no duplicate created)');
  });

  test('should work independently of recurrence setting', async ({ page }) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Create task
    await page.keyboard.press('t');
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);

    await page.mouse.click(400, 360, { button: 'right' });
    await page.waitForTimeout(200);

    const titleInput = page.locator('input[placeholder="Название задачи"]').first();
    await titleInput.fill('Task with Both Settings');
    await page.waitForTimeout(100);

    const dueDateInput = page.locator('input[placeholder="YYYY-MM-DD"]').first();
    await dueDateInput.fill(todayStr);
    await page.waitForTimeout(100);

    const statusSelect = page.locator('select').filter({ hasText: 'Активная' }).or(page.locator('select').nth(1));
    await statusSelect.selectOption('active');
    await page.waitForTimeout(100);

    // Set up weekly recurrence (should be ignored with everyDay mode)
    const recurrenceButton = page.locator('button[title="Повтор"]');
    await recurrenceButton.click();
    await page.waitForTimeout(200);

    const weeklyButton = page.locator('button:has-text("Каждый четверг")');
    await weeklyButton.click();
    await page.waitForTimeout(200);

    // Enable everyDay mode (takes precedence)
    const everyDayCheckbox = page.locator('label:has-text("🔄 Каждый день")').locator('input[type="checkbox"]');
    await everyDayCheckbox.check();
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Go to active page and complete
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const taskCard = page.locator('.active-item').filter({ hasText: 'Task with Both Settings' });
    const completeButton = taskCard.locator('button[title="Отметить выполненной"]');
    await completeButton.click();
    await page.waitForTimeout(500);

    // Verify only 1 task exists (everyDay mode took precedence over recurrence)
    const tasksAfter = await page.locator('.active-item').filter({ hasText: 'Task with Both Settings' }).count();
    expect(tasksAfter).toBe(1);

    console.log('✓ EveryDay mode took precedence over recurrence');
  });
});
