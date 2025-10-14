# 🕵️ Detective Board

Интерактивная доска для визуализации задач, связей и групп с производительностью 60 FPS на Canvas.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![TypeScript](https://img.shields.io/badge/typescript-5.8-blue)

## ✨ Возможности

- 🎨 **Canvas рендеринг** через Konva — плавное перетаскивание 60 FPS
- 📦 **Offline-first** — все данные в IndexedDB
- 🔗 **Визуальные связи** между узлами с Bezier кривыми
- 📁 **Иерархическая навигация** — вход в группы
- 🤖 **AI-ассистент** — голосовой и текстовый режимы (Gemini, OpenAI)
- 🎮 **Геймификация** — уровни, достижения, XP
- ⚡ **Высокая производительность** — React.memo, Set, throttle, кэширование

## 🚀 Быстрый старт

```bash
# Клонирование
git clone https://github.com/YOUR_USERNAME/detective-board.git
cd detective-board

# Установка зависимостей
npm install

# Инициализация Husky
npm run prepare

# Запуск dev сервера
npm run dev
```

Откройте http://localhost:5173

## 🧪 Тестирование

```bash
# Unit тесты (Vitest)
npm run test

# E2E тесты (Playwright)
npm run test:e2e

# Производительность
npm run test:perf

# Конкретный тест перетаскивания
npm run test:drag
```

## 🔧 Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск dev сервера |
| `npm run build` | Сборка для production |
| `npm run preview` | Просмотр production сборки |
| `npm run lint` | Запуск ESLint |
| `npm run lint:fix` | Исправление ошибок линтинга |
| `npm run test` | Unit тесты |
| `npm run test:ui` | Vitest UI |
| `npm run test:coverage` | Coverage отчёт |
| `npm run check` | Полная проверка (lint + test + e2e) |

## 🤖 AI Ассистент

The built-in assistant supports Google Gemini (default для текстового чата) and OpenAI. Configure the following environment variables before starting the dev server:

- `GOOGLE_API_KEY` — ключ доступа к Google Generative Language API (Gemini).
- `GOOGLE_TEXT_MODEL` *(опционально)* — идентификатор модели Gemini для текстового чата (по умолчанию `gemini-1.5-flash-latest`).
- `OPENAI_API_KEY` — ключ OpenAI, используется для голосового режима и текстового чата при выборе OpenAI.
- `OPENAI_TEXT_MODEL` *(опционально)* — модель OpenAI для текстового режима (по умолчанию `gpt-4o-mini`).

Секретные ключи не коммитим в репозиторий. Создайте `.env.local`:

```bash
cp .env.example .env.local
# Отредактируйте .env.local своими ключами
```

## 📊 Производительность

Проект оптимизирован для работы с **300-500 узлами** при **60 FPS**:

- ✅ React.memo с custom comparison
- ✅ Set вместо Array для O(1) проверок
- ✅ Прямое управление Konva refs (без store updates в drag)
- ✅ Throttle для viewport (16ms = 60 FPS)
- ✅ Фейковые тени вместо дорогого shadowBlur
- ✅ Konva caching для статичных узлов
- ✅ Адаптивные режимы (normal/perf/super)

**Метрики:**
- 🎯 FPS при drag: **58-60**
- ⚡ Click response: **< 30ms**
- 📈 100 узлов: **плавно**

Подробнее: [`docs/OPTIMIZATION-SUMMARY.md`](./docs/OPTIMIZATION-SUMMARY.md)

## 🏗️ Архитектура

```
detective-board/
├── src/
│   ├── components/      # React компоненты
│   ├── pages/          # Страницы приложения
│   ├── utils/          # Утилиты + тесты
│   ├── assistant/      # AI интеграции
│   ├── store.ts        # Zustand state management
│   ├── db.ts           # Dexie (IndexedDB)
│   └── types.ts        # TypeScript типы
├── tests/              # E2E тесты (Playwright)
├── memory-bank/        # Контекст проекта
├── docs/               # Документация
└── .github/workflows/  # CI/CD
```

## 🛠️ Технологии

- **React 19** + **TypeScript 5.8** + **Vite 7**
- **Konva 10** — Canvas рендеринг
- **Zustand 5** — State management
- **Dexie 4** — IndexedDB wrapper
- **Vitest 2** — Unit тесты
- **Playwright 1** — E2E тесты
- **Husky + lint-staged** — Pre-commit hooks

## 🤝 Контрибуция

Читайте [`CONTRIBUTING.md`](./CONTRIBUTING.md) для деталей процесса.

## 📝 История изменений

См. [`CHANGELOG.md`](./CHANGELOG.md)

## 📚 Документация

- [`memory-bank/`](./memory-bank/) — контекст и паттерны проекта
- [`docs/OPTIMIZATION-SUMMARY.md`](./docs/OPTIMIZATION-SUMMARY.md) — оптимизации производительности
- [`docs/FAKE-SHADOWS.md`](./docs/FAKE-SHADOWS.md) — техника фейковых теней
- [`SETUP.md`](./SETUP.md) — инструкции по установке после изменений

## 📄 Лицензия

MIT

## 🙏 Благодарности

- [Konva](https://konvajs.org/) за отличный Canvas framework
- [Zustand](https://github.com/pmndrs/zustand) за простой state management
- [Dexie](https://dexie.org/) за удобный IndexedDB wrapper
