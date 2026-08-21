'use client';

import { useEffect } from 'react';
import App from '../App.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

export default function ClientRoot() {
  useEffect(() => {
    document.documentElement.dataset.forqReady = 'true';
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => { delete document.documentElement.dataset.forqReady; };
  }, []);

  return (
    <div className="client-root">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}
