import { useState } from 'react';

const SESSION_KEY = 'forq-shopping-session-v1';

const readSession = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return saved?.active ? { active: true, store: saved.store || '' } : null;
  } catch {
    return null;
  }
};

const writeSession = (session) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Session storage is a convenience; local shopping state remains durable.
  }
};

export function useShoppingSession() {
  const [session, setSession] = useState(() => readSession() || { active: false, store: '' });
  const start = (store = '') => {
    const next = { active: true, store };
    writeSession(next);
    setSession(next);
  };
  const stop = () => {
    writeSession(null);
    setSession((current) => ({ ...current, active: false }));
  };
  const selectStore = (store = '') => {
    setSession((current) => {
      const next = { ...current, store };
      if (current.active) writeSession(next);
      return next;
    });
  };
  return { active: session.active, store: session.store, start, stop, selectStore };
}
