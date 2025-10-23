import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAppStore } from './store';
import { db } from './db';

// Mock the database
vi.mock('./db', () => ({
  db: {
    nodes: {
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      bulkAdd: vi.fn(),
      bulkPut: vi.fn(),
      bulkDelete: vi.fn(),
      toArray: vi.fn(() => Promise.resolve([])),
      delete: vi.fn(),
      clear: vi.fn(),
    },
    links: {
      add: vi.fn(),
      put: vi.fn(),
      bulkAdd: vi.fn(),
      bulkDelete: vi.fn(),
      toArray: vi.fn(() => Promise.resolve([])),
      delete: vi.fn(),
      clear: vi.fn(),
    },
    users: {
      toArray: vi.fn(() => Promise.resolve([])),
      bulkAdd: vi.fn(),
    },
    books: {
      bulkAdd: vi.fn(),
    },
    movies: {
      bulkAdd: vi.fn(),
    },
    games: {
      bulkAdd: vi.fn(),
    },
    purchases: {
      bulkAdd: vi.fn(),
    },
    transaction: vi.fn((mode, tables, callback) => callback()),
  },
}));

// Mock gamification store
vi.mock('./gamification', () => ({
  useGamificationStore: {
    getState: () => ({
      revertTaskXp: vi.fn(),
    }),
  },
}));

// Mock logger
vi.mock('./logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Store - Optimized Updates', () => {
  beforeEach(async () => {
    // Reset store state
    const store = useAppStore.getState();
    await store.resetAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should update UI immediately with updateNodeOptimized', async () => {
    const store = useAppStore.getState();
    
    // Add a task
    const id = await store.addTask({
      title: 'Test Task',
      description: 'Original description',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    // Clear previous mocks
    vi.clearAllMocks();

    // Record start time
    const startTime = performance.now();

    // Update using optimized method
    store.updateNodeOptimized(id, {
      title: 'Updated Title',
      color: '#FF0000',
    });

    const updateDuration = performance.now() - startTime;

    // Check that UI state is updated immediately
    const node = store.nodes.find(n => n.id === id);
    
    expect(node).toBeDefined();
    expect(node?.title).toBe('Updated Title');
    expect(node?.color).toBe('#FF0000');
    
    // Update should be very fast (< 10ms)
    expect(updateDuration).toBeLessThan(10);
    
    // Database write should NOT have been called yet (debounced)
    expect(db.nodes.put).not.toHaveBeenCalled();
  });

  it('should debounce database writes', async () => {
    vi.useFakeTimers();
    
    const store = useAppStore.getState();
    
    // Add a task
    const id = await store.addTask({
      title: 'Test Task',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    vi.clearAllMocks();

    // Make multiple rapid updates
    store.updateNodeOptimized(id, { title: 'Update 1' });
    store.updateNodeOptimized(id, { title: 'Update 2' });
    store.updateNodeOptimized(id, { title: 'Update 3', color: '#FF0000' });

    // UI should reflect the latest update immediately
    let node = store.nodes.find(n => n.id === id);
    expect(node?.title).toBe('Update 3');
    expect(node?.color).toBe('#FF0000');

    // Database should not have been written yet
    expect(db.nodes.put).not.toHaveBeenCalled();

    // Fast-forward time by 299ms (just before debounce completes)
    vi.advanceTimersByTime(299);
    expect(db.nodes.put).not.toHaveBeenCalled();

    // Fast-forward past debounce delay
    vi.advanceTimersByTime(2);

    // Now database should have been written once with merged updates
    expect(db.nodes.put).toHaveBeenCalledTimes(1);
    
    // Verify the merged patch was persisted
    const persistedNode = (db.nodes.put as any).mock.calls[0][0];
    expect(persistedNode.title).toBe('Update 3');
    expect(persistedNode.color).toBe('#FF0000');

    vi.useRealTimers();
  });

  it('should batch multiple property updates', async () => {
    vi.useFakeTimers();
    
    const store = useAppStore.getState();
    
    const id = await store.addTask({
      title: 'Batch Test',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    vi.clearAllMocks();

    // Simulate rapid user input (like typing or color picking)
    for (let i = 0; i < 10; i++) {
      store.updateNodeOptimized(id, {
        title: `Update ${i}`,
        description: `Description ${i}`,
      });
    }

    // UI should show the last update
    const node = store.nodes.find(n => n.id === id);
    expect(node?.title).toBe('Update 9');
    expect(node?.description).toBe('Description 9');

    // No database writes yet
    expect(db.nodes.put).not.toHaveBeenCalled();

    // Wait for debounce
    vi.advanceTimersByTime(300);

    // Should have made only ONE database write for all 10 updates
    expect(db.nodes.put).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should flush pending updates immediately when requested', async () => {
    vi.useFakeTimers();
    
    const store = useAppStore.getState();
    
    const id = await store.addTask({
      title: 'Flush Test',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    vi.clearAllMocks();

    // Make an optimized update
    store.updateNodeOptimized(id, {
      title: 'Flushed Title',
      description: 'Flushed Description',
    });

    // UI should be updated
    let node = store.nodes.find(n => n.id === id);
    expect(node?.title).toBe('Flushed Title');

    // Database not written yet
    expect(db.nodes.put).not.toHaveBeenCalled();

    // Flush immediately
    await store.flushPendingUpdates(id);

    // Database should be written now
    expect(db.nodes.put).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should handle regular updateNode with immediate persistence', async () => {
    const store = useAppStore.getState();
    
    const id = await store.addTask({
      title: 'Regular Update Test',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    vi.clearAllMocks();

    // Use regular update (should persist immediately)
    await store.updateNode(id, { title: 'Immediately Persisted' });

    // UI should be updated
    const node = store.nodes.find(n => n.id === id);
    expect(node?.title).toBe('Immediately Persisted');

    // Database should have been written immediately
    expect(db.nodes.put).toHaveBeenCalledTimes(1);
  });

  it('should preserve update order in UI', async () => {
    const store = useAppStore.getState();
    
    const id = await store.addTask({
      title: 'Order Test',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    // Make sequential updates and track UI state
    const snapshots: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      store.updateNodeOptimized(id, { title: `Step ${i}` });
      const node = store.nodes.find(n => n.id === id);
      snapshots.push(node?.title || 'not found');
    }

    // Each snapshot should reflect the corresponding update
    expect(snapshots).toEqual([
      'Step 0',
      'Step 1',
      'Step 2',
      'Step 3',
      'Step 4',
    ]);
  });

  it('should merge patches correctly for same node', async () => {
    vi.useFakeTimers();
    
    const store = useAppStore.getState();
    
    const id = await store.addTask({
      title: 'Merge Test',
      description: 'Original',
      color: '#E8D8A6',
      x: 100,
      y: 100,
    });

    vi.clearAllMocks();

    // Update different properties
    store.updateNodeOptimized(id, { title: 'New Title' });
    store.updateNodeOptimized(id, { description: 'New Description' });
    store.updateNodeOptimized(id, { color: '#FF0000' });

    // UI should have all updates
    const node = store.nodes.find(n => n.id === id);
    expect(node?.title).toBe('New Title');
    expect(node?.description).toBe('New Description');
    expect(node?.color).toBe('#FF0000');

    // Wait for debounce
    vi.advanceTimersByTime(300);

    // Should have merged all patches into one DB write
    expect(db.nodes.put).toHaveBeenCalledTimes(1);
    const persistedNode = (db.nodes.put as any).mock.calls[0][0];
    expect(persistedNode.title).toBe('New Title');
    expect(persistedNode.description).toBe('New Description');
    expect(persistedNode.color).toBe('#FF0000');

    vi.useRealTimers();
  });
});
