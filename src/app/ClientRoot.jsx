'use client';

import { useEffect } from 'react';
import App from '../App.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { AppProvider, useApp } from '../lib/store.jsx';

function RootSession() {
  const app = useApp();
  useEffect(() => {
    document.documentElement.dataset.forqReady = 'true';
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      app.enterDemoMode();
      window.history.replaceState({}, '', '/');
    }
    return () => { delete document.documentElement.dataset.forqReady; };
  }, [app.enterDemoMode]);
  return <App />;
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
