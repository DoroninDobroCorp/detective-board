# Инструкция по откату опыта вручную

## Для отката опыта за конкретную задачу на 100 XP:

1. Открой консоль браузера (F12 или Cmd+Option+I на Mac)

2. Выполни следующий код для поиска задачи на 100 XP:

```javascript
// Получить доступ к gamification store
const gamificationStore = window.useGamificationStore || (() => {
  const stores = Object.keys(window).filter(k => k.includes('gamification'));
  console.log('Available stores:', stores);
  return null;
});

// Вариант 1: Найти все записи XP с amount = 100
const state = JSON.parse(localStorage.getItem('GAMIFICATION_STATE_V1'));
console.log('Current XP:', state?.state?.xp);
console.log('Current Level:', state?.state?.level);

// Найти записи на 100 XP
const entries100 = state?.state?.xpHistory?.filter(e => e.amount === 100);
console.log('Entries with 100 XP:', entries100);

// Найти завершенные задачи на 100 XP
const completions100 = state?.state?.completions?.filter(c => c.xp === 100);
console.log('Completions with 100 XP:', completions100);
```

3. После того как найдешь нужную задачу (ее ID), выполни откат:

```javascript
// Замени 'TASK_ID_HERE' на реальный ID задачи
const taskId = 'TASK_ID_HERE';

// Получить текущее состояние
const state = JSON.parse(localStorage.getItem('GAMIFICATION_STATE_V1'));
const currentState = state.state;

// Найти completion для этой задачи
const completion = currentState.completions.find(c => c.id === taskId);
console.log('Found completion:', completion);

// Найти все XP записи для этой задачи
const relatedEntries = currentState.xpHistory.filter(e => e.taskId === taskId);
const totalXpToRevert = relatedEntries.reduce((sum, e) => sum + e.amount, 0);
console.log('Total XP to revert:', totalXpToRevert);

// Убрать записи из истории
const newHistory = currentState.xpHistory.filter(e => e.taskId !== taskId);

// Убрать completion
const newCompletions = currentState.completions.filter(c => c.id !== taskId);

// Убрать из processedTasks
const newProcessed = { ...currentState.processedTasks };
delete newProcessed[taskId];

// Вычесть XP
const nextXp = Math.max(0, currentState.xp - totalXpToRevert);

// Пересчитать уровень
function levelForXp(totalXp) {
  function totalXpForLevel(level) {
    if (level <= 1) return 0;
    let total = 0;
    for (let i = 1; i < level; i++) {
      const base = 250;
      const scale = 1.12;
      const core = base * Math.pow(Math.max(i, 1), 1.35) + 180;
      total += Math.max(150, Math.round(core * scale));
    }
    return total;
  }
  let level = 1;
  while (totalXp >= totalXpForLevel(level + 1)) {
    level += 1;
    if (level > 999) break;
  }
  return level;
}

const nextLevel = levelForXp(nextXp);

// Обновить pending level-ups
const pendingLevelUps = currentState.pendingLevelUps.filter(evt => evt.level <= nextLevel);

// Сохранить новое состояние
const newState = {
  ...state,
  state: {
    ...currentState,
    xp: nextXp,
    level: nextLevel,
    xpHistory: newHistory,
    completions: newCompletions,
    processedTasks: newProcessed,
    pendingLevelUps: pendingLevelUps,
  }
};

console.log('Old XP:', currentState.xp, 'New XP:', nextXp);
console.log('Old Level:', currentState.level, 'New Level:', nextLevel);

// Сохранить в localStorage
localStorage.setItem('GAMIFICATION_STATE_V1', JSON.stringify(newState));

console.log('✅ XP rollback complete! Reload the page to see changes.');
```

4. Перезагрузи страницу (F5 или Cmd+R)

## Альтернативный способ (проще):

Если ты знаешь ID задачи, просто выполни:

```javascript
const taskId = 'TASK_ID_HERE'; // Замени на реальный ID

// Получить revertTaskXp функцию из store
const state = JSON.parse(localStorage.getItem('GAMIFICATION_STATE_V1'));
const currentXp = state.state.xp;

// Найти задачу в completions
const completion = state.state.completions.find(c => c.id === taskId);
if (completion) {
  console.log(`Откатываю ${completion.xp} XP за задачу: ${completion.title}`);
  
  // Выполнить откат вручную через обновление localStorage
  // (требует перезагрузки страницы после)
  
  // ... используй код выше ...
} else {
  console.log('Задача не найдена в completions');
}
```

## Для автоматического отката при следующем удалении:

Теперь система автоматически откатывает XP при:
- Удалении выполненной задачи (кнопка 🗑️)
- Изменении статуса задачи с "done" на другой (кнопка "Отменить завершение")
