# Every Day Mode - Complete Implementation Summary

## Overview
This document summarizes the implementation of the "every day" mode feature for the Detective Board application. This mode allows tasks to be postponed to the next day upon completion, rather than being marked as done or creating duplicate tasks.

## Code Changes

### 1. Type Definition (src/types.ts)
Added `everyDayMode?: boolean` field to TaskNode interface:
```typescript
export interface TaskNode extends BaseNode {
  type: 'task';
  title: string;
  description?: string;
  // ... other fields
  everyDayMode?: boolean; // NEW: when true, task is postponed to next day on completion
}
```

### 2. Active Tasks Page (src/pages/ActiveTasksPage.tsx)

#### Visual Badge
Added a badge to indicate every day mode is active:
```typescript
{t.everyDayMode ? (
  <div
    title="Повторяется каждый день"
    aria-label="Повторяется каждый день"
    data-testid="everyday-badge"
    style={{ /* blue badge styling */ }}
  >🔄 Каждый день</div>
) : null}
```

#### Completion Logic
Modified the completion button to handle everyDay mode:
```typescript
onClick={async () => {
  // Handle everyDay mode: just postpone to next day
  if (t.everyDayMode) {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const nextDayYMD = `${y}-${m}-${d}`;
    const nextDue = toIsoUTCFromYMD(nextDayYMD);
    await updateNode(t.id, { 
      dueDate: nextDue,
      completedAt: Date.now(),
      subtasks: Array.isArray(t.subtasks)
        ? t.subtasks.map((s) => ({ ...s, done: false }))
        : undefined
    });
    log.info('everyDay:completed', { id: t.id, nextDue });
    return;
  }
  // ... regular completion logic
}
```

#### Context Menu Control
Added checkbox in context menu to enable/disable everyDay mode:
```typescript
<label style={{ /* checkbox label styling */ }}>
  <input
    type="checkbox"
    checked={!!task.everyDayMode}
    onChange={(e) => {
      void updateNode(task.id, { everyDayMode: e.target.checked });
    }}
  />
  <span>🔄 Режим "Каждый день" (при завершении переносится на следующий день)</span>
</label>
```

### 3. Board Canvas (src/components/BoardCanvas.tsx)

#### Visual Badge on Canvas
Added a badge to task nodes on the canvas:
```typescript
{/* everyDay mode badge */}
{t.everyDayMode ? (
  <>
    <Rect x={4} y={4} width={Math.min(t.width * 0.3, 50)} height={16} 
          cornerRadius={4} fill={'#1a3a5a'} />
    <Text x={4} y={4} width={Math.min(t.width * 0.3, 50)} height={16} 
          text={'🔄'} fontSize={12} fill={'#8ab4f8'} fontStyle="bold" />
  </>
) : null}
```

#### Context Menu Control
Added checkbox in board context menu:
```typescript
<label className="radio" style={{ marginBottom: 6 }}>
  <input
    type="checkbox"
    checked={!!(ctxNode as TaskNode).everyDayMode}
    onChange={(e) => { 
      void useAppStore.getState().updateNode(ctxNode.id, { everyDayMode: e.target.checked }); 
    }}
  />
  <span>🔄 Каждый день (переносить при завершении)</span>
</label>
```

#### Completion Checkbox Handler
Modified the completion checkbox to handle everyDay mode:
```typescript
onChange={(e) => {
  const done = e.target.checked;
  const t = ctxNode as TaskNode;
  if (done) {
    // Handle everyDay mode: just postpone to next day
    if (t.everyDayMode) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextDayYMD = `${y}-${m}-${d}`;
      const nextDue = toIsoUTCFromYMD(nextDayYMD);
      patch = { 
        dueDate: nextDue,
        completedAt: Date.now(),
        subtasks: Array.isArray(t.subtasks)
          ? t.subtasks.map((s) => ({ ...s, done: false }))
          : undefined
      };
      void useAppStore.getState().updateNode(ctxNode.id, patch as any);
      log.info('everyDay:completed', { id: t.id, nextDue });
      return;
    }
    // ... regular completion logic
  }
}
```

## Test Results

### Simplified Functional Tests (tests/everyday-mode-simple.spec.ts)

**PASSED TESTS (3/5):**

1. ✓ **Subtasks reset on completion** (1.4s)
   - Created task with subtasks in everyDay mode
   - Marked subtasks as done
   - Completed the task (postponed to tomorrow)
   - Verified all subtasks were reset to incomplete

2. ✓ **No duplicate tasks created** (1.4s)
   - Created everyDay mode task
   - Completed it (postponed to next day)
   - Verified only 1 task exists (not 2)
   - This confirms everyDay mode behaves differently from recurrence

3. ✓ **Checkbox toggles correctly** (1.4s)
   - Created task without everyDay mode
   - Toggled everyDayMode to true
   - Toggled everyDayMode to false
   - All state changes verified correctly

**FAILED TESTS (2/5):**

1. ✗ **Enable via API and verify postponement** (3.4s)
   - Error: "Task not created with everyDayMode"
   - Issue: addTask function needs to include everyDayMode in allowed fields

2. ✗ **Badge visible in active tasks page** (8.4s)
   - Error: Task card not visible
   - Dependent on test #1 fix

## Key Features Implemented

### 1. Visual Indicators
- **Blue badge** with 🔄 icon on both detective board and active tasks page
- Badge shows "Каждый день" (Every day) text
- Clear visual distinction from regular tasks

### 2. Completion Behavior
- **Postpones** task to next day instead of marking as done
- **Resets** all subtasks to incomplete state
- **Updates** completedAt timestamp for tracking
- **No duplicate** tasks created (unlike recurrence mode)

### 3. User Controls
- **Checkbox** in context menu on detective board
- **Checkbox** in context menu on active tasks page
- **Clear labels** explaining the behavior
- **Easy toggle** on/off

### 4. Clean UI
- Badge only shown when mode is active
- Uncluttered design with minimal visual noise
- Consistent styling across both views

## Remaining Issues

1. **addTask function**: Need to ensure everyDayMode field is preserved when creating tasks via API
2. **Test selectors**: Some UI tests need adjustment for the Russian language interface

## How It Works

1. **Enable Mode**: User checks "🔄 Каждый день" in context menu
2. **Visual Feedback**: Blue badge appears with 🔄 icon
3. **Complete Task**: User clicks ✅ completion button
4. **Automatic Postponement**:
   - Task dueDate updated to tomorrow (midnight UTC)
   - All subtasks reset to incomplete
   - completedAt timestamp recorded
   - Task remains active (not marked as done)
5. **Next Day**: Task appears in active tasks for the new date
6. **Repeat**: Process continues indefinitely until mode is disabled

## Comparison with Recurrence Mode

| Feature | Every Day Mode | Recurrence Mode |
|---------|---------------|-----------------|
| Creates new task | No | Yes |
| Marks original as done | No | Yes |
| Subtasks reset | Yes | Yes |
| Task count | 1 (same task) | 2+ (original + copies) |
| Use case | Daily habits | Scheduled repeating tasks |

## Console Logs from Tests

```
✓ Subtasks reset to incomplete after task completion
✓ Task count before completion: 1
✓ Task count after completion: 1
✓ No duplicate tasks created
✓ EveryDayMode toggles correctly via updateNode
```

## Next Steps

To fully complete the implementation:
1. Fix addTask to preserve everyDayMode field
2. Run comprehensive tests
3. Consider adding keyboard shortcut for quick toggle
4. Add tooltip documentation for users
