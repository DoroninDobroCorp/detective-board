# Product Context

**Последнее обновление:** 2025-10-03 22:13

## Обзор проекта

**Detective Board** — интерактивная доска для визуализации задач, связей и групп с использованием Canvas (Konva).

### Основные возможности
- Создание узлов (задачи, группы, персоны)
- Визуальные связи между узлами
- Иерархическая навигация (вход в группы)
- Перетаскивание с производительностью 60 FPS
- AI-ассистент (голосовой и текстовый режимы)
- Геймификация (достижения, уровни)
- Хранение в IndexedDB (offline-first)

## Технологический стек

### Frontend
- **React 19.1.1** — UI framework
- **TypeScript 5.8.3** — типизация
- **Vite 7.1.2** — сборка и dev server
- **Zustand 5.0.8** — state management
- **Konva 10.0.2** — canvas рендеринг
- **React Router 7.9.1** — роутинг

### Storage & Data
- **Dexie 4.2.0** — wrapper для IndexedDB
- Offline-first архитектура

### Testing
- **Playwright 1.48.2** — E2E тесты
- **ESLint 9.33** — линтинг

### AI Integration
- Google Gemini API (текстовый чат)
- OpenAI API (голосовой режим)

## Архитектура

### Структура данных
```typescript
Node: Task | Group | Person
- id, type, x, y, width, height
- title, description
- parentId (для иерархии)

Link: связь между узлами
- fromId, toId, color

Viewport: x, y, scale
```

### Ключевые компоненты
- `BoardCanvas.tsx` — основной canvas с Konva
- `store.ts` — Zustand store (nodes, links, viewport)
- `db.ts` — Dexie схема для IndexedDB
- `assistant/` — AI интеграции

### Оптимизации производительности
- React.memo для NodeShape
- Set вместо Array для selection
- Прямое управление Konva refs (без store updates во время drag)
- Throttle для viewport (16ms = 60 FPS)
- Фейковые тени вместо shadowBlur
- Konva caching для статичных узлов
- Адаптивные режимы (normal/perf/super)

## Стандарты разработки

### Код-стиль
- TypeScript strict mode
- Функциональные компоненты + hooks
- ESLint конфигурация
- camelCase для переменных/функций

### Логирование
- Централизованный logger (`src/logger.ts`)
- Уровни: debug, info, warn, error
- LOG_LEVEL настраивается через localStorage
- DEBUG_DIAG=1 для диагностики производительности

### Тестирование
- E2E тесты в `tests/`
- FPS мониторинг в тестах производительности
- Таргет: >55 FPS, <30ms response

## Известные ограничения

1. **Масштаб:** Оптимально до 500 узлов
2. **IndexedDB:** Async операции могут тормозить
3. **History:** Хранит полные снимки графа (память)
4. **Shadows:** Отключаются в perf mode

## Планы развития

- [ ] Virtual scrolling для >500 узлов
- [ ] Web Workers для тяжелых вычислений
- [ ] WebGL renderer для >1000 узлов
- [ ] Unit тесты (Vitest)
- [ ] CI/CD (GitHub Actions)
