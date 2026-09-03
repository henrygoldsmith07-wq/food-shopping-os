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
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      app.enterDemoMode();
      window.history.replaceState({}, '', '/');
    }
    return () => {
      delete document.documentElement.dataset.forqReady;
      delete document.documentElement.dataset.forqOnline;
      window.removeEventListener('online', announceOnlineState);
      window.removeEventListener('offline', announceOnlineState);
    };
  }, [app.enterDemoMode]);
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
