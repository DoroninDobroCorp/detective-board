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
