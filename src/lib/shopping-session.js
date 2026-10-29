import { useState } from 'react';
import { markTripStart, clearTripStart, finishTrip, readTrips, estimateMinutesLeft } from './trip-pace.js';

const SESSION_KEY = 'forq-shopping-session-v1';

const readSession = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return saved?.active ? { active: true, store: typeof saved.store === 'string' ? saved.store : '' } : null;
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
  const [trips, setTrips] = useState(readTrips);
  const start = (store = '') => {
    const next = { active: true, store };
    writeSession(next);
    markTripStart();
    setSession(next);
  };
  const stop = (ticked) => {
    // Called bare or from an onClick: only a real number of ticked items counts as a finished trip.
    if (typeof ticked === 'number') setTrips(finishTrip(ticked)); else clearTripStart();
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
  const minutesLeft = (remaining) => (session.active ? estimateMinutesLeft(trips, remaining) : null);
  return { active: session.active, store: session.store, start, stop, selectStore, minutesLeft };
}
