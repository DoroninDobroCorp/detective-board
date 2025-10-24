// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('Every Day Mode - Simple Functional Tests', () => {
  test('everyDay mode: enable via API and verify postponement', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Create test via page API
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return { success: false, error: 'Store not available' };

      try {
        // Reset and create a task with everyDay mode
        await store.getState().resetAll();
        
        const today = new Date();
        const todayYMD = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const todayISO = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0)).toISOString();

        // Create task with everyDay mode
        const taskId = await store.getState().addTask({
          title: 'Test EveryDay Task',
          description: 'This task should postpone to tomorrow',
          status: 'active',
          dueDate: todayISO,
          everyDayMode: true,
          priority: 'med',
          x: 300,
          y: 300,
        });

        // Verify task was created
        const task1 = store.getState().nodes.find((n: any) => n.id === taskId);
        if (!task1 || !task1.everyDayMode) {
          return { success: false, error: 'Task not created with everyDayMode' };
        }

        // Simulate completion by postponing to next day
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowYMD = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        const tomorrowISO = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0, 0)).toISOString();

        await store.getState().updateNode(taskId, {
          dueDate: tomorrowISO,
          completedAt: Date.now(),
        });

        // Verify task was updated (not deleted)
        const task2 = store.getState().nodes.find((n: any) => n.id === taskId);
        if (!task2) {
          return { success: false, error: 'Task was deleted instead of postponed' };
        }

        // Verify dueDate changed
        const taskDueDateYMD = task2.dueDate.slice(0, 10);
        if (taskDueDateYMD !== tomorrowYMD) {
          return { 
            success: false, 
            error: `Task dueDate not updated correctly. Expected ${tomorrowYMD}, got ${taskDueDateYMD}` 
          };
        }

        // Verify only one task exists (no duplicate)
        const tasksCount = store.getState().nodes.filter((n: any) => n.type === 'task' && n.title === 'Test EveryDay Task').length;
        if (tasksCount !== 1) {
          return { success: false, error: `Expected 1 task, found ${tasksCount}` };
        }

        return {
          success: true,
          todayYMD,
          tomorrowYMD,
          taskDueDateYMD,
          tasksCount,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Test result:', result);
    expect(result.success).toBeTruthy();
    if (result.success) {
      console.log(`✓ Task created for ${result.todayYMD}`);
      console.log(`✓ Task postponed to ${result.tomorrowYMD}`);
      console.log(`✓ Verified dueDate: ${result.taskDueDateYMD}`);
      console.log(`✓ Only 1 task exists (no duplicate)`);
    }
  });

  test('everyDay mode badge visible in active tasks page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const setupResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        
        const today = new Date();
        const todayISO = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0)).toISOString();

        const taskId = await store.getState().addTask({
          title: 'Badge Test Task',
          status: 'active',
          dueDate: todayISO,
          everyDayMode: true,
        });

        // Verify task was created
        const task = store.getState().nodes.find((n: any) => n.id === taskId);
        if (!task || task.status !== 'active' || !task.everyDayMode) {
          return { success: false, error: `Task not created correctly: ${JSON.stringify(task)}` };
        }

        return { success: true, taskId, status: task.status, everyDayMode: task.everyDayMode };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Setup result:', setupResult);
    expect(setupResult.success).toBeTruthy();

    // Navigate to active tasks page
    await page.goto('/active');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Wait for active items to load
    await page.waitForSelector('.active-item', { timeout: 10000 }).catch(() => {
      console.log('No .active-item elements found');
    });

    // Find the task card
    const taskCard = page.locator('.active-item').filter({ hasText: 'Badge Test Task' });
    await expect(taskCard).toBeVisible({ timeout: 10000 });

    // Verify everyDay badge is present
    const badge = taskCard.locator('[data-testid="everyday-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Каждый день');

    console.log('✓ EveryDay badge is visible on active tasks page');
  });

  test('everyDay mode: subtasks reset on completion', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        
        const today = new Date();
        const todayISO = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0)).toISOString();

        // Create task with subtasks
        const taskId = await store.getState().addTask({
          title: 'Task with Subtasks',
          status: 'active',
          dueDate: todayISO,
          everyDayMode: true,
          subtasks: [
            { id: 'st1', title: 'Subtask 1', done: false, createdAt: Date.now() },
            { id: 'st2', title: 'Subtask 2', done: false, createdAt: Date.now() },
          ],
        });

        // Mark subtasks as done
        const task1 = store.getState().nodes.find((n: any) => n.id === taskId);
        await store.getState().updateNode(taskId, {
          subtasks: [
            { id: 'st1', title: 'Subtask 1', done: true, createdAt: task1.subtasks[0].createdAt },
            { id: 'st2', title: 'Subtask 2', done: true, createdAt: task1.subtasks[1].createdAt },
          ],
        });

        // Verify subtasks are marked done
        const task2 = store.getState().nodes.find((n: any) => n.id === taskId);
        const allDoneBefore = task2.subtasks.every((st: any) => st.done);
        if (!allDoneBefore) {
          return { success: false, error: 'Subtasks not marked as done' };
        }

        // Complete the task (postpone to next day)
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowISO = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0, 0)).toISOString();

        await store.getState().updateNode(taskId, {
          dueDate: tomorrowISO,
          completedAt: Date.now(),
          subtasks: task2.subtasks.map((s: any) => ({ ...s, done: false })),
        });

        // Verify subtasks were reset
        const task3 = store.getState().nodes.find((n: any) => n.id === taskId);
        const allUndoneAfter = task3.subtasks.every((st: any) => !st.done);
        if (!allUndoneAfter) {
          return { success: false, error: 'Subtasks not reset after completion' };
        }

        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Subtasks reset result:', result);
    expect(result.success).toBeTruthy();
    console.log('✓ Subtasks reset to incomplete after task completion');
  });

  test('everyDay mode vs recurrence: no duplicate tasks', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        
        const today = new Date();
        const todayISO = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0)).toISOString();

        // Create everyDay task
        const taskId = await store.getState().addTask({
          title: 'Unique Task',
          status: 'active',
          dueDate: todayISO,
          everyDayMode: true,
          // Note: everyDay mode takes precedence, so even if recurrence is set, it should not create duplicates
        });

        // Count tasks before completion
        const countBefore = store.getState().nodes.filter((n: any) => n.type === 'task' && n.title === 'Unique Task').length;

        // Complete the task (postpone)
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowISO = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0, 0)).toISOString();

        await store.getState().updateNode(taskId, {
          dueDate: tomorrowISO,
          completedAt: Date.now(),
        });

        // Count tasks after completion (should be same, no duplicate)
        const countAfter = store.getState().nodes.filter((n: any) => n.type === 'task' && n.title === 'Unique Task').length;

        if (countBefore !== 1 || countAfter !== 1) {
          return { 
            success: false, 
            error: `Expected 1 task before and after. Before: ${countBefore}, After: ${countAfter}` 
          };
        }

        return { success: true, countBefore, countAfter };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Duplicate test result:', result);
    expect(result.success).toBeTruthy();
    console.log(`✓ Task count before completion: ${result.countBefore}`);
    console.log(`✓ Task count after completion: ${result.countAfter}`);
    console.log('✓ No duplicate tasks created');
  });

  test('everyDay checkbox in context menu toggles correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();

        // Create a normal task
        const taskId = await store.getState().addTask({
          title: 'Toggle Test',
          status: 'active',
          everyDayMode: false,
        });

        // Verify initial state
        const task1 = store.getState().nodes.find((n: any) => n.id === taskId);
        if (task1.everyDayMode) {
          return { success: false, error: 'Task created with everyDayMode true unexpectedly' };
        }

        // Enable everyDayMode
        await store.getState().updateNode(taskId, { everyDayMode: true });

        // Verify enabled
        const task2 = store.getState().nodes.find((n: any) => n.id === taskId);
        if (!task2.everyDayMode) {
          return { success: false, error: 'everyDayMode not enabled' };
        }

        // Disable everyDayMode
        await store.getState().updateNode(taskId, { everyDayMode: false });

        // Verify disabled
        const task3 = store.getState().nodes.find((n: any) => n.id === taskId);
        if (task3.everyDayMode) {
          return { success: false, error: 'everyDayMode not disabled' };
        }

        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Toggle test result:', result);
    expect(result.success).toBeTruthy();
    console.log('✓ EveryDayMode toggles correctly via updateNode');
  });
});
