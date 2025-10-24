// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('Undo Task Completion - XP Deduction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should deduct XP when undoing a task completion', async ({ page }) => {
    // Reset state and create a task via API
    const setupResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Reset all state
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        window.location.reload();
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    if (setupResult.success) {
      await page.waitForTimeout(1000);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    }

    // Create and complete a task
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Create a task
        const taskId = await store.getState().addTask({
          title: 'Test Task for Undo',
          description: 'This task will be completed and then undone',
          status: 'active',
          priority: 'med',
          x: 300,
          y: 300,
        });

        // Complete the task
        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        // Wait a bit for gamification to process
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check XP before processing (should be 0 as gamification manager hasn't processed it yet)
        const xpBefore = gamStore.getState().xp;
        
        // Manually trigger XP award (simulating GamificationManager)
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Test Task for Undo', parentPath: [] },
          300, // medium difficulty
          'medium',
          undefined,
          Date.now()
        );

        const xpAfterCompletion = gamStore.getState().xp;

        // Undo the completion
        await store.getState().updateNode(taskId, { 
          status: 'active', 
          completedAt: undefined 
        });

        const xpAfterUndo = gamStore.getState().xp;
        const levelAfterUndo = gamStore.getState().level;

        // Verify task status changed back
        const task = store.getState().nodes.find((n: any) => n.id === taskId);

        return {
          success: true,
          taskId,
          xpBefore,
          xpAfterCompletion,
          xpAfterUndo,
          levelAfterUndo,
          taskStatus: task?.status,
          taskCompletedAt: task?.completedAt,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Undo completion test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.xpBefore).toBe(0);
      expect(result.xpAfterCompletion).toBe(300);
      expect(result.xpAfterUndo).toBe(0);
      expect(result.taskStatus).toBe('active');
      expect(result.taskCompletedAt).toBeUndefined();
      
      console.log('✓ XP before completion: 0');
      console.log('✓ XP after completion: 300');
      console.log('✓ XP after undo: 0 (correctly deducted)');
      console.log('✓ Task status reverted to active');
      console.log('✓ CompletedAt timestamp cleared');
    }
  });

  test('should show undo button in completed tasks page', async ({ page }) => {
    // Create and complete a task
    await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      if (!store) return;

      await store.getState().resetAll();
      
      const taskId = await store.getState().addTask({
        title: 'Task to Undo from UI',
        status: 'active',
      });

      await store.getState().updateNode(taskId, { 
        status: 'done', 
        completedAt: Date.now() 
      });
    });

    // Navigate to completed tasks page
    await page.goto('/completed');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Find the task card
    const taskCard = page.locator('.active-item').filter({ hasText: 'Task to Undo from UI' });
    await expect(taskCard).toBeVisible();

    // Verify undo button exists
    const undoButton = taskCard.locator('button[title="Отменить выполнение"]');
    await expect(undoButton).toBeVisible();
    await expect(undoButton).toContainText('↩️');

    console.log('✓ Undo button is visible in completed tasks page');
  });

  test('should deduct XP even when level would decrease', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        
        // Award enough XP to reach level 2
        gamStore.getState().addXp({ amount: 500, source: 'bonus', note: 'Test bonus' });
        
        const levelBefore = gamStore.getState().level;
        const xpBefore = gamStore.getState().xp;

        // Create and complete a task
        const taskId = await store.getState().addTask({
          title: 'Task That May Decrease Level',
          status: 'active',
        });

        await store.getState().updateNode(taskId, { status: 'done', completedAt: Date.now() });
        
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Task That May Decrease Level', parentPath: [] },
          700,
          'hard',
          undefined,
          Date.now()
        );

        const xpAfterCompletion = gamStore.getState().xp;
        const levelAfterCompletion = gamStore.getState().level;

        // Undo the completion (should decrease XP and possibly level)
        await store.getState().updateNode(taskId, { status: 'active', completedAt: undefined });

        const xpAfterUndo = gamStore.getState().xp;
        const levelAfterUndo = gamStore.getState().level;

        return {
          success: true,
          levelBefore,
          xpBefore,
          xpAfterCompletion,
          levelAfterCompletion,
          xpAfterUndo,
          levelAfterUndo,
          xpDeducted: xpAfterCompletion - xpAfterUndo,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Level decrease test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.xpDeducted).toBe(700);
      expect(result.xpAfterUndo).toBe(result.xpBefore);
      
      console.log(`✓ Level before: ${result.levelBefore}, XP: ${result.xpBefore}`);
      console.log(`✓ Level after completion: ${result.levelAfterCompletion}, XP: ${result.xpAfterCompletion}`);
      console.log(`✓ Level after undo: ${result.levelAfterUndo}, XP: ${result.xpAfterUndo}`);
      console.log(`✓ XP correctly deducted: ${result.xpDeducted}`);
    }
  });

  test('should allow re-completing a task after undo', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();

        const taskId = await store.getState().addTask({
          title: 'Re-completable Task',
          status: 'active',
        });

        // Complete first time
        await store.getState().updateNode(taskId, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Re-completable Task', parentPath: [] },
          300,
          'medium'
        );

        const xpAfterFirstCompletion = gamStore.getState().xp;

        // Undo
        await store.getState().updateNode(taskId, { status: 'active', completedAt: undefined });
        const xpAfterUndo = gamStore.getState().xp;

        // Complete second time
        await store.getState().updateNode(taskId, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Re-completable Task', parentPath: [] },
          300,
          'medium'
        );

        const xpAfterSecondCompletion = gamStore.getState().xp;

        return {
          success: true,
          xpAfterFirstCompletion,
          xpAfterUndo,
          xpAfterSecondCompletion,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Re-completion test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.xpAfterFirstCompletion).toBe(300);
      expect(result.xpAfterUndo).toBe(0);
      expect(result.xpAfterSecondCompletion).toBe(300);
      
      console.log('✓ Task can be re-completed after undo');
      console.log('✓ XP awarded correctly both times');
    }
  });
});
