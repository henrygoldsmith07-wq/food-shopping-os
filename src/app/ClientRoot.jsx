'use client';

import { useEffect } from 'react';
import { AppContent } from '../App.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { AppProvider, useApp } from '../lib/store.jsx';

function RootSession() {
  const app = useApp();
  useEffect(() => {
    document.documentElement.dataset.forqReady = 'true';
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const announceOnlineState = () => {
      document.documentElement.dataset.forqOnline = navigator.onLine ? 'true' : 'false';
    };
    announceOnlineState();
    window.addEventListener('online', announceOnlineState);
    window.addEventListener('offline', announceOnlineState);
    // ?demo=1 opens the sandbox tour; ?demo=1&adopt=1 (linked from /demo)
    // skips the tour and starts the real kitchen from the example week —
    // adoption rebases the dinners onto this week and leaves demo receipts
    // behind, so a logged-out visitor lands on a real plan, not a sandbox.
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      app.enterDemoMode();
      if (params.get('adopt') === '1') app.adoptDemoWeek();
      window.history.replaceState({}, '', '/');
    }
    return () => {
      delete document.documentElement.dataset.forqReady;
      delete document.documentElement.dataset.forqOnline;
      window.removeEventListener('online', announceOnlineState);
      window.removeEventListener('offline', announceOnlineState);
    };
  // `enterDemoMode`/`adoptDemoWeek` are stable callbacks; the whole `app`
  // object is not (a new identity each store update), so depending on it
  // would re-run boot setup — service-worker registration, online listeners,
  // demo-param handling — on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.enterDemoMode, app.adoptDemoWeek]);
  return <AppContent />;
}

export default function ClientRoot() {
  return (
    <div className="client-root">
      <ErrorBoundary>
        <AppProvider><RootSession /></AppProvider>
      </ErrorBoundary>
    </div>
  );
}
