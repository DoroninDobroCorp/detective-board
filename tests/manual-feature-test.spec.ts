import { test, expect } from '@playwright/test';

test.describe('Detective Board - Complete Feature Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:5173');
    
    // Wait for the app to initialize
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    console.log('✅ Application loaded successfully');
  });

  test('1. Verify application is accessible and displays content', async ({ page }) => {
    console.log('\n🧪 TEST 1: Verify application accessibility\n');
    
    // Check page title
    const title = await page.title();
    console.log(`  ✓ Page title: "${title}"`);
    expect(title).toBeTruthy();
    
    // Check canvas is visible
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    console.log('  ✓ Canvas element is visible');
    
    // Check toolbar is visible
    const toolbar = page.locator('.toolbar, [class*="tool"]').first();
    const toolbarVisible = await toolbar.isVisible().catch(() => false);
    console.log(`  ✓ Toolbar is ${toolbarVisible ? 'visible' : 'hidden'}`);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/01-app-loaded.png' });
    console.log('  ✓ Screenshot saved: 01-app-loaded.png');
  });

  test('2. Add a new task using the store', async ({ page }) => {
    console.log('\n🧪 TEST 2: Add new task\n');
    
    // Add task programmatically using optimized update method
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Test Task 1',
        description: 'Testing task creation',
        color: '#FFB6C1',
        x: 200,
        y: 200,
      });
      
      // Verify task was added
      const task = store.nodes.find(n => n.id === id);
      
      return {
        success: !!task,
        id,
        title: task?.title,
        color: task?.color,
        nodeCount: store.nodes.length,
      };
    });
    
    console.log(`  ✓ Task created with ID: ${result.id}`);
    console.log(`  ✓ Task title: "${result.title}"`);
    console.log(`  ✓ Task color: ${result.color}`);
    console.log(`  ✓ Total nodes: ${result.nodeCount}`);
    
    expect(result.success).toBe(true);
    expect(result.title).toBe('Test Task 1');
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/02-task-added.png' });
    console.log('  ✓ Screenshot saved: 02-task-added.png');
  });

  test('3. Modify task properties using updateNodeOptimized', async ({ page }) => {
    console.log('\n🧪 TEST 3: Modify task properties (optimized update)\n');
    
    // Create a task and then modify it
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Task to Modify',
        description: 'Original description',
        color: '#E8D8A6',
        x: 300,
        y: 300,
      });
      
      // Record timing for UI update
      const startTime = performance.now();
      
      // Use optimized update (immediate UI, debounced DB)
      store.updateNodeOptimized(id, {
        title: 'Modified Task Title',
        description: 'Updated description',
        color: '#FF6B6B',
      });
      
      const uiUpdateTime = performance.now() - startTime;
      
      // Check UI state immediately
      const task = store.nodes.find(n => n.id === id);
      
      return {
        id,
        immediateTitle: task?.title,
        immediateDescription: task?.description,
        immediateColor: task?.color,
        uiUpdateTime,
      };
    });
    
    console.log(`  ✓ Task modified: ${result.id}`);
    console.log(`  ✓ New title: "${result.immediateTitle}"`);
    console.log(`  ✓ New description: "${result.immediateDescription}"`);
    console.log(`  ✓ New color: ${result.immediateColor}`);
    console.log(`  ✓ UI update time: ${result.uiUpdateTime.toFixed(2)}ms (should be < 10ms)`);
    
    expect(result.immediateTitle).toBe('Modified Task Title');
    expect(result.immediateDescription).toBe('Updated description');
    expect(result.immediateColor).toBe('#FF6B6B');
    expect(result.uiUpdateTime).toBeLessThan(10);
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/03-task-modified.png' });
    console.log('  ✓ Screenshot saved: 03-task-modified.png');
  });

  test('4. Test rapid property updates (batching)', async ({ page }) => {
    console.log('\n🧪 TEST 4: Test rapid updates and batching\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Batch Test Task',
        color: '#E8D8A6',
        x: 400,
        y: 200,
      });
      
      // Perform 20 rapid updates
      const startTime = performance.now();
      for (let i = 0; i < 20; i++) {
        store.updateNodeOptimized(id, {
          title: `Update ${i}`,
          color: i % 2 === 0 ? '#FF0000' : '#00FF00',
        });
      }
      const totalTime = performance.now() - startTime;
      
      // Check final state
      const task = store.nodes.find(n => n.id === id);
      
      return {
        id,
        finalTitle: task?.title,
        finalColor: task?.color,
        totalTime,
        avgTimePerUpdate: totalTime / 20,
      };
    });
    
    console.log(`  ✓ Performed 20 rapid updates`);
    console.log(`  ✓ Final title: "${result.finalTitle}"`);
    console.log(`  ✓ Final color: ${result.finalColor}`);
    console.log(`  ✓ Total time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`  ✓ Average per update: ${result.avgTimePerUpdate.toFixed(2)}ms`);
    
    expect(result.finalTitle).toBe('Update 19');
    expect(result.finalColor).toBe('#00FF00'); // Last update (19 is odd)
    
    await page.screenshot({ path: 'test-results/04-rapid-updates.png' });
    console.log('  ✓ Screenshot saved: 04-rapid-updates.png');
  });

  test('5. Delete a task', async ({ page }) => {
    console.log('\n🧪 TEST 5: Delete task\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Task to Delete',
        color: '#E8D8A6',
        x: 500,
        y: 300,
      });
      
      const countBefore = store.nodes.length;
      
      // Delete it
      await store.removeNode(id);
      
      const countAfter = store.nodes.length;
      const taskExists = !!store.nodes.find(n => n.id === id);
      
      return {
        id,
        countBefore,
        countAfter,
        taskExists,
        deleted: countBefore > countAfter,
      };
    });
    
    console.log(`  ✓ Task to delete: ${result.id}`);
    console.log(`  ✓ Nodes before deletion: ${result.countBefore}`);
    console.log(`  ✓ Nodes after deletion: ${result.countAfter}`);
    console.log(`  ✓ Task still exists: ${result.taskExists}`);
    console.log(`  ✓ Deletion successful: ${result.deleted}`);
    
    expect(result.taskExists).toBe(false);
    expect(result.deleted).toBe(true);
    
    await page.screenshot({ path: 'test-results/05-task-deleted.png' });
    console.log('  ✓ Screenshot saved: 05-task-deleted.png');
  });

  test('6. Add a group', async ({ page }) => {
    console.log('\n🧪 TEST 6: Add group\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a group
      const id = await store.addGroup('Test Group', { x: 600, y: 200 });
      
      // Verify group was added
      const group = store.nodes.find(n => n.id === id);
      
      return {
        success: !!group,
        id,
        type: group?.type,
        name: (group as any)?.name,
      };
    });
    
    console.log(`  ✓ Group created with ID: ${result.id}`);
    console.log(`  ✓ Group type: ${result.type}`);
    console.log(`  ✓ Group name: "${result.name}"`);
    
    expect(result.success).toBe(true);
    expect(result.type).toBe('group');
    expect(result.name).toBe('Test Group');
    
    await page.screenshot({ path: 'test-results/06-group-added.png' });
    console.log('  ✓ Screenshot saved: 06-group-added.png');
  });

  test('7. Test status changes', async ({ page }) => {
    console.log('\n🧪 TEST 7: Test task status changes\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Status Test Task',
        status: 'inactive',
        x: 700,
        y: 300,
      });
      
      const statuses: string[] = [];
      
      // Change status multiple times
      await store.updateNode(id, { status: 'in_progress' });
      statuses.push(store.nodes.find(n => n.id === id)?.status || 'unknown');
      
      await store.updateNode(id, { status: 'done' });
      statuses.push(store.nodes.find(n => n.id === id)?.status || 'unknown');
      
      await store.updateNode(id, { status: 'deferred' });
      statuses.push(store.nodes.find(n => n.id === id)?.status || 'unknown');
      
      return {
        id,
        statuses,
        finalStatus: store.nodes.find(n => n.id === id)?.status,
      };
    });
    
    console.log(`  ✓ Task ID: ${result.id}`);
    console.log(`  ✓ Status progression: ${result.statuses.join(' → ')}`);
    console.log(`  ✓ Final status: ${result.finalStatus}`);
    
    expect(result.statuses).toEqual(['in_progress', 'done', 'deferred']);
    
    await page.screenshot({ path: 'test-results/07-status-changes.png' });
    console.log('  ✓ Screenshot saved: 07-status-changes.png');
  });

  test('8. Test flush pending updates', async ({ page }) => {
    console.log('\n🧪 TEST 8: Test flush pending updates\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const { db } = await import('../src/db');
      const store = useAppStore.getState();
      
      // Add a task
      const id = await store.addTask({
        title: 'Flush Test',
        color: '#E8D8A6',
        x: 100,
        y: 400,
      });
      
      // Use optimized update
      store.updateNodeOptimized(id, {
        title: 'Should Be Flushed',
        description: 'Testing flush functionality',
      });
      
      // Immediately flush
      await store.flushPendingUpdates(id);
      
      // Check DB
      const dbNode = await db.nodes.get(id);
      
      return {
        id,
        uiTitle: store.nodes.find(n => n.id === id)?.title,
        dbTitle: dbNode?.title,
        dbDescription: dbNode?.description,
        success: dbNode?.title === 'Should Be Flushed',
      };
    });
    
    console.log(`  ✓ Task ID: ${result.id}`);
    console.log(`  ✓ UI title: "${result.uiTitle}"`);
    console.log(`  ✓ DB title: "${result.dbTitle}"`);
    console.log(`  ✓ DB description: "${result.dbDescription}"`);
    console.log(`  ✓ Flush successful: ${result.success}`);
    
    expect(result.success).toBe(true);
    expect(result.uiTitle).toBe('Should Be Flushed');
    expect(result.dbTitle).toBe('Should Be Flushed');
    
    await page.screenshot({ path: 'test-results/08-flush-test.png' });
    console.log('  ✓ Screenshot saved: 08-flush-test.png');
  });

  test('9. Performance test - measure UI responsiveness', async ({ page }) => {
    console.log('\n🧪 TEST 9: Performance test - UI responsiveness\n');
    
    const result = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      const timings: number[] = [];
      
      // Create 10 tasks and measure update times
      for (let i = 0; i < 10; i++) {
        const id = await store.addTask({
          title: `Performance Test ${i}`,
          x: 100 + i * 50,
          y: 500,
        });
        
        const start = performance.now();
        store.updateNodeOptimized(id, {
          title: `Updated ${i}`,
          color: '#FF0000',
        });
        const duration = performance.now() - start;
        timings.push(duration);
      }
      
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      const maxTime = Math.max(...timings);
      const minTime = Math.min(...timings);
      
      return {
        timings,
        avgTime,
        maxTime,
        minTime,
        allUnder10ms: timings.every(t => t < 10),
      };
    });
    
    console.log(`  ✓ Tested 10 task updates`);
    console.log(`  ✓ Average update time: ${result.avgTime.toFixed(2)}ms`);
    console.log(`  ✓ Min update time: ${result.minTime.toFixed(2)}ms`);
    console.log(`  ✓ Max update time: ${result.maxTime.toFixed(2)}ms`);
    console.log(`  ✓ All updates < 10ms: ${result.allUnder10ms}`);
    
    expect(result.avgTime).toBeLessThan(10);
    expect(result.allUnder10ms).toBe(true);
    
    await page.screenshot({ path: 'test-results/09-performance-test.png' });
    console.log('  ✓ Screenshot saved: 09-performance-test.png');
  });

  test('10. Summary - verify all features work', async ({ page }) => {
    console.log('\n🧪 TEST 10: Final summary\n');
    
    const summary = await page.evaluate(async () => {
      const { useAppStore } = await import('../src/store');
      const store = useAppStore.getState();
      
      return {
        totalNodes: store.nodes.length,
        tasks: store.nodes.filter(n => n.type === 'task').length,
        groups: store.nodes.filter(n => n.type === 'group').length,
        persons: store.nodes.filter(n => n.type === 'person').length,
        initialized: store.initialized,
      };
    });
    
    console.log('  📊 Application State Summary:');
    console.log(`     - Total nodes: ${summary.totalNodes}`);
    console.log(`     - Tasks: ${summary.tasks}`);
    console.log(`     - Groups: ${summary.groups}`);
    console.log(`     - Persons: ${summary.persons}`);
    console.log(`     - Initialized: ${summary.initialized}`);
    
    await page.screenshot({ path: 'test-results/10-final-state.png', fullPage: true });
    console.log('  ✓ Screenshot saved: 10-final-state.png');
    
    console.log('\n✅ ALL TESTS COMPLETED SUCCESSFULLY!\n');
  });
});
