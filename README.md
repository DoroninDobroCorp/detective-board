🇬🇧 [English](#-english) | 🇷🇺 [Русский](#-русский)

---

# 🇬🇧 English

# 🕵️ Detective Board

> **⚠️ This project is archived.** Development has ceased — the project has been fully migrated to the private repository **upi/**. This code is published as a portfolio piece and reference material.

---

An interactive board for visualizing tasks, connections, and groups with **60 FPS** Canvas performance.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)](https://vitejs.dev/)

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🎨 | **Canvas rendering** | Konva.js — smooth dragging at 60 FPS |
| 📦 | **Offline-first** | All data stored in IndexedDB (Dexie), works without a server |
| 🔗 | **Visual connections** | Bezier curves between nodes |
| 📁 | **Hierarchy** | Nested groups with drill-down navigation |
| 🤖 | **AI assistant** | Voice and text input (Google Gemini, OpenAI) |
| 🎮 | **Gamification** | Levels, XP, achievements for completing tasks |
| 📱 | **Telegram bot** | Well-being tracking via Telegram |
| 📊 | **Export/Import** | Full data migration between devices |

---

## ⚡ Performance

Optimized for **300–500 nodes** at a stable **58–60 FPS**:

- `React.memo` with custom comparison
- `Set` instead of `Array` for O(1) lookups
- Direct Konva refs manipulation (no store updates during drag)
- Throttle 16ms = 60 FPS
- Fake shadows instead of expensive `shadowBlur`
- Konva caching for static nodes
- Adaptive modes (normal / perf / super)

---

## 🛠 Tech Stack

- **React 19** + **TypeScript 5.8** + **Vite 7**
- **Konva 10** — Canvas rendering
- **Zustand 5** — State management
- **Dexie 4** — IndexedDB
- **Vitest 2** — Unit tests
- **Playwright** — E2E tests
- **Husky + lint-staged** — Pre-commit hooks
- **GitHub Actions** — CI/CD

---

## 🚀 Getting Started

```bash
git clone https://github.com/DoroninDobroCorp/detective-board.git
cd detective-board
npm install
npm run prepare   # Husky hooks

# Copy and configure environment variables
cp .env.example .env.local

npm run dev
```

Open `http://localhost:5173`

### 🤖 AI Assistant (optional)

To enable the AI assistant, add the following keys to `.env.local`:
- `GOOGLE_API_KEY` — Google Gemini
- `OPENAI_API_KEY` — OpenAI
- `TELEGRAM_BOT_TOKEN` — Telegram well-being bot

---

## 🧪 Tests

```bash
npm run test          # Unit (Vitest)
npm run test:e2e      # E2E (Playwright)
npm run test:perf     # Performance
npm run lint          # ESLint
npm run check         # Full check
```

---

## 📁 Project Structure

```
detective-board/
├── src/
│   ├── components/      # React components (Canvas, Toolbar, Inspector...)
│   ├── pages/           # Pages (tasks, journal, achievements, media)
│   ├── assistant/       # AI integrations (Gemini, OpenAI)
│   ├── utils/           # Utilities (throttle, debounce, raf-batch)
│   ├── store.ts         # Zustand state management
│   ├── db.ts            # Dexie (IndexedDB)
│   ├── gamification.ts  # XP and achievements system
│   └── types.ts         # TypeScript types
├── tests/               # E2E tests (Playwright)
├── docs/                # Documentation
└── .github/workflows/   # CI/CD
```

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  <i>This project is archived. Development continues in the private repository <b>upi/</b>.</i>
</p>

---

# 🇷🇺 Русский

# 🕵️ Detective Board

> **⚠️ Проект архивирован.** Разработка прекращена — проект полностью переехал в закрытый репозиторий **upi/**. Этот код опубликован как портфолио и справочный материал.

---

Интерактивная доска для визуализации задач, связей и групп с производительностью **60 FPS** на Canvas.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff.svg)](https://vitejs.dev/)

---

## ✨ Возможности

| | Функция | Описание |
|---|---|---|
| 🎨 | **Canvas рендеринг** | Konva.js — плавное перетаскивание при 60 FPS |
| 📦 | **Offline-first** | Все данные в IndexedDB (Dexie), работает без сервера |
| 🔗 | **Визуальные связи** | Bezier-кривые между узлами |
| 📁 | **Иерархия** | Вложенные группы с навигацией внутрь |
| 🤖 | **AI-ассистент** | Голосовой и текстовый (Google Gemini, OpenAI) |
| 🎮 | **Геймификация** | Уровни, XP, достижения за выполнение задач |
| 📱 | **Telegram-бот** | Отслеживание самочувствия через Telegram |
| 📊 | **Экспорт/Импорт** | Полная миграция данных между устройствами |

---

## ⚡ Производительность

Оптимизировано для **300–500 узлов** при стабильных **58–60 FPS**:

- `React.memo` с custom comparison
- `Set` вместо `Array` для O(1) проверок
- Прямое управление Konva refs (без store updates в drag)
- Throttle 16ms = 60 FPS
- Фейковые тени вместо дорогого `shadowBlur`
- Konva caching для статичных узлов
- Адаптивные режимы (normal / perf / super)

---

## 🛠 Технологии

- **React 19** + **TypeScript 5.8** + **Vite 7**
- **Konva 10** — Canvas рендеринг
- **Zustand 5** — State management
- **Dexie 4** — IndexedDB
- **Vitest 2** — Unit тесты
- **Playwright** — E2E тесты
- **Husky + lint-staged** — Pre-commit hooks
- **GitHub Actions** — CI/CD

---

## 🚀 Локальный запуск

```bash
git clone https://github.com/DoroninDobroCorp/detective-board.git
cd detective-board
npm install
npm run prepare   # Husky hooks

# Скопируйте и настройте переменные окружения
cp .env.example .env.local

npm run dev
```

Откройте `http://localhost:5173`

### 🤖 AI-ассистент (опционально)

Для работы AI-ассистента добавьте ключи в `.env.local`:
- `GOOGLE_API_KEY` — Google Gemini
- `OPENAI_API_KEY` — OpenAI
- `TELEGRAM_BOT_TOKEN` — Telegram-бот самочувствия

---

## 🧪 Тесты

```bash
npm run test          # Unit (Vitest)
npm run test:e2e      # E2E (Playwright)
npm run test:perf     # Производительность
npm run lint          # ESLint
npm run check         # Полная проверка
```

---

## 📁 Структура

```
detective-board/
├── src/
│   ├── components/      # React-компоненты (Canvas, Toolbar, Inspector...)
│   ├── pages/           # Страницы (задачи, дневник, достижения, медиа)
│   ├── assistant/       # AI-интеграции (Gemini, OpenAI)
│   ├── utils/           # Утилиты (throttle, debounce, raf-batch)
│   ├── store.ts         # Zustand state management
│   ├── db.ts            # Dexie (IndexedDB)
│   ├── gamification.ts  # Система XP и достижений
│   └── types.ts         # TypeScript типы
├── tests/               # E2E тесты (Playwright)
├── docs/                # Документация
└── .github/workflows/   # CI/CD
```

---

## 📄 Лицензия

[MIT](LICENSE)

---

<p align="center">
  <i>Проект архивирован. Развитие продолжается в закрытом репозитории <b>upi/</b>.</i>
</p>
