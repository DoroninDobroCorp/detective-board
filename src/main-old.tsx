import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './errorOverlay';
import App from './App.tsx';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getLogger } from './logger';

const log = getLogger('main-old');

// NO BASENAME - for accessing old IndexedDB data at root path
log.info('app:start:old-path');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);

log.info('app:rendered:old-path');
