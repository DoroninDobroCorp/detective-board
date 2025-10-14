export interface AssistantApiText {
  text: string;
  model?: string;
}

export function extractAssistantText(payload: unknown): AssistantApiText {
  if (payload === null || payload === undefined) return { text: '' };
  if (typeof payload === 'string') return { text: payload };
  if (typeof payload !== 'object') return { text: '' };
  const obj = payload as Record<string, unknown>;
  if (typeof obj.text === 'string') {
    return { text: obj.text, model: typeof obj.model === 'string' ? obj.model : undefined };
  }
  if (Array.isArray(obj.output)) {
    const fragments: string[] = [];
    for (const item of obj.output as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const itemObj = item as Record<string, unknown>;
      const content = Array.isArray(itemObj.content) ? (itemObj.content as unknown[]) : [];
      for (const chunk of content) {
        if (!chunk || typeof chunk !== 'object') continue;
        const chunkObj = chunk as Record<string, unknown>;
        if (typeof chunkObj.text === 'string') fragments.push(chunkObj.text);
        else if (typeof chunkObj.output_text === 'string') fragments.push(chunkObj.output_text);
      }
    }
    return { text: fragments.join('\n').trim(), model: typeof obj.model === 'string' ? obj.model : undefined };
  }
  if (Array.isArray(obj.choices)) {
    const first = obj.choices[0] as Record<string, unknown> | undefined;
    const txt = first?.message && typeof first.message === 'object' ? (first.message as Record<string, unknown>).content : undefined;
    if (typeof txt === 'string') return { text: txt, model: typeof obj.model === 'string' ? obj.model : undefined };
    if (Array.isArray(txt)) {
      const pieces = (txt as unknown[]).map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && typeof (p as Record<string, unknown>).text === 'string') {
          return (p as Record<string, unknown>).text as string;
        }
        return '';
      });
      return { text: pieces.join('\n').trim(), model: typeof obj.model === 'string' ? obj.model : undefined };
    }
  }
  return { text: '' };
}

