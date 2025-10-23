import { test, expect } from '@playwright/test';

test.describe('Optimized Node Updates', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to initialize
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000); // Give time for IndexedDB to initialize
  });

  test('should update UI immediately with updateNodeOptimized', async ({ page }) => {
    // Create a task using the store directly
    const taskId = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Test Task',
        description: 'Original description',
        color: '#E8D8A6',
        x: 100,
        y: 100,
      });
      
      return id;
    });

    expect(taskId).toBeTruthy();

    // Wait a bit for the task to be rendered
    await page.waitForTimeout(500);

    // Test immediate UI update with optimized method
    const uiUpdateResult = await page.evaluate(async (id) => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Record timing
      const startTime = performance.now();
      
      // Update using optimized method (should be immediate)
      store.updateNodeOptimized(id, {
        title: 'Updated Title',
        color: '#FF0000',
      });
      
      const afterUpdateTime = performance.now();
      
      // Check if UI state is updated immediately
      const node = store.nodes.find(n => n.id === id);
      const immediateTitle = node?.title;
      const immediateColor = node?.color;
      
      const uiUpdateDuration = afterUpdateTime - startTime;
      
      return {
        immediateTitle,
        immediateColor,
        uiUpdateDuration,
        nodeFound: !!node,
      };
    }, taskId);

    // Verify immediate UI update
    expect(uiUpdateResult.nodeFound).toBe(true);
    expect(uiUpdateResult.immediateTitle).toBe('Updated Title');
    expect(uiUpdateResult.immediateColor).toBe('#FF0000');
    // UI update should be very fast (< 10ms)
    expect(uiUpdateResult.uiUpdateDuration).toBeLessThan(10);
  });

  test('should batch multiple rapid updates into single DB write', async ({ page }) => {
    const taskId = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const id = await store.addTask({
        title: 'Batch Test Task',
        description: 'Test description',
        color: '#E8D8A6',
        x: 200,
        y: 200,
      });
      
      return id;
    });

    // Perform multiple rapid updates
    const updateResults = await page.evaluate(async (id) => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const updates: string[] = [];
      
      // Rapid updates (should be batched)
      for (let i = 0; i < 10; i++) {
        store.updateNodeOptimized(id, {
          title: `Update ${i}`,
          color: i % 2 === 0 ? '#FF0000' : '#00FF00',
        });
        
        // Check UI state after each update
        const node = store.nodes.find(n => n.id === id);
        updates.push(node?.title || 'not found');
      }
      
      // Get the final state immediately
      const finalNode = store.nodes.find(n => n.id === id);
      
      return {
        updates,
        finalTitle: finalNode?.title,
        finalColor: finalNode?.color,
      };
    }, taskId);

    // All UI updates should reflect the latest value
    expect(updateResults.updates[9]).toBe('Update 9');
    expect(updateResults.finalTitle).toBe('Update 9');
    expect(updateResults.finalColor).toBe('#00FF00'); // Last update (i=9, odd)

    // Wait for debounce period (300ms) plus some buffer
    await page.waitForTimeout(500);

    // Verify the final state persisted to DB
    const dbState = await page.evaluate(async (id) => {
      const { db } = await import('../src/db');
      const node = await db.nodes.get(id);
      return {
        title: node?.title,
        color: node?.color,
      };
    }, taskId);

    // DB should have the final merged state
    expect(dbState.title).toBe('Update 9');
    expect(dbState.color).toBe('#00FF00');
  });

  test('should flush pending updates immediately when requested', async ({ page }) => {
    const taskId = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const id = await store.addTask({
        title: 'Flush Test Task',
        description: 'Test flush',
        color: '#E8D8A6',
        x: 300,
        y: 300,
      });
      
      return id;
    });

    // Update and then flush immediately
    const result = await page.evaluate(async (id) => {
      const { useAppStore } = await import('../src/store');
      const { db } = await import('../src/db');
      const store = useAppStore.getState();
      
      // Make an optimized update
      store.updateNodeOptimized(id, {
        title: 'Flushed Title',
        description: 'Flushed Description',
      });
      
      // Check UI state (should be immediate)
      const uiNode = store.nodes.find(n => n.id === id);
      const uiTitle = uiNode?.title;
      
      // Flush immediately (don't wait for debounce)
      await store.flushPendingUpdates(id);
      
      // Check DB state (should be persisted now)
      const dbNode = await db.nodes.get(id);
      const dbTitle = dbNode?.title;
      const dbDescription = dbNode?.description;
      
      return {
        uiTitle,
        dbTitle,
        dbDescription,
      };
    }, taskId);

    // Both UI and DB should have the updated values
    expect(result.uiTitle).toBe('Flushed Title');
    expect(result.dbTitle).toBe('Flushed Title');
    expect(result.dbDescription).toBe('Flushed Description');
  });

  test('should handle mixed update types correctly', async ({ page }) => {
    const taskId = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const id = await store.addTask({
        title: 'Mixed Update Task',
        color: '#E8D8A6',
        x: 400,
        y: 400,
      });
      
      return id;
    });

    const result = await page.evaluate(async (id) => {
      const { useAppStore } = await import('../src/store');
      const { db } = await import('../src/db');
      const store = useAppStore.getState();
      
      // Use regular update (immediate DB write)
      await store.updateNode(id, { title: 'Regular Update' });
      
      // Check DB immediately
      const afterRegular = await db.nodes.get(id);
      const regularTitle = afterRegular?.title;
      
      // Use optimized update (debounced DB write)
      store.updateNodeOptimized(id, { description: 'Optimized Description' });
      
      // Check UI (should be immediate)
      const uiNode = store.nodes.find(n => n.id === id);
      const uiDescription = uiNode?.description;
      
      // Check DB before debounce (should not have optimized update yet)
      const beforeDebounce = await db.nodes.get(id);
      const dbDescriptionBefore = beforeDebounce?.description;
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Check DB after debounce
      const afterDebounce = await db.nodes.get(id);
      const dbDescriptionAfter = afterDebounce?.description;
      
      return {
        regularTitle,
        uiDescription,
        dbDescriptionBefore,
        dbDescriptionAfter,
      };
    }, taskId);

    // Regular update should persist immediately
    expect(result.regularTitle).toBe('Regular Update');
    
    // Optimized update should be immediate in UI
    expect(result.uiDescription).toBe('Optimized Description');
    
    // But not in DB until debounce completes
    expect(result.dbDescriptionBefore).toBeUndefined();
    expect(result.dbDescriptionAfter).toBe('Optimized Description');
  });

  test('should preserve update order for UI rendering', async ({ page }) => {
    const taskId = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const id = await store.addTask({
        title: 'Order Test',
        color: '#E8D8A6',
        x: 500,
        y: 500,
      });
      
      return id;
    });

    const results = await page.evaluate(async (id) => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const snapshots: string[] = [];
      
      // Make sequential updates
      for (let i = 0; i < 5; i++) {
        store.updateNodeOptimized(id, { title: `Step ${i}` });
        
        // Capture UI state after each update
        const node = store.nodes.find(n => n.id === id);
        snapshots.push(node?.title || 'not found');
        
        // Small delay to ensure updates are processed
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      return { snapshots };
    }, taskId);

    // Each UI snapshot should reflect the corresponding update
    expect(results.snapshots).toEqual([
      'Step 0',
      'Step 1',
      'Step 2',
      'Step 3',
      'Step 4',
    ]);
  });
});
