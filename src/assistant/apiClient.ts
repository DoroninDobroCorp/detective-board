import { getLogger } from '../logger';

const log = getLogger('ApiClient');

interface AssistantPayload {
  message: string;
  instructions: string;
  context?: string;
}

/**
 * Вызывает API ассистента с автоматическим fallback на Google в случае ошибки OpenAI.
 */
export async function callAssistantApi(payload: AssistantPayload): Promise<unknown> {
  try {
    log.info('api:openai:call', { message: payload.message });
    const resp = await fetch('/api/openai/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errorJson = await resp.json().catch(() => ({}));
      const errorMessage = (errorJson as any)?.message || `HTTP ${resp.status}`;
      throw new Error(errorMessage);
    }
    return await resp.json();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.warn('api:openai:failed', { error: errorMessage });
    log.info('api:google:fallback');
    // Если OpenAI не удался, пробуем Google
    try {
      const resp = await fetch('/api/google/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const errorJson = await resp.json().catch(() => ({}));
        const fallbackErrorMessage = (errorJson as any)?.message || `HTTP ${resp.status}`;
        throw new Error(fallbackErrorMessage);
      }
      return await resp.json();
    } catch (fallbackErr) {
      const fallbackErrorMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      log.error('api:google:fallback_failed', { error: fallbackErrorMessage });
      // Если и Google не удался, пробрасываем ошибку дальше
      throw new Error(`OpenAI failed: ${errorMessage}. Google fallback also failed: ${fallbackErrorMessage}`);
    }
  }
}
