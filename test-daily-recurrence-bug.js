// Test to reproduce the daily recurrence bug

// Simulate the recurrence logic
function pad2(n) { return n < 10 ? '0' + n : String(n); }

function toIsoUTCFromYMD(ymd) {
  const [y, m, d] = ymd.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
}

function computeNextDueDate(rule, from = new Date()) {
  const base = typeof from === 'string' ? new Date(from) : from;
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  const d = base.getDate();
  const today = `${y}-${pad2(m)}-${pad2(d)}`;

  if (rule.kind === 'daily') {
    return toIsoUTCFromYMD(today);
  }
  return null;
}

// Scenario: User completes a daily task on 2025-10-24
console.log('\n=== Daily Recurrence Bug Reproduction ===\n');

const currentDate = new Date('2025-10-24T14:30:00.000Z'); // Current time: 2025-10-24, 2:30 PM UTC
const taskDueDate = '2025-10-24T00:00:00.000Z'; // Task due today

console.log('1. Initial state:');
console.log('   Current date:', currentDate.toISOString());
console.log('   Task dueDate:', taskDueDate);
console.log('   Task recurrence: { kind: "daily" }');

console.log('\n2. User marks task complete in ActiveTasksPage:');
const base = new Date(taskDueDate);
console.log('   base =', base.toISOString());
base.setDate(base.getDate() + 1); // Add 1 day
console.log('   base.setDate(base.getDate() + 1) =', base.toISOString());
const nextDue = computeNextDueDate({ kind: 'daily' }, base);
console.log('   nextDue = computeNextDueDate({ kind: "daily" }, base) =', nextDue);
console.log('   → New task created with dueDate:', nextDue);

console.log('\n3. On next page load, store.ts init() runs:');
const newTaskDueDate = nextDue;
console.log('   New task dueDate:', newTaskDueDate);
const computedNext = computeNextDueDate({ kind: 'daily' }, currentDate);
console.log('   computeNextDueDate({ kind: "daily" }, new Date()) =', computedNext);
const prevYmd = newTaskDueDate.slice(0, 10);
const nextYmd = computedNext.slice(0, 10);
console.log('   prevYmd:', prevYmd);
console.log('   nextYmd:', nextYmd);
console.log('   prevYmd !== nextYmd:', prevYmd !== nextYmd);

if (prevYmd !== nextYmd) {
  console.log('   → BUG: Task dueDate updated from', prevYmd, 'to', nextYmd);
  console.log('   → This moves tomorrow\'s task back to today!');
}

console.log('\n4. Root cause analysis:');
console.log('   - ActiveTasksPage creates task for TOMORROW (correct)');
console.log('   - store.ts init() updates it back to TODAY (incorrect)');
console.log('   - init() should only update tasks that are OVERDUE');
console.log('   - For daily tasks: only update if dueDate < today, not if dueDate >= today');

console.log('\n=== Proposed fix ===');
console.log('In store.ts init(), change the logic to:');
console.log('  if (t.recurrence && t.recurrence.kind !== "none") {');
console.log('    const todayYmd = new Date().toISOString().slice(0, 10);');
console.log('    const taskYmd = t.dueDate ? t.dueDate.slice(0, 10) : "";');
console.log('    if (taskYmd && taskYmd < todayYmd) {');
console.log('      // Task is overdue, update to next occurrence');
console.log('      const nextDue = computeNextDueDate(t.recurrence, new Date());');
console.log('      if (nextDue) { /* update task */ }');
console.log('    }');
console.log('  }');

