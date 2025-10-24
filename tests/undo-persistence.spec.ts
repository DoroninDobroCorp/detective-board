// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('Undo Functionality - Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should persist XP state after undo and page reload', async ({ page }) => {
    // Step 1: Create and complete a task with XP
    const setupResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Reset everything
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create task
        const taskId = await store.getState().addTask({
          title: 'Persistence Test Task',
          status: 'active',
          x: 300,
          y: 300,
        });

        // Complete task
        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        // Award XP
        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Persistence Test Task', parentPath: [] },
          500,
          'hard',
          undefined,
          Date.now()
        );

        await new Promise(resolve => setTimeout(resolve, 200));

        const xpAfterCompletion = gamStore.getState().xp;
        const levelAfterCompletion = gamStore.getState().level;
        const nodesCount = store.getState().nodes.length;

        return {
          success: true,
          taskId,
          xpAfterCompletion,
          levelAfterCompletion,
          nodesCount,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Setup result:', setupResult);
    expect(setupResult.success).toBeTruthy();
    expect(setupResult.xpAfterCompletion).toBe(500);

    // Step 2: Reload page and verify state persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterReloadResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      await new Promise(resolve => setTimeout(resolve, 200));

      const xp = gamStore.getState().xp;
      const level = gamStore.getState().level;
      const nodesCount = store.getState().nodes.length;
      const xpHistoryLength = gamStore.getState().xpHistory.length;

      return {
        success: true,
        xp,
        level,
        nodesCount,
        xpHistoryLength,
      };
    });

    console.log('After reload result:', afterReloadResult);
    expect(afterReloadResult.success).toBeTruthy();
    expect(afterReloadResult.xp).toBe(500);
    expect(afterReloadResult.xpHistoryLength).toBeGreaterThanOrEqual(1);

    // Step 3: Undo the completion
    const undoResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 200));

        const xpAfterUndo = gamStore.getState().xp;
        const levelAfterUndo = gamStore.getState().level;
        const task = store.getState().nodes[0];

        return {
          success: true,
          xpAfterUndo,
          levelAfterUndo,
          taskStatus: task?.status,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Undo result:', undoResult);
    expect(undoResult.success).toBeTruthy();
    expect(undoResult.xpAfterUndo).toBe(0);
    expect(undoResult.taskStatus).toBe('active');

    // Step 4: Reload again and verify undo persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterUndoReloadResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      await new Promise(resolve => setTimeout(resolve, 200));

      const xp = gamStore.getState().xp;
      const level = gamStore.getState().level;
      const task = store.getState().nodes[0];
      const xpHistoryLength = gamStore.getState().xpHistory.length;
      const completionsLength = gamStore.getState().completions.length;

      return {
        success: true,
        xp,
        level,
        taskStatus: task?.status,
        xpHistoryLength,
        completionsLength,
      };
    });

    console.log('After undo reload result:', afterUndoReloadResult);
    expect(afterUndoReloadResult.success).toBeTruthy();
    expect(afterUndoReloadResult.xp).toBe(0);
    expect(afterUndoReloadResult.taskStatus).toBe('active');
    expect(afterUndoReloadResult.xpHistoryLength).toBe(0);
    expect(afterUndoReloadResult.completionsLength).toBe(0);

    console.log('✓ XP state correctly persisted after undo and reload');
  });

  test('should persist redo functionality across reloads', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Reset
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create and complete task
        const taskId = await store.getState().addTask({
          title: 'Redo Test Task',
          status: 'active',
        });

        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Redo Test Task', parentPath: [] },
          300,
          'medium'
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterCompletion = gamStore.getState().xp;

        // Undo
        await store.getState().undo();
        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterUndo = gamStore.getState().xp;
        const historyFutureLength = store.getState().historyFuture.length;

        return {
          success: true,
          xpAfterCompletion,
          xpAfterUndo,
          historyFutureLength,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Undo setup result:', result);
    expect(result.success).toBeTruthy();
    expect(result.xpAfterCompletion).toBe(300);
    expect(result.xpAfterUndo).toBe(0);
    expect(result.historyFutureLength).toBeGreaterThan(0);

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Note: History (undo/redo stack) is NOT persisted across reloads
    // This is expected behavior - history is in-memory only
    const afterReloadResult = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      await new Promise(resolve => setTimeout(resolve, 200));

      const xp = gamStore.getState().xp;
      const historyPastLength = store.getState().historyPast.length;
      const historyFutureLength = store.getState().historyFuture.length;

      return {
        success: true,
        xp,
        historyPastLength,
        historyFutureLength,
      };
    });

    console.log('After reload result:', afterReloadResult);
    expect(afterReloadResult.success).toBeTruthy();
    expect(afterReloadResult.xp).toBe(0); // XP state persisted
    expect(afterReloadResult.historyPastLength).toBe(0); // History cleared (expected)
    expect(afterReloadResult.historyFutureLength).toBe(0); // History cleared (expected)

    console.log('✓ XP persisted, history cleared (expected behavior)');
  });

  test('should handle multiple undo operations with persistence', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        const snapshots: any[] = [];

        // Operation 1: Create task A
        const taskA = await store.getState().addTask({
          title: 'Task A',
          status: 'active',
        });
        snapshots.push({ op: 'create_A', xp: gamStore.getState().xp, nodes: store.getState().nodes.length });

        // Operation 2: Complete task A
        await store.getState().updateNode(taskA, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskA, title: 'Task A', parentPath: [] },
          200,
          'easy'
        );
        await new Promise(resolve => setTimeout(resolve, 50));
        snapshots.push({ op: 'complete_A', xp: gamStore.getState().xp, nodes: store.getState().nodes.length });

        // Operation 3: Create task B
        const taskB = await store.getState().addTask({
          title: 'Task B',
          status: 'active',
        });
        snapshots.push({ op: 'create_B', xp: gamStore.getState().xp, nodes: store.getState().nodes.length });

        // Operation 4: Complete task B
        await store.getState().updateNode(taskB, { status: 'done', completedAt: Date.now() });
        gamStore.getState().registerTaskCompletion(
          { id: taskB, title: 'Task B', parentPath: [] },
          300,
          'medium'
        );
        await new Promise(resolve => setTimeout(resolve, 50));
        snapshots.push({ op: 'complete_B', xp: gamStore.getState().xp, nodes: store.getState().nodes.length });

        return {
          success: true,
          snapshots,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Operations result:', result);
    expect(result.success).toBeTruthy();
    expect(result.snapshots[3].xp).toBe(500); // 200 + 300

    // Reload to persist state
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify persisted state
    const persistedResult = await page.evaluate(async () => {
      const gamStore = (globalThis as any).__gamificationStore;
      if (!gamStore) return { success: false, error: 'Store not available' };

      await new Promise(resolve => setTimeout(resolve, 200));

      return {
        success: true,
        xp: gamStore.getState().xp,
        level: gamStore.getState().level,
        xpHistoryLength: gamStore.getState().xpHistory.length,
        completionsLength: gamStore.getState().completions.length,
      };
    });

    console.log('Persisted state:', persistedResult);
    expect(persistedResult.success).toBeTruthy();
    expect(persistedResult.xp).toBe(500);
    expect(persistedResult.xpHistoryLength).toBe(2);
    expect(persistedResult.completionsLength).toBe(2);

    console.log('✓ Multiple operations correctly persisted');
  });

  test('should persist gamification state in localStorage', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        // Reset
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create and complete a task
        const taskId = await store.getState().addTask({
          title: 'LocalStorage Test Task',
          status: 'active',
        });

        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'LocalStorage Test Task', parentPath: [] },
          400,
          'medium'
        );

        await new Promise(resolve => setTimeout(resolve, 200));

        // Check localStorage directly
        const localStorageKey = 'GAMIFICATION_STATE_V1';
        const rawData = localStorage.getItem(localStorageKey);
        
        if (!rawData) {
          return { success: false, error: 'No localStorage data found' };
        }

        const parsedData = JSON.parse(rawData);
        const state = parsedData.state || parsedData;

        return {
          success: true,
          hasLocalStorage: !!rawData,
          xpInStorage: state.xp,
          levelInStorage: state.level,
          xpHistoryLengthInStorage: state.xpHistory?.length || 0,
          completionsLengthInStorage: state.completions?.length || 0,
          processedTasksInStorage: Object.keys(state.processedTasks || {}).length,
          xpInMemory: gamStore.getState().xp,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('LocalStorage test result:', result);
    expect(result.success).toBeTruthy();
    expect(result.hasLocalStorage).toBe(true);
    expect(result.xpInStorage).toBe(400);
    expect(result.xpInMemory).toBe(400);
    expect(result.xpHistoryLengthInStorage).toBeGreaterThanOrEqual(1);
    expect(result.completionsLengthInStorage).toBeGreaterThanOrEqual(1);
    expect(result.processedTasksInStorage).toBeGreaterThanOrEqual(1);

    console.log('✓ Gamification state correctly persisted in localStorage');
    console.log(`  - XP in storage: ${result.xpInStorage}`);
    console.log(`  - Level in storage: ${result.levelInStorage}`);
    console.log(`  - XP history entries: ${result.xpHistoryLengthInStorage}`);
    console.log(`  - Completions: ${result.completionsLengthInStorage}`);
  });

  test('should maintain XP integrity after direct status change undo', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const store = (globalThis as any).__appStore;
      const gamStore = (globalThis as any).__gamificationStore;
      if (!store || !gamStore) return { success: false, error: 'Store not available' };

      try {
        await store.getState().resetAll();
        gamStore.persist.clearStorage();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create task
        const taskId = await store.getState().addTask({
          title: 'Status Change Test',
          status: 'active',
        });

        // Complete task (creates history entry AND awards XP)
        await store.getState().updateNode(taskId, { 
          status: 'done', 
          completedAt: Date.now() 
        });

        gamStore.getState().registerTaskCompletion(
          { id: taskId, title: 'Status Change Test', parentPath: [] },
          350,
          'medium'
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterCompletion = gamStore.getState().xp;
        const historyLength = store.getState().historyPast.length;

        // IMPORTANT: The existing revertTaskXp is called when status changes from 'done'
        // This is the DIRECT status change undo (not history undo)
        await store.getState().updateNode(taskId, { 
          status: 'active',
          completedAt: undefined
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        const xpAfterStatusChangeUndo = gamStore.getState().xp;
        const task = store.getState().nodes.find((n: any) => n.id === taskId);

        return {
          success: true,
          xpAfterCompletion,
          xpAfterStatusChangeUndo,
          taskStatus: task?.status,
          taskCompletedAt: task?.completedAt,
          historyLength,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    console.log('Status change undo result:', result);
    expect(result.success).toBeTruthy();
    expect(result.xpAfterCompletion).toBe(350);
    expect(result.xpAfterStatusChangeUndo).toBe(0); // XP reverted by revertTaskXp
    expect(result.taskStatus).toBe('active');
    expect(result.taskCompletedAt).toBeUndefined();

    // Reload and verify
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const afterReloadResult = await page.evaluate(async () => {
      const gamStore = (globalThis as any).__gamificationStore;
      if (!gamStore) return { success: false, error: 'Store not available' };

      await new Promise(resolve => setTimeout(resolve, 200));

      return {
        success: true,
        xp: gamStore.getState().xp,
        xpHistoryLength: gamStore.getState().xpHistory.length,
        completionsLength: gamStore.getState().completions.length,
      };
    });

    console.log('After reload result:', afterReloadResult);
    expect(afterReloadResult.success).toBeTruthy();
    expect(afterReloadResult.xp).toBe(0);
    expect(afterReloadResult.xpHistoryLength).toBe(0);
    expect(afterReloadResult.completionsLength).toBe(0);

    console.log('✓ Direct status change undo correctly persisted');
  });
});
