// Shop-trip pace: how long your own past trips took per item, so the
// in-store screen can say "about 12 min left". Local only, learned from
// trips you finished here; nothing is shown until there are enough of them.
const PACE_KEY = 'forq-trip-pace-v1';
const START_KEY = 'forq-trip-started-v1';
const MAX_TRIPS = 8;
export const MIN_TRIPS = 2;
const MIN_ITEMS = 3;
const MIN_MS = 2 * 60 * 1000;
const MAX_MS = 3 * 60 * 60 * 1000;

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export const readTrips = () => safe(() => {
  const raw = JSON.parse(localStorage.getItem(PACE_KEY) || '[]');
  return Array.isArray(raw)
    ? raw.filter((t) => t && Number.isFinite(t.items) && t.items > 0 && Number.isFinite(t.ms) && t.ms > 0)
    : [];
}, []);

/** Add a finished trip; ignores trips too short, too long or too small to trust. */
export function addTrip(trips, { items, ms }) {
  const list = Array.isArray(trips) ? trips : [];
  if (!(items >= MIN_ITEMS) || !(ms >= MIN_MS) || !(ms <= MAX_MS)) return list;
  return [...list, { items: Math.round(items), ms: Math.round(ms) }].slice(-MAX_TRIPS);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Minutes left for `remaining` items, or null until MIN_TRIPS past trips exist. */
export function estimateMinutesLeft(trips, remaining) {
  const list = Array.isArray(trips) ? trips : [];
  if (list.length < MIN_TRIPS || !(remaining > 0)) return null;
  const perItem = median(list.map((t) => t.ms / t.items));
  return Math.max(1, Math.round((perItem * remaining) / 60000));
}

export const markTripStart = (now = Date.now()) => safe(() => sessionStorage.setItem(START_KEY, String(now)));
export const readTripStart = () => safe(() => Number(sessionStorage.getItem(START_KEY)) || null, null);
export const clearTripStart = () => safe(() => sessionStorage.removeItem(START_KEY));

/** Close the trip: save its pace when it looks like a real shop. */
export function finishTrip(ticked, now = Date.now()) {
  const started = readTripStart();
  clearTripStart();
  if (!started) return readTrips();
  const next = addTrip(readTrips(), { items: ticked, ms: now - started });
  safe(() => localStorage.setItem(PACE_KEY, JSON.stringify(next)));
  return next;
}
