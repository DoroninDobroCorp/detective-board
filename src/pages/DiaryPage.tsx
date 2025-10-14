import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import type { DiaryEntry } from '../types';

const MOODS = [
  { emoji: '😊', label: 'Счастлив' },
  { emoji: '😐', label: 'Нормально' },
  { emoji: '😔', label: 'Грустно' },
  { emoji: '😡', label: 'Сердит' },
  { emoji: '😴', label: 'Устал' },
  { emoji: '🎉', label: 'Празднично' },
  { emoji: '💭', label: 'Задумчиво' },
  { emoji: '✨', label: 'Вдохновлённо' },
] as const;

export const DiaryPage: React.FC = () => {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    const allEntries = await db.diary.orderBy('date').reverse().toArray();
    setEntries(allEntries);
  };

  const loadEntryForDate = async (date: string) => {
    const entry = await db.diary.where('date').equals(date).first();
    setCurrentEntry(entry || null);
  };

  useEffect(() => {
    loadEntryForDate(selectedDate);
  }, [selectedDate]);

  const saveEntry = async () => {
    const now = Date.now();
    if (currentEntry?.id) {
      // Update existing
      await db.diary.update(currentEntry.id, {
        ...currentEntry,
        updatedAt: now,
      });
    } else if (currentEntry?.content.trim()) {
      // Create new
      const newEntry: DiaryEntry = {
        ...currentEntry,
        id: crypto.randomUUID(),
        date: selectedDate,
        createdAt: now,
        updatedAt: now,
      };
      await db.diary.add(newEntry);
    }
    await loadEntries();
    await loadEntryForDate(selectedDate);
  };

  const deleteEntry = async (id: string) => {
    if (confirm('Удалить запись?')) {
      await db.diary.delete(id);
      await loadEntries();
      if (currentEntry?.id === id) {
        setCurrentEntry(null);
      }
    }
  };

  const handleContentChange = (content: string) => {
    setCurrentEntry((prev) =>
      prev
        ? { ...prev, content }
        : {
            id: '',
            date: selectedDate,
            content,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
    );
  };

  const handleMoodChange = (mood: DiaryEntry['mood']) => {
    setCurrentEntry((prev) =>
      prev
        ? { ...prev, mood }
        : {
            id: '',
            date: selectedDate,
            content: '',
            mood,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
    );
  };

  const groupEntriesByMonth = () => {
    const grouped: Record<string, DiaryEntry[]> = {};
    entries.forEach((entry) => {
      const monthKey = entry.date.substring(0, 7); // YYYY-MM
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(entry);
    });
    return grouped;
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
  };

  const formatMonthYear = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const groupedEntries = groupEntriesByMonth();

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = currentEntry?.content || '';
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    handleContentChange(newText);
    setShowEmojiPicker(false);
    
    // Восстанавливаем фокус и позицию курсора
    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const commonEmojis = ['😊', '😂', '❤️', '👍', '🎉', '🤔', '😔', '😍', '🔥', '✨', '💪', '🙏', '👏', '🎯', '💡', '📝', '🌟', '🎈'];

  return (
    <div className="diary-page">
      <div className="diary-sidebar">
        <div className="diary-header">
          <h1 className="diary-title">
            <span className="diary-icon">📔</span>
            Дневник
          </h1>
          <Link to="/" className="diary-back-btn">
            ← Назад
          </Link>
        </div>

        <div className="diary-calendar">
          <label className="diary-date-label">
            <span>Выбрать дату:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="diary-date-input"
            />
          </label>
        </div>

        <div className="diary-entries-list">
          {Object.keys(groupedEntries)
            .sort()
            .reverse()
            .map((monthKey) => (
              <div key={monthKey} className="diary-month-group">
                <h3 className="diary-month-title">{formatMonthYear(monthKey)}</h3>
                {groupedEntries[monthKey].map((entry) => (
                  <button
                    key={entry.id}
                    className={`diary-entry-item ${
                      entry.date === selectedDate ? 'is-active' : ''
                    }`}
                    onClick={() => setSelectedDate(entry.date)}
                  >
                    <span className="diary-entry-date">{formatDate(entry.date)}</span>
                    {entry.mood && <span className="diary-entry-mood">{entry.mood}</span>}
                    <div className="diary-entry-preview">
                      {entry.content.substring(0, 60)}
                      {entry.content.length > 60 && '...'}
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>

      <div className="diary-content">
        <div className="diary-editor">
          <div className="diary-editor-header">
            <h2 className="diary-editor-date">{formatDate(selectedDate)}</h2>
            {currentEntry?.id && (
              <button
                className="diary-delete-btn"
                onClick={() => deleteEntry(currentEntry.id)}
              >
                🗑️
              </button>
            )}
          </div>

          <div className="diary-mood-selector">
            <span className="diary-mood-label">Настроение:</span>
            <div className="diary-mood-options">
              {MOODS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  className={`diary-mood-btn ${
                    currentEntry?.mood === emoji ? 'is-selected' : ''
                  }`}
                  onClick={() => handleMoodChange(emoji as DiaryEntry['mood'])}
                  title={label}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
              <button
                className="diary-emoji-toggle"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Добавить эмоджи"
                type="button"
              >
                😀
              </button>
              {showEmojiPicker && (
                <div className="diary-emoji-picker">
                  {commonEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="diary-emoji-item"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="diary-textarea"
              placeholder="Что произошло сегодня? Твои мысли, чувства, идеи..."
              value={currentEntry?.content || ''}
              onChange={(e) => handleContentChange(e.target.value)}
            />
          </div>

          <div className="diary-actions">
            <button className="diary-save-btn" onClick={saveEntry}>
              💾 Сохранить
            </button>
            {currentEntry?.updatedAt && (
              <span className="diary-last-updated">
                Обновлено: {new Date(currentEntry.updatedAt).toLocaleString('ru-RU')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiaryPage;
