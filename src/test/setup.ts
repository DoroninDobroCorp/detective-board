import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Очистка после каждого теста
afterEach(() => {
  cleanup();
});

// Расширение expect если нужно
// import matchers from '@testing-library/jest-dom/matchers';
// expect.extend(matchers);
