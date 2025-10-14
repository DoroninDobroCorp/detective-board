import { describe, it, expect } from 'vitest';
import { isCoverUrlInvalid, normalizeCoverUrl } from './coverUtils';

describe('coverUtils', () => {
  describe('isCoverUrlInvalid', () => {
    it('возвращает true для пустой строки', () => {
      expect(isCoverUrlInvalid('')).toBe(true);
    });

    it('возвращает true для строки с пробелами', () => {
      expect(isCoverUrlInvalid('   ')).toBe(true);
    });

    it('возвращает true для undefined', () => {
      expect(isCoverUrlInvalid(undefined)).toBe(true);
    });

    it('возвращает true для null', () => {
      expect(isCoverUrlInvalid(null)).toBe(true);
    });

    it('возвращает true для data URI', () => {
      expect(isCoverUrlInvalid('data:image/png;base64,ABC123')).toBe(true);
    });

    it('возвращает false для валидного URL', () => {
      expect(isCoverUrlInvalid('https://example.com/image.jpg')).toBe(false);
    });

    it('возвращает false для относительного пути', () => {
      expect(isCoverUrlInvalid('/images/cover.png')).toBe(false);
    });
  });

  describe('normalizeCoverUrl', () => {
    it('убирает пробелы из URL', () => {
      expect(normalizeCoverUrl('  https://example.com/image.jpg  ')).toBe('https://example.com/image.jpg');
    });

    it('возвращает пустую строку для undefined', () => {
      expect(normalizeCoverUrl(undefined)).toBe('');
    });

    it('возвращает пустую строку для null', () => {
      expect(normalizeCoverUrl(null)).toBe('');
    });

    it('возвращает пустую строку для data URI', () => {
      expect(normalizeCoverUrl('data:image/png;base64,ABC')).toBe('');
    });

    it('возвращает нормализованный URL', () => {
      expect(normalizeCoverUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
    });
  });
});
