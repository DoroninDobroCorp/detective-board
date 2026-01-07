import { getLogger } from './logger';

const log = getLogger('sync');
let syncTimeout: NodeJS.Timeout | null = null;

export async function syncToServer(data: any) {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    try {
      const resp = await fetch('/api/storage/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error('Sync failed');
      log.info('sync:success');
    } catch (err) {
      log.error('sync:failed', { error: String(err) });
    }
  }, 2000);
}

export async function loadFromServer() {
  try {
    const resp = await fetch('/api/storage/load');
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    log.error('load:failed', { error: String(err) });
    return null;
  }
}
