import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from './store';
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

declare global {
  interface Window {
    __appStore?: typeof useAppStore;
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
  useEffect(() => {
    // Expose store for e2e tests (dev only)
    try {
      if (import.meta.env.DEV) {
        window.__appStore = useAppStore;
      }
    } catch (err) {
      log.warn('app:expose-store-failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  useEffect(() => {
    if (!initialized) {
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
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/diag" element={<DiagPage />} />
      </Routes>
    </>
  );
}

export default App
