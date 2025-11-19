import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from './store';
import { useGamificationStore } from './gamification';
import { BoardCanvas } from './components/BoardCanvas';
import { Toolbar } from './components/Toolbar';
import { InspectorPanel } from './components/InspectorPanel';
import { ActiveTasksPage } from './pages/ActiveTasksPage';
import { BooksPage } from './pages/BooksPage';
import { MoviesPage } from './pages/MoviesPage';
import { GamesPage } from './pages/GamesPage';
import { getLogger } from './logger';
import { DiagPage } from './pages/DiagPage';
import CompletedTasksPage from './pages/CompletedTasksPage';
import { PurchasesPage } from './pages/PurchasesPage';
import AchievementsPage from './pages/AchievementsPage';
import WellbeingManager from './components/WellbeingManager';
import GamificationManager from './components/GamificationManager';
import { DiaryPage } from './pages/DiaryPage';
import { LevelTitlesPage } from './pages/LevelTitlesPage';
import TasksGraphPage from './pages/TasksGraphPage';

declare global {
  interface Window {
    __appStore?: typeof useAppStore;
    __gamificationStore?: typeof useGamificationStore;
  }
}

function BoardPage() {
  return (
    <div className="app-shell">
      <Toolbar />
      <InspectorPanel />
      <BoardCanvas />
    </div>
  );
}

function App() {
  const initialized = useAppStore((s) => s.initialized);
  const init = useAppStore((s) => s.init);
  const log = getLogger('App');
  
  // Expose stores for e2e tests immediately
  try {
    if (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.pathname.includes('/detective-board/')) {
      window.__appStore = useAppStore;
      window.__gamificationStore = useGamificationStore;
    }
  } catch (err) {
    log.warn('app:expose-store-failed', { error: err instanceof Error ? err.message : String(err) });
  }

  useEffect(() => {
    // Re-expose stores for e2e tests (dev only)
    try {
      if (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.pathname.includes('/detective-board/')) {
        window.__appStore = useAppStore;
        window.__gamificationStore = useGamificationStore;
      }
    } catch (err) {
      log.warn('app:expose-store-failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  
  useEffect(() => {
    // Auto-import from migration endpoint
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto-import') === '1') {
      log.info('auto-import:detected');
      (async () => {
        try {
          const resp = await fetch('/api/migration/import');
          if (!resp.ok) {
            log.warn('auto-import:no-data');
            void init();
            return;
          }
          
          const data = await resp.json();
          log.info('auto-import:received', { 
            nodes: data.nodes?.length,
            diary: data.diary?.length,
            hasGamification: !!data.gamification
          });
          
          // Import using the importBackup function
          const { importBackup } = await import('./exportImport');
          
          // Convert data to File-like object for importBackup
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const file = new File([blob], 'migration.json', { type: 'application/json' });
          
          await importBackup(file, 'replace');
          log.info('auto-import:success');
          
          // Remove the query param
          window.history.replaceState({}, '', window.location.pathname);
          
          // Reload to ensure everything is properly initialized
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          log.error('auto-import:failed', { error: err instanceof Error ? err.message : String(err) });
          void init();
        }
      })();
    } else if (!initialized) {
      log.info('init:request');
      void init();
    }
  }, [init, initialized, log]);
  const loc = useLocation();
  useEffect(() => {
    log.info('route', { path: loc.pathname });
  }, [loc.pathname, log]);
  return (
    <>
      <WellbeingManager />
      <GamificationManager />
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/active" element={<ActiveTasksPage />} />
        <Route path="/done" element={<CompletedTasksPage />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="/level-titles" element={<LevelTitlesPage />} />
        <Route path="/graph" element={<TasksGraphPage />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/diag" element={<DiagPage />} />
      </Routes>
    </>
  );
}

export default App
