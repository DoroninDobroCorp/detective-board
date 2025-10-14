/// <reference types="vite/client" />

import type { auditAndFixAllCovers } from './coverAudit';
import type { runCoverBackfill } from './coverBackfill';

declare global {
  interface Window {
    // Dev helpers
    __coverAudit?: typeof auditAndFixAllCovers;
    __coverBackfill?: typeof runCoverBackfill;
    
    // FPS monitoring (тесты производительности)
    __fps?: number[];
    __dragStart?: number;
    
    // Vite preload (используется в тестах)
    __vitePreload?: {
      useAppStore?: unknown;
    };
  }
}

export {};
