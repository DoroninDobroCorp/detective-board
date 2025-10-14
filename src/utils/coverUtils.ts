/**
 * Утилиты для работы с обложками (coverUrl)
 */

/**
 * Проверяет, является ли coverUrl невалидным (пустой или data URI)
 */
export function isCoverUrlInvalid(coverUrl: string | undefined | null): boolean {
  const url = typeof coverUrl === 'string' ? coverUrl.trim() : '';
  return !url || url.startsWith('data:');
}

/**
 * Нормализует coverUrl (убирает пробелы, возвращает пустую строку для невалидных)
 */
export function normalizeCoverUrl(coverUrl: string | undefined | null): string {
  const url = typeof coverUrl === 'string' ? coverUrl.trim() : '';
  return url.startsWith('data:') ? '' : url;
}
