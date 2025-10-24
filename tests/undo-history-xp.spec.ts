// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('History Undo - XP Restoration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should restore XP when using history undo (Ctrl+Z)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Reset all state
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get initial XP (should be 0)
        const xpInitial = gamStore.getState().xp;
        
        // Create a task (this creates a history entry)
        const taskId = await store.getState().addTask({
          title: 'Task for History Undo Test',
          status: 'active',
          x: 300,
          y: 300,
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Complete the task (this creates another history entry)
        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        // Award XP manually (simulating GamificationManager)
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Task for History Undo Test', parentPath: [] },
          300,
          'medium',
          undefined,
          Date.now()
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterCompletion = gamStore.getState().xp;
        const levelAfterCompletion = gamStore.getState().level;
        const historyPastLength = store.getState().historyPast.length;

        // Now use HISTORY UNDO (not direct status change)
        await store.getState().undo();

        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterUndo = gamStore.getState().xp;
        const levelAfterUndo = gamStore.getState().level;
        const taskAfterUndo = store.getState().nodes.find((n: any) => n.id === taskId);

        // Test redo as well
        await store.getState().redo();
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterRedo = gamStore.getState().xp;
        const levelAfterRedo = gamStore.getState().level;
        const taskAfterRedo = store.getState().nodes.find((n: any) => n.id === taskId);

        return {
          success: true,
          xpInitial,
          xpAfterCompletion,
          levelAfterCompletion,
          xpAfterUndo,
          levelAfterUndo,
          taskStatusAfterUndo: taskAfterUndo?.status,
          xpAfterRedo,
          levelAfterRedo,
          taskStatusAfterRedo: taskAfterRedo?.status,
          historyPastLength,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('History undo XP test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.xpInitial).toBe(0);
      expect(result.xpAfterCompletion).toBe(300);
      expect(result.xpAfterUndo).toBe(0);
      expect(result.taskStatusAfterUndo).toBe('active');
      
      // After redo, XP should be restored back
      expect(result.xpAfterRedo).toBe(300);
      expect(result.taskStatusAfterRedo).toBe('done');
      
      console.log('✓ Initial XP: 0');
      console.log(`✓ XP after completion: ${result.xpAfterCompletion}`);
      console.log(`✓ XP after history undo: ${result.xpAfterUndo} (correctly restored)`);
      console.log(`✓ Task status after undo: ${result.taskStatusAfterUndo}`);
      console.log(`✓ XP after redo: ${result.xpAfterRedo} (correctly restored)`);
      console.log(`✓ Task status after redo: ${result.taskStatusAfterRedo}`);
      console.log(`✓ History entries: ${result.historyPastLength}`);
    }
  });

  test('should restore XP correctly with multiple operations', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpSnapshots: number[] = [];
        xpSnapshots.push(gamStore.getState().xp); // Should be 0

        // Operation 1: Create task A
        const taskA = await store.getState().addTask({
          title: 'Task A',
          status: 'active',
        });
        xpSnapshots.push(gamStore.getState().xp); // Still 0

        // Operation 2: Complete task A
        await store.getState().updateNode(taskA, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskA, title: 'Task A', parentPath: [] },
          300,
          'medium'
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        xpSnapshots.push(gamStore.getState().xp); // Should be 300

        // Operation 3: Create task B
        const taskB = await store.getState().addTask({
          title: 'Task B',
          status: 'active',
        });
        xpSnapshots.push(gamStore.getState().xp); // Still 300

        // Operation 4: Complete task B
        await store.getState().updateNode(taskB, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskB, title: 'Task B', parentPath: [] },
          500,
          'hard'
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        xpSnapshots.push(gamStore.getState().xp); // Should be 800

        // Now undo 4 times
        const undoSnapshots: number[] = [];
        
        // Undo 1: Should revert task B completion
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));
        undoSnapshots.push(gamStore.getState().xp); // Should be 300

        // Undo 2: Should revert task B creation
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));
        undoSnapshots.push(gamStore.getState().xp); // Should be 300

        // Undo 3: Should revert task A completion
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));
        undoSnapshots.push(gamStore.getState().xp); // Should be 0

        // Undo 4: Should revert task A creation
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));
        undoSnapshots.push(gamStore.getState().xp); // Should be 0

        return {
          success: true,
          xpSnapshots,
          undoSnapshots,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Multiple operations test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.xpSnapshots).toEqual([0, 0, 300, 300, 800]);
      expect(result.undoSnapshots).toEqual([300, 300, 0, 0]);
      
      console.log('✓ XP progression:', result.xpSnapshots);
      console.log('✓ XP after undos:', result.undoSnapshots);
      console.log('✓ XP correctly restored at each undo step');
    }
  });

  test('should restore level changes when undoing XP', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Award enough XP to reach level 2 (>= 450 XP for level 2)
        gamStore.getState().addXp({ amount: 450, source: 'bonus', note: 'Test bonus' });
        await new Promise(resolve => setTimeout(resolve, 100));

        const levelBefore = gamStore.getState().level;
        const xpBefore = gamStore.getState().xp;

        // Create and complete a high-XP task to reach level 3
        const taskId = await store.getState().addTask({
          title: 'High XP Task',
          status: 'active',
        });

        await store.getState().updateNode(taskId, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'High XP Task', parentPath: [] },
          1000,
          'hard'
        );
        await new Promise(resolve => setTimeout(resolve, 100));

        const levelAfterCompletion = gamStore.getState().level;
        const xpAfterCompletion = gamStore.getState().xp;

        // Undo the completion
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));

        const levelAfterUndo = gamStore.getState().level;
        const xpAfterUndo = gamStore.getState().xp;

        return {
          success: true,
          levelBefore,
          xpBefore,
          levelAfterCompletion,
          xpAfterCompletion,
          levelAfterUndo,
          xpAfterUndo,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Level restoration test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      expect(result.levelBefore).toBeGreaterThanOrEqual(1);
      expect(result.levelAfterCompletion).toBeGreaterThanOrEqual(result.levelBefore);
      expect(result.levelAfterUndo).toBe(result.levelBefore);
      expect(result.xpAfterUndo).toBe(result.xpBefore);
      
      console.log(`✓ Level before: ${result.levelBefore}, XP: ${result.xpBefore}`);
      console.log(`✓ Level after completion: ${result.levelAfterCompletion}, XP: ${result.xpAfterCompletion}`);
      console.log(`✓ Level after undo: ${result.levelAfterUndo}, XP: ${result.xpAfterUndo}`);
      console.log('✓ Level correctly restored after undo');
    }
  });

  test('should maintain XP history integrity across undo/redo', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create and complete a task
        const taskId = await store.getState().addTask({
          title: 'Task for XP History Test',
          status: 'active',
        });

        await store.getState().updateNode(taskId, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Task for XP History Test', parentPath: [] },
          300,
          'medium'
        );
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpHistoryAfterCompletion = [...gamStore.getState().xpHistory];
        const completionsAfterCompletion = [...gamStore.getState().completions];
        const processedTasksAfterCompletion = { ...gamStore.getState().processedTasks };

        // Undo
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpHistoryAfterUndo = [...gamStore.getState().xpHistory];
        const completionsAfterUndo = [...gamStore.getState().completions];
        const processedTasksAfterUndo = { ...gamStore.getState().processedTasks };

        // Redo
        await store.getState().redo();
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpHistoryAfterRedo = [...gamStore.getState().xpHistory];
        const completionsAfterRedo = [...gamStore.getState().completions];
        const processedTasksAfterRedo = { ...gamStore.getState().processedTasks };

        return {
          success: true,
          xpHistoryLengthAfterCompletion: xpHistoryAfterCompletion.length,
          xpHistoryLengthAfterUndo: xpHistoryAfterUndo.length,
          xpHistoryLengthAfterRedo: xpHistoryAfterRedo.length,
          completionsLengthAfterCompletion: completionsAfterCompletion.length,
          completionsLengthAfterUndo: completionsAfterUndo.length,
          completionsLengthAfterRedo: completionsAfterRedo.length,
          processedTasksCountAfterCompletion: Object.keys(processedTasksAfterCompletion).length,
          processedTasksCountAfterUndo: Object.keys(processedTasksAfterUndo).length,
          processedTasksCountAfterRedo: Object.keys(processedTasksAfterRedo).length,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('XP history integrity test result:', result);
    expect(result.success).toBeTruthy();
    
    if (result.success) {
      // After completion: should have 1 entry in each
      expect(result.xpHistoryLengthAfterCompletion).toBeGreaterThanOrEqual(1);
      expect(result.completionsLengthAfterCompletion).toBeGreaterThanOrEqual(1);
      expect(result.processedTasksCountAfterCompletion).toBeGreaterThanOrEqual(1);

      // After undo: should be back to 0
      expect(result.xpHistoryLengthAfterUndo).toBe(0);
      expect(result.completionsLengthAfterUndo).toBe(0);
      expect(result.processedTasksCountAfterUndo).toBe(0);

      // After redo: should match after completion
      expect(result.xpHistoryLengthAfterRedo).toBe(result.xpHistoryLengthAfterCompletion);
      expect(result.completionsLengthAfterRedo).toBe(result.completionsLengthAfterCompletion);
      expect(result.processedTasksCountAfterRedo).toBe(result.processedTasksCountAfterCompletion);
      
      console.log('✓ XP history correctly maintained across undo/redo');
      console.log(`  After completion: ${result.xpHistoryLengthAfterCompletion} XP entries, ${result.completionsLengthAfterCompletion} completions`);
      console.log(`  After undo: ${result.xpHistoryLengthAfterUndo} XP entries, ${result.completionsLengthAfterUndo} completions`);
      console.log(`  After redo: ${result.xpHistoryLengthAfterRedo} XP entries, ${result.completionsLengthAfterRedo} completions`);
    }
  });
});
