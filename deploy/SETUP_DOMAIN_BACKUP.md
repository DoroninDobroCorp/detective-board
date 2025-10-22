# Настройка Detective Board на https://ibet.team/detective-board и автобекапа

## ✅ Что уже сделано

1. **Vite base path** - обновлён `vite.config.ts` с `base: '/detective-board/'`
2. **Nginx proxy** - добавлена location `/detective-board/` в `/etc/nginx/sites-available/ibet-team` 
3. **Nginx reload** - конфиг перезагружен и проверен
4. **Сервис** - автоматически перезапустился с новой конфигурацией

## 🚀 Установка дневного бекапа

Выполните от пользователя `ubuntu` или `root`:

```bash
# Копируем systemd файлы для бекапа
sudo cp /srv/detective-board/deploy/systemd/detective-board-backup.service /etc/systemd/system/
sudo cp /srv/detective-board/deploy/systemd/detective-board-backup.timer /etc/systemd/system/

# Перезагружаем systemd daemon
sudo systemctl daemon-reload

# Включаем таймер на автозапуск
sudo systemctl enable detective-board-backup.timer

# Запускаем таймер
sudo systemctl start detective-board-backup.timer

# Проверяем статус
sudo systemctl status detective-board-backup.timer
sudo systemctl list-timers detective-board-backup.timer
```

## 🔍 Проверка и управление

```bash
# Посмотреть логи последнего бекапа
sudo journalctl -u detective-board-backup.service -n 50

# Запустить бекап вручную (для тестирования)
sudo systemctl start detective-board-backup.service

# Посмотреть расписание таймера
sudo systemctl list-timers detective-board-backup.timer --all

# Отключить таймер (если надо)
sudo systemctl stop detective-board-backup.timer
sudo systemctl disable detective-board-backup.timer
```

## 📁 Бекапы

Бекапы сохраняются в `/srv/detective-board/backups/` с названием:
```
detective-board_backup_YYYYMMDD_HHMMSS.tar.gz
```

Автоматически хранятся 30 дней, старые удаляются.

## 🌐 Доступ к проекту

Проект теперь доступен по адресам:
- **HTTPS**: https://ibet.team/detective-board/
- **Локально**: http://localhost:5173/detective-board/

## 📦 Bootstrap данные (опционально)

Если хотите автоматически импортировать данные при первом запуске:
```bash
# Поместите файл с экспортированными данными в public/
cp your-backup.json /srv/detective-board/public/bootstrap-backup.json
```

После перезагрузки страницы данные импортируются автоматически при пустой БД.

## 📝 Что содержат бекапы

Включаются:
- ✅ Все исходные файлы
- ✅ memory-bank/
- ✅ public/ (включая bootstrap данные)
- ✅ Конфиги

Исключаются:
- ❌ node_modules/ (пересоздастся после npm install)
- ❌ dist/ (пересоздастся после npm run build)
- ❌ .git/ 
- ❌ .env.local (чувствительные данные)
- ❌ test-results/

## 🔄 Восстановление из бекапа

```bash
# Найти нужный бекап
ls -lh /srv/detective-board/backups/

# Распаковать
cd /srv/detective-board
tar -xzf backups/detective-board_backup_YYYYMMDD_HHMMSS.tar.gz

# Переустановить зависимости
npm install

# Перезапустить сервис
sudo systemctl restart detective-board
```
