import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useGamificationStore,
  progressWithinLevel,
} from '../gamification';
import { computeWellbeingBonuses, ymd } from '../wellbeing';
import { extractAssistantText } from '../assistant/api';
import { callAssistantApi } from '../assistant/apiClient';
import type { Achievement } from '../gamification';
import ExtrasSwitcher from '../components/ExtrasSwitcher';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createBadgeSvg(title: string, emoji: string, bg: string, accent: string): string {
  const safeTitle = escapeXml(title.slice(0, 40) || 'Achievement');
  const safeEmoji = escapeXml(emoji || '⭐');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220">
    <defs>
      <linearGradient id="badgeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.85" />
        <stop offset="100%" stop-color="${bg}" stop-opacity="0.95" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(0,0,0,0.45)" />
      </filter>
    </defs>
    <rect x="20" y="20" width="360" height="180" rx="26" fill="url(#badgeGrad)" stroke="${accent}" stroke-width="4" filter="url(#shadow)" />
    <text x="70" y="120" font-size="48" font-family="'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${safeEmoji}</text>
    <text x="140" y="115" font-size="28" font-family="'Montserrat','Segoe UI',sans-serif" fill="#ffffff" font-weight="600">${safeTitle}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function randomPalette(seed: number) {
  const palettes = [
    ['#19384a', '#4fa3ff'],
    ['#3b1f4a', '#ff76e0'],
    ['#2d3d1f', '#9be15d'],
    ['#4a2619', '#ff9f40'],
  ];
  return palettes[seed % palettes.length];
}

function parseBadgeMeta(text: string): { emoji?: string; bg?: string; accent?: string } {
  if (!text) return {};
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]);
    return {
      emoji: typeof parsed.emoji === 'string' ? parsed.emoji : undefined,
      bg: typeof parsed.bg === 'string' ? parsed.bg : undefined,
      accent: typeof parsed.accent === 'string' ? parsed.accent : undefined,
    };
  } catch {
    return {};
  }
}

async function generateBadgeImage(title: string, description: string): Promise<string> {
  const instructions = 'Ты — дизайнер наград. Ответь JSON вида {"emoji":"🎯","bg":"#123456","accent":"#abcdef"}.';
  const message = `Название: ${title}\nОписание: ${description}\nПодбери яркую эмоцию и цвета.`;
  try {
    const json = await callAssistantApi({ message, instructions, context: '' });
    const { text } = extractAssistantText(json);
    const meta = parseBadgeMeta(text);
    const [bgFallback, accentFallback] = randomPalette(Math.abs(title.length + description.length));
    return createBadgeSvg(title, meta.emoji || '🏆', meta.bg || bgFallback, meta.accent || accentFallback);
  } catch {
    const [bgFallback, accentFallback] = randomPalette(Math.abs(title.length + description.length));
    return createBadgeSvg(title, '🏅', bgFallback, accentFallback);
  }
}

function computeBonusXp(todayKey: string): { amount: number; label: string; avg: { awareness: number; efficiency: number; joy: number; count: number } } | null {
  try {
    const bonuses = computeWellbeingBonuses();
    const entry = bonuses[todayKey];
    if (!entry) return null;
    const avg = entry.avg;
    const label = `Средние (n=${avg.count}): осознанность ${avg.awareness}, эффективность ${avg.efficiency}, удовольствие ${avg.joy}`;
    return { amount: entry.xp, label, avg };
  } catch {
    return null;
  }
}

const AchievementsPage: React.FC = () => {
  const xp = useGamificationStore((s) => s.xp);
  const level = useGamificationStore((s) => s.level);
  const levelTitles = useGamificationStore((s) => s.levelTitles);
  const achievements = useGamificationStore((s) => s.achievements);
  const addAchievement = useGamificationStore((s) => s.addAchievement);
  const updateAchievement = useGamificationStore((s) => s.updateAchievement);
  const removeAchievement = useGamificationStore((s) => s.removeAchievement);
  const claimedBonuses = useGamificationStore((s) => s.claimedBonuses);
  const markBonusClaimed = useGamificationStore((s) => s.markBonusClaimed);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newXp, setNewXp] = useState(300);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTitle = levelTitles[level]?.title || `Уровень ${level}`;
  const progress = useMemo(() => progressWithinLevel(xp, level), [xp, level]);
  const todayKey = useMemo(() => ymd(), []);
  const bonus = computeBonusXp(todayKey);
  const bonusClaimed = claimedBonuses[todayKey];

  async function handleGeneratePreview() {
    if (!newTitle.trim()) {
      setError('Сначала укажите название достижения.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const dataUrl = await generateBadgeImage(newTitle, newDescription);
      setPreviewImage(dataUrl);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmitAchievement(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setError('Название достижения обязательно.');
      return;
    }
    const description = newDescription.trim();
    const xpAmount = Math.max(0, Math.round(newXp));
    let image = previewImage;
    if (!image) {
      image = await generateBadgeImage(title, description);
    }
    addAchievement({ title, description, xpReward: xpAmount, imageUrl: image });
    setNewTitle('');
    setNewDescription('');
    setNewXp(300);
    setPreviewImage('');
    setError(null);
  }

  async function handleRegenerate(achievement: Achievement) {
    const image = await generateBadgeImage(achievement.title, achievement.description);
    updateAchievement({ ...achievement, imageUrl: image });
  }

  function handleUpload(achievement: Achievement, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      updateAchievement({ ...achievement, imageUrl: result });
    };
    reader.readAsDataURL(file);
  }

  async function handlePreviewUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setPreviewImage(result);
    };
    reader.readAsDataURL(file);
  }

  function claimBonus() {
    if (!bonus) return;
    if (bonusClaimed) return;
    markBonusClaimed(todayKey, bonus.amount, {
      awareness: bonus.avg.awareness,
      efficiency: bonus.avg.efficiency,
      joy: bonus.avg.joy,
      count: bonus.avg.count,
    });
  }

  const progressPercent = Math.min(100, Math.round((progress.current / progress.required) * 100));

  return (
    <div className="achievements-page" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="tool-link">← Назад к доске</Link>
          <h2 style={{ margin: 0 }}>Достижения и опыт</h2>
        </div>
        <ExtrasSwitcher />
      </div>
      <section style={{ marginBottom: 32, background: '#10181f', padding: 16, borderRadius: 12, border: '1px solid #1f2b34' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Уровень {level}</div>
        <div style={{ color: '#7f93a3', marginBottom: 8 }}>{currentTitle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 16, borderRadius: 999, background: '#1b2730', overflow: 'hidden' }}>
            <div style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #4fa3ff, #7df7ff)', height: '100%' }} />
          </div>
          <div style={{ fontSize: 12, color: '#7f93a3' }}>{progress.current} / {progress.required}</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#7f93a3' }}>Всего опыта: {xp}</div>
      </section>
      <section style={{ marginBottom: 32, background: '#10181f', padding: 16, borderRadius: 12, border: '1px solid #1f2b34' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Бонус за самочувствие</div>
        {bonus ? (
          <>
            <div style={{ fontSize: 13, color: '#7f93a3', marginBottom: 12 }}>{bonus.label}</div>
            <button className="tool-btn" onClick={claimBonus} disabled={!!bonusClaimed}>
              {bonusClaimed ? `Бонус уже получен (+${bonusClaimed.xp} XP)` : `Получить бонус (+${bonus.amount} XP)`}
            </button>
          </>
        ) : (
          <div style={{ color: '#7f93a3' }}>Чтобы получить бонус, держите все показатели осознанности, эффективности и удовольствия ≥ 7.</div>
        )}
      </section>
      <section style={{ marginBottom: 32, background: '#10181f', padding: 16, borderRadius: 12, border: '1px solid #1f2b34' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Добавить достижение</div>
        <form onSubmit={handleSubmitAchievement} style={{ display: 'grid', gap: 12 }}>
          <label>
            Название
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required style={{ width: '100%', marginTop: 4 }} />
          </label>
          <label>
            Описание
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} style={{ width: '100%', marginTop: 4, minHeight: 80 }} />
          </label>
          <label>
            Опыт за достижение
            <input 
              type="text" 
              inputMode="numeric" 
              value={newXp} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || val === '-') {
                  setNewXp(0);
                } else {
                  const num = Number(val);
                  if (!isNaN(num)) {
                    setNewXp(num);
                  }
                }
              }} 
              style={{ width: '100%', marginTop: 4 }} 
            />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="tool-btn" onClick={handleGeneratePreview} disabled={isGenerating}>
              {isGenerating ? 'Генерация…' : 'Попросить ИИ придумать значок'}
            </button>
            <label className="tool-btn" style={{ cursor: 'pointer' }}>
              Загрузить изображение
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) { void handlePreviewUpload(file); } }} />
            </label>
            {previewImage ? <span style={{ fontSize: 12, color: '#7f93a3' }}>Предпросмотр готов</span> : null}
          </div>
          {previewImage ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img src={previewImage} alt="Превью достижения" style={{ width: 180, height: 'auto', borderRadius: 12, border: '1px solid #1f2b34' }} />
              <button type="button" className="tool-btn" onClick={() => setPreviewImage('')}>Очистить превью</button>
            </div>
          ) : null}
          {error ? <div style={{ color: '#ff6b6b' }}>{error}</div> : null}
          <div>
            <button type="submit" className="tool-btn">Сохранить достижение</button>
          </div>
        </form>
      </section>
      <section style={{ background: '#10181f', padding: 16, borderRadius: 12, border: '1px solid #1f2b34' }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Мои достижения</div>
        {achievements.length === 0 ? (
          <div style={{ color: '#7f93a3' }}>Достижений пока нет — самое время создать первое!</div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {achievements.map((ach) => (
              <div key={ach.id} style={{ border: '1px solid #1f2b34', borderRadius: 12, padding: 12, background: '#0c1319', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ach.imageUrl ? <img src={ach.imageUrl} alt={ach.title} style={{ width: '100%', borderRadius: 8 }} /> : <div style={{ height: 140, borderRadius: 8, background: '#1b2730', display: 'grid', placeItems: 'center', color: '#7f93a3' }}>Нет изображения</div>}
                <div style={{ fontWeight: 600 }}>{ach.title}</div>
                <div style={{ fontSize: 12, color: '#7f93a3' }}>{ach.description || 'Без описания'}</div>
                <div style={{ fontSize: 12, color: '#7f93a3' }}>Опыт: +{ach.xpReward}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="tool-btn" onClick={() => void handleRegenerate(ach)}>Новая картинка от ИИ</button>
                  <label className="tool-btn" style={{ cursor: 'pointer' }}>
                    Загрузить
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(ach, file); }} />
                  </label>
                  <button className="tool-btn" onClick={() => removeAchievement(ach.id)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AchievementsPage;
