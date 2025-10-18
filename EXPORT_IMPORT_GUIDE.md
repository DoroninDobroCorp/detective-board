# Инструкция по экспорту и импорту данных с геймификацией

## Проблема
Раньше при экспорте/импорте данных между компьютерами **не переносились**:
- Опыт (XP)
- Уровни и их названия
- История XP
- Достижения
- Выполненные задачи для геймификации

Теперь эта проблема **исправлена**! ✅

---

## Часть 1: Экспорт данных (старый компьютер)

### Если у вас СТАРАЯ версия кода (без поддержки геймификации)

**ВАЖНО**: Сначала нужно обновить код на старом компьютере, чтобы экспорт включал геймификацию.

#### Шаги для обновления старой версии:

1. **Откройте файл** `/srv/detective-board/src/exportImport.ts`

2. **Найдите тип `BackupData`** (примерно строки 8-19) и замените его на:

```typescript
export type BackupData = {
  $schema?: string;
  version: 1;
  exportedAt: string; // ISO
  nodes: AnyNode[];
  links: LinkThread[];
  users: User[];
  books: BookItem[];
  movies: MovieItem[];
  games: GameItem[];
  purchases: PurchaseItem[];
  gamification?: unknown; // данные геймификации из localStorage
};
```

3. **Найдите функцию `getBackupData()`** и замените её на:

```typescript
export async function getBackupData(): Promise<BackupData> {
  const [nodes, links, users, books, movies, games, purchases] = await Promise.all([
    db.nodes.toArray(),
    db.links.toArray(),
    db.users.toArray(),
    db.books.toArray(),
    db.movies.toArray(),
    db.games.toArray(),
    db.purchases.toArray(),
  ]);
  
  // Экспортируем данные геймификации из localStorage
  let gamification: unknown = undefined;
  try {
    const gamificationRaw = localStorage.getItem('GAMIFICATION_STATE_V1');
    if (gamificationRaw) {
      gamification = JSON.parse(gamificationRaw);
    }
  } catch (err) {
    console.warn('Не удалось экспортировать данные геймификации:', err);
  }
  
  const data: BackupData = {
    $schema: 'https://example.local/detective-board/backup.schema.json',
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes,
    links,
    users,
    books,
    movies,
    games,
    purchases,
    gamification,
  };
  return data;
}
```

4. **Найдите функцию `importBackup()`** и добавьте **после** строк с объявлением переменных (после `purchases`):

```typescript
  // Импортируем данные геймификации в localStorage
  if (data.gamification !== undefined) {
    try {
      localStorage.setItem('GAMIFICATION_STATE_V1', JSON.stringify(data.gamification));
      log.info('import:gamification:done');
    } catch (err) {
      console.warn('Не удалось импортировать данные геймификации:', err);
    }
  }
```

Это должно идти **ДО** строки `if (mode === 'replace') {`

5. **Сохраните файл** и перезапустите приложение

6. **Экспортируйте данные** через кнопку "⤓ Экспорт" → "⤓ Экспорт базы"

7. **Скопируйте файл** `detective-board-backup-XXXX.json` на флешку или отправьте на другой компьютер

---

### Если у вас УЖЕ НОВАЯ версия кода

Просто нажмите **"⤓ Экспорт"** → **"⤓ Экспорт базы"** в приложении. Файл автоматически скачается с геймификацией.

---

## Часть 2: Импорт данных (новый компьютер)

На новом компьютере код уже обновлён, так что:

1. Откройте приложение
2. Нажмите **"⤒ Импорт"** → **"⤒ Импорт (замена)"** или **"⤒ Импорт (merge)"**
   - **Замена** — полностью заменит все данные
   - **Merge** — объединит с существующими данными
3. Выберите файл бэкапа
4. **Перезагрузите страницу** (`Ctrl+R` или `F5`) чтобы геймификация загрузилась

✅ Готово! Все уровни, опыт и достижения должны импортироваться!

---

## Проверка

После импорта и перезагрузки страницы проверьте:
- ⭐ Уровень отображается в тулбаре
- XP корректный
- История уровней доступна (нажмите на индикатор уровня)
- Достижения на месте (перейдите в раздел "🏅 Достижения")

---

## Что делать если что-то не работает

1. **Откройте консоль браузера** (F12)
2. Посмотрите, есть ли ошибки
3. Проверьте, что файл бэкапа содержит поле `"gamification"`:
   - Откройте файл `.json` в текстовом редакторе
   - Найдите секцию `"gamification"`
   - Если её нет — значит экспорт был сделан со старой версии кода

4. Если проблема с импортом:
   - Убедитесь что на новом компьютере код обновлён
   - Перезагрузите страницу после импорта
   - Проверьте localStorage в браузере (F12 → Application/Хранилище → Local Storage → ищите ключ `GAMIFICATION_STATE_V1`)
