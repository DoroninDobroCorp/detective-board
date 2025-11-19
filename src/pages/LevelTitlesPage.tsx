import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGamificationStore } from '../gamification';
import { getLogger } from '../logger';

const log = getLogger('LevelTitles');

export const LevelTitlesPage: React.FC = () => {
  const level = useGamificationStore((s) => s.level);
  const levelTitles = useGamificationStore((s) => s.levelTitles);
  const assignLevelTitle = useGamificationStore((s) => s.assignLevelTitle);

  const [titles, setTitles] = useState<Record<number, string>>({});
  const [maxLevel, setMaxLevel] = useState(Math.max(level, 10));

  useEffect(() => {
    const currentTitles: Record<number, string> = {};
    for (let i = 1; i <= maxLevel; i++) {
      currentTitles[i] = levelTitles[i]?.title || '';
    }
    setTitles(currentTitles);
  }, [levelTitles, maxLevel]);

  const handleTitleChange = (lvl: number, value: string) => {
    setTitles((prev) => ({ ...prev, [lvl]: value }));
  };

  const handleSave = (lvl: number) => {
    const title = titles[lvl]?.trim();
    if (title) {
      assignLevelTitle(lvl, title);
      log.info('level-title:saved', { level: lvl, title });
    }
  };

  const handleSaveAll = () => {
    let saved = 0;
    for (let i = 1; i <= maxLevel; i++) {
      const title = titles[i]?.trim();
      if (title) {
        assignLevelTitle(i, title);
        saved++;
      }
    }
    log.info('level-titles:saved-all', { count: saved });
    alert(`✅ Сохранено ${saved} названий уровней!`);
  };

  const getLevelColor = (lvl: number) => {
    if (lvl === level) return '#4CAF50';
    if (lvl < level) return '#2196F3';
    return '#999';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ background: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 40, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
            <h1 style={{ margin: 0, color: '#333' }}>🏆 Названия уровней</h1>
            <Link to="/achievements" style={{ color: '#667eea', textDecoration: 'none', fontSize: 16 }}>← Назад</Link>
          </div>

          <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8, marginBottom: 30 }}>
            <p style={{ margin: 0, fontSize: 16 }}>
              <strong>Текущий уровень:</strong> <span style={{ color: '#4CAF50', fontSize: 20, fontWeight: 'bold' }}>{level}</span>
            </p>
            <p style={{ margin: '10px 0 0 0', color: '#666' }}>
              Здесь можно задать название для каждого уровня. Названия сохраняются автоматически.
            </p>
          </div>

          <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 14, color: '#666' }}>
              Показывать уровней до:
              <input
                type="number"
                value={maxLevel}
                onChange={(e) => setMaxLevel(Math.max(1, parseInt(e.target.value) || 10))}
                min="1"
                max="100"
                style={{ marginLeft: 10, padding: '5px 10px', borderRadius: 4, border: '1px solid #ddd', width: 80 }}
              />
            </label>
            <button
              onClick={handleSaveAll}
              style={{
                marginLeft: 'auto',
                padding: '10px 20px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              💾 Сохранить все
            </button>
          </div>

          <div style={{ display: 'grid', gap: 15 }}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((lvl) => {
              const color = getLevelColor(lvl);
              const isCurrentLevel = lvl === level;
              const isPastLevel = lvl < level;

              return (
                <div
                  key={lvl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 15,
                    padding: 15,
                    background: isCurrentLevel ? '#e8f5e9' : isPastLevel ? '#e3f2fd' : 'white',
                    border: `2px solid ${color}`,
                    borderRadius: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: color,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 'bold',
                      flexShrink: 0,
                    }}
                  >
                    {lvl}
                  </div>

                  <input
                    type="text"
                    value={titles[lvl] || ''}
                    onChange={(e) => handleTitleChange(lvl, e.target.value)}
                    placeholder={`Название уровня ${lvl}...`}
                    style={{
                      flex: 1,
                      padding: '12px 15px',
                      fontSize: 16,
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      outline: 'none',
                      transition: 'border 0.2s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = color;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#ddd';
                      handleSave(lvl);
                    }}
                  />

                  <div style={{ fontSize: 12, color: '#999', minWidth: 100, textAlign: 'right' }}>
                    {isCurrentLevel && '👑 Текущий'}
                    {isPastLevel && '✅ Пройден'}
                    {!isCurrentLevel && !isPastLevel && '🔒 Будущий'}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 30, padding: 20, background: '#f9f9f9', borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: '#666' }}>💡 Советы:</h3>
            <ul style={{ color: '#666', lineHeight: 1.8 }}>
              <li>Названия сохраняются автоматически при потере фокуса (blur)</li>
              <li>Или нажми "💾 Сохранить все" чтобы сохранить все сразу</li>
              <li>Зелёный цвет = текущий уровень</li>
              <li>Синий = пройденные уровни</li>
              <li>Серый = будущие уровни</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelTitlesPage;
