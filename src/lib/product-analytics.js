import {
  PRODUCT_EVENT_NAME_SET, PRODUCT_EVENT_PROPERTY_KEYS,
} from '../data/analytics.js';

export const ANALYTICS_CONSENT_KEY = 'forq-product-analytics-consent-v1';
export const ANALYTICS_QUEUE_KEY = 'forq-product-events-v1';
const CLOUD_META_KEY = 'forq-cloud-meta-v1';
const MAX_QUEUE = 100;
const MAX_BATCH = 50;
const RETRY_AFTER_MS = 60000;
const LAST_ATTEMPT_KEY = 'forq-product-events-last-attempt-v1';
const inflightRequests = new Set();

const browserStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const readAnalyticsConsent = () => browserStorage()?.getItem(ANALYTICS_CONSENT_KEY) === 'granted';

export const setAnalyticsConsent = (enabled) => {
  const storage = browserStorage();
  if (!storage) return false;
  if (enabled) storage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
  else {
    storage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
    storage.removeItem(ANALYTICS_QUEUE_KEY);
    storage.removeItem(LAST_ATTEMPT_KEY);
    inflightRequests.forEach((controller) => controller.abort());
    inflightRequests.clear();
  }
  globalThis.dispatchEvent?.(new CustomEvent('forq-analytics-consent', { detail: { enabled: Boolean(enabled) } }));
  return true;
};

const newEventId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const legacyEventId = (event) => {
  const source = JSON.stringify({
    name: event?.name || 'event',
    properties: event?.properties || {},
    householdId: event?.householdId || 'local',
    at: event?.at || 'unknown',
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const readQueue = () => {
  try {
    const parsed = JSON.parse(browserStorage()?.getItem(ANALYTICS_QUEUE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.slice(-MAX_QUEUE).map((event) => {
        const safeEvent = event && typeof event === 'object' ? event : {};
        const id = typeof safeEvent.id === 'string' && safeEvent.id
          ? safeEvent.id
          : legacyEventId(safeEvent);
        return { ...safeEvent, id };
      })
      : [];
  } catch {
    return [];
  }
};

const writeQueue = (events) => {
  try {
    browserStorage()?.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
  } catch {
    // Analytics must never interfere with saving the user's food data.
  }
};

const safeProperties = (properties) => Object.fromEntries(
  Object.entries(properties || {})
    .filter(([key]) => PRODUCT_EVENT_PROPERTY_KEYS.has(key))
    .map(([key, value]) => {
      if (typeof value === 'boolean') return [key, value];
      if (typeof value === 'number' && Number.isFinite(value)) return [key, Math.max(0, Math.round(value * 100) / 100)];
      return [key, String(value || '').slice(0, 40)];
    }),
);

export const recordProductEvent = (name, properties = {}, at = new Date().toISOString()) => {
  if (!readAnalyticsConsent() || !PRODUCT_EVENT_NAME_SET.has(name)) return false;
  const events = [...readQueue(), {
    id: newEventId(),
    name,
    properties: safeProperties(properties),
    householdId: selectedHouseholdId(),
    at: typeof at === 'string' ? at : new Date(at).toISOString(),
  }].slice(-MAX_QUEUE);
  writeQueue(events);
  globalThis.dispatchEvent?.(new Event('forq-product-event'));
  return true;
};

const selectedHouseholdId = () => {
  try {
    return JSON.parse(browserStorage()?.getItem(CLOUD_META_KEY) || '{}')?.householdId || null;
  } catch {
    return null;
  }
};

const canAttempt = () => {
  const storage = browserStorage();
  const last = Number(storage?.getItem(LAST_ATTEMPT_KEY) || 0);
  return Date.now() - last >= RETRY_AFTER_MS;
};

/** Uploads only coarse, consented events for signed-in households. */
export const flushProductEvents = async ({ request = globalThis.fetch, householdId = selectedHouseholdId() } = {}) => {
  if (!readAnalyticsConsent() || !householdId || !request || !canAttempt()
    || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { sent: 0, skipped: true };
  }
  const events = readQueue();
  const eligible = events.filter((event) => event.householdId === householdId);
  // Events created before a household was selected, or for another household,
  // must never be attributed to the current household.
  if (eligible.length !== events.length) writeQueue(eligible);
  if (!eligible.length) return { sent: 0, skipped: true };
  browserStorage()?.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
  const batch = eligible.slice(0, MAX_BATCH);
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  if (controller) inflightRequests.add(controller);
  try {
    const response = await request('/api/analytics', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-forq-household-id': householdId,
      },
      ...(controller ? { signal: controller.signal } : {}),
      body: JSON.stringify({ events: batch }),
    });
    if (!response.ok) return { sent: 0, skipped: false };
    if (!readAnalyticsConsent()) return { sent: 0, skipped: true };
    const sentIds = new Set(batch.map((event) => event.id));
    writeQueue(readQueue().filter((event) => !sentIds.has(event.id)));
    return { sent: batch.length, skipped: false };
  } catch {
    return { sent: 0, skipped: false };
  } finally {
    if (controller) inflightRequests.delete(controller);
  }
};

export const queuedProductEventCount = () => readQueue().length;

export const clearProductEvents = () => {
  try {
    browserStorage()?.removeItem(ANALYTICS_QUEUE_KEY);
    browserStorage()?.removeItem(LAST_ATTEMPT_KEY);
  } catch {
    // Best effort; local food data is independent of this queue.
  }
};
