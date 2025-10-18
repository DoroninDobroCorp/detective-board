# System Patterns

## Архитектурные паттерны

### State Management Pattern
**Zustand store** — единый источник истины для:
- Nodes (задачи, группы, персоны)
- Links (связи)
- Viewport (позиция и масштаб)
- Selection (выбранные элементы)
- History (undo/redo)

**Критично:** Не обновлять store в hot paths (drag, resize) — использовать прямые Konva refs.

---

### Performance Optimization Pattern

#### React.memo с custom comparison
```typescript
const NodeShape = React.memo<Props>((props) => {
  // ...
}, (prev, next) => {
  return prev.node === next.node && prev.selected === next.selected;
});
```

#### Set вместо Array для проверок
```typescript
const selectionSet = useMemo(() => new Set(selection), [selection]);
if (selectionSet.has(nodeId)) { /* O(1) вместо O(n) */ }
```

#### Throttle для частых событий
```typescript
const throttled = useMemo(() => throttle(fn, 16), [fn]); // 60 FPS
```

---

### Canvas Rendering Pattern

#### Фейковые тени
Вместо дорогого `shadowBlur`:
```typescript
// Тень = отдельный Rect со смещением
<Rect x={3} y={4} fill="#00000020" />
<Rect x={0} y={0} fill={color} />
```

#### Konva caching
```typescript
useEffect(() => {
  if (groupRef.current && !isDragging && !selected) {
    groupRef.current.cache(); // Snapshot в offscreen canvas
  }
}, [isDragging, selected]);
```

---

### Data Persistence Pattern

#### IndexedDB через Dexie
- Offline-first подход
- Async операции с try/catch
- Lazy backfill (отложенная загрузка обложек)

```typescript
await db.tasks.put(task);
await db.transaction('rw', db.tasks, async () => {
  // Batch операции
});
```

---

### Logging Pattern

#### Централизованный logger
```typescript
const log = getLogger('componentName');
log.info('event:name', { data });
log.warn('issue:detected', { context });
```

#### Уровни:
- `debug` — детальная диагностика
- `info` — важные события
- `warn` — проблемы без падения
- `error` — критические ошибки

---

### Testing Pattern

#### E2E тесты (Playwright)
- Создание узлов программно через store
- FPS мониторинг через window объекты
- Метрики: avgFPS, minFPS, response time

```typescript
const taskId = await page.evaluate(async () => {
  const { useAppStore } = await import('../src/store');
  return await useAppStore.getState().addTask({ x, y });
});
```

---

### Adaptive Performance Pattern

Автоматическое переключение режимов:

```typescript
const perfMode = nodes.length > 300 || scale < 0.3;
const superPerfMode = nodes.length > 800 || scale < 0.15;

if (superPerfMode) {
  // Отключить hit detection, прямые линии, минимум связей
} else if (perfMode) {
  // Упростить эффекты, ограничить связи
}
```

---

## Coding Patterns

### Error Handling
```typescript
try {
  await asyncOperation();
} catch (e) {
  log.error('operation:failed', { 
    error: e instanceof Error ? e.message : String(e) 
  });
}
```

### Type Guards
```typescript
function isTaskNode(node: AnyNode): node is TaskNode {
  return node.type === 'task';
}
```

### Hooks Pattern
```typescript
// Всегда в начале компонента
const state = useAppStore();
const memoValue = useMemo(() => compute(), [deps]);
const callback = useCallback(() => action(), [deps]);
```
