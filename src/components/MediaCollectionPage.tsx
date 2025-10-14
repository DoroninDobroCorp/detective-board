import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import type { BookItem, MovieItem, GameItem, PurchaseItem } from '../types';
import { getLogger } from '../logger';
import { buildFallbackList } from '../imageSearch';
import SmartImage from './SmartImage';
import ExtrasSwitcher from './ExtrasSwitcher';
import { useGamificationStore } from '../gamification';
import type { TaskPathInfo } from '../taskUtils';

type MediaItem = BookItem | MovieItem | GameItem | PurchaseItem;
type TableName = 'books' | 'movies' | 'games' | 'purchases';

interface MediaCollectionConfig {
  tableName: TableName;
  title: string;
  icon: string;
  parentPath: string;
  itemType: 'book' | 'movie' | 'game' | 'purchase';
  placeholder: string;
  searchSuffix: string;
  coverLabel: string;
  deletePrompt: string;
  resolveFunction: (title: string) => Promise<string | undefined>;
}

export const MediaCollectionPage: React.FC<MediaCollectionConfig> = ({
  tableName,
  title,
  icon,
  parentPath,
  itemType,
  placeholder,
  searchSuffix,
  coverLabel,
  deletePrompt,
  resolveFunction,
}) => {
  const log = getLogger(`${title}Page`);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [itemTitle, setItemTitle] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [urlEdits, setUrlEdits] = useState<Record<string, string>>({});
  const [openControls, setOpenControls] = useState<Record<string, boolean>>({});
  const enqueueManualCompletion = useGamificationStore((s) => s.enqueueManualCompletion);
  const removeManualCompletion = useGamificationStore((s) => s.removeManualCompletion);

  const buildCompletionId = (itemId: string, completedAt: number) => `${itemType}:${itemId}:${completedAt}`;

  const buildCompletionInfo = (item: MediaItem, completionId: string): TaskPathInfo => ({
    id: completionId,
    title: item.title,
    status: 'done',
    dueDate: undefined,
    isActual: true,
    description: item.comment,
    priority: undefined,
    parentPath: [parentPath],
    iconEmoji: icon,
  });

  const load = async () => {
    const all = await db[tableName].orderBy('createdAt').reverse().toArray();
    setItems(all.filter((x: MediaItem) => x.status !== 'done'));
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await db[tableName].toArray();
        const missing = list.filter((item: MediaItem) => {
          const url = typeof item.coverUrl === 'string' ? item.coverUrl.trim() : '';
          return !url || url.startsWith('data:');
        });
        for (const item of missing) {
          const url = await resolveFunction(item.title);
          if (url) {
            await db[tableName].update(item.id, { coverUrl: url });
          }
        }
        if (missing.length) {
          await load();
        }
      } catch (e) {
        log.warn('autofill_covers:error', e as Error);
      }
    })();
  }, []);

  const addItem = async () => {
    const t = itemTitle.trim();
    if (!t) return;
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      const coverUrl = await resolveFunction(t);
      const item: MediaItem = { id, title: t, comment: comment.trim() || undefined, coverUrl, createdAt: Date.now(), status: 'active' };
      await db[tableName].add(item);
      setItemTitle('');
      setComment('');
      await load();
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (id: string) => {
    await db[tableName].delete(id);
    await load();
  };

  const toggleDone = async (item: MediaItem) => {
    const done = item.status === 'done';
    if (done) {
      await db[tableName].update(item.id, { status: 'active', completedAt: undefined });
      if (typeof item.completedAt === 'number') {
        removeManualCompletion(buildCompletionId(item.id, item.completedAt));
      }
    } else {
      const completedAt = Date.now();
      await db[tableName].update(item.id, { status: 'done', completedAt });
      const completionId = buildCompletionId(item.id, completedAt);
      const info = buildCompletionInfo(item, completionId);
      enqueueManualCompletion({ id: completionId, info, completedAt });
    }
    await load();
  };

  const setCoverFromFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const input = e.target;
    const id = input.getAttribute('data-id');
    const file = input.files?.[0];
    if (!id || !file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await db[tableName].update(id, { coverUrl: String(reader.result) });
      setUrlEdits((s) => ({ ...s, [id]: '' }));
      await load();
    };
    reader.readAsDataURL(file);
    input.value = '';
  };

  const saveCoverUrl = async (id: string) => {
    const u = (urlEdits[id] || '').trim();
    if (!u) return;
    await db[tableName].update(id, { coverUrl: u });
    await load();
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="tool-link" aria-label="Назад к доске">← Назад к доске</Link>
          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>
        <ExtrasSwitcher />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 680, marginBottom: 16 }}>
        <input placeholder={placeholder} value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
        <input placeholder="Комментарий (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <button onClick={() => { void addItem(); }} disabled={loading}>Добавить</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {items.map((item) => (
          <div key={item.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, background: '#fff' }}>
            <SmartImage
              urls={buildFallbackList(itemType, item.title, item.coverUrl)}
              alt={item.title}
              query={(!item.coverUrl || (item.coverUrl || '').startsWith('data:')) ? `${item.title} ${searchSuffix}` : undefined}
              style={{ width: '100%', height: 260, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
              onResolved={(url) => {
                if (url && !url.startsWith('data:') && url !== item.coverUrl) {
                  void db[tableName].update(item.id, { coverUrl: url });
                }
              }}
            />
            <div style={{ fontWeight: 700, color: '#000', marginBottom: 4 }}>{item.title}</div>
            {item.comment ? <div style={{ color: '#555', marginBottom: 8 }}>{item.comment}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#888', fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString()}</span>
              <div style={{ display: 'inline-flex', gap: 8 }}>
                {item.status === 'done' ? <span className="badge">✅ Выполнено</span> : null}
                <button title={coverLabel} aria-label={coverLabel} onClick={() => setOpenControls((s) => ({ ...s, [item.id]: !s[item.id] }))}>🖼</button>
                <button title={item.status === 'done' ? 'Вернуть' : 'Выполнено'} aria-label={item.status === 'done' ? 'Вернуть' : 'Выполнено'} onClick={() => { void toggleDone(item); }}>{item.status === 'done' ? '↩️' : '✅'}</button>
                <button title="Удалить" aria-label="Удалить" onClick={() => { if (confirm(deletePrompt)) { void removeItem(item.id); } }}>🗑️</button>
              </div>
            </div>
            {openControls[item.id] ? (
              <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ flex: 1 }} placeholder={`${coverLabel} (URL)`} value={urlEdits[item.id] ?? ''} onChange={(e) => setUrlEdits((s) => ({ ...s, [item.id]: e.target.value }))} />
                  <button onClick={() => { void saveCoverUrl(item.id); }}>Сохранить</button>
                </div>
                <div>
                  <label style={{ display: 'inline-block' }}>
                    <span style={{ marginRight: 8 }}>Загрузить файл</span>
                    <input data-id={item.id} type="file" accept="image/*" onChange={setCoverFromFile} />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MediaCollectionPage;
