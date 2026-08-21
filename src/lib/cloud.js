const META_KEY = 'forq-cloud-meta-v1';
const QUEUE_KEY = 'forq-cloud-queue-v1';

const readMeta = () => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
};

const deviceId = () => {
  const meta = readMeta();
  if (!meta.deviceId) meta.deviceId = crypto.randomUUID();
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  return meta.deviceId;
};

const saveMeta = (next) => {
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
};

const saveMetaIfNewer = (next) => {
  const current = readMeta();
  const sameHousehold = current.householdId && next.householdId
    && String(current.householdId) === String(next.householdId);
  if (sameHousehold && Number(current.version || 0) > Number(next.version || 0)) return current;
  return saveMeta(next);
};

const readQueue = () => {
  try {
    const queued = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null');
    return queued?.state && queued?.meta ? queued : null;
  } catch {
    return null;
  }
};

const saveQueue = (state, meta) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ state, meta, queuedAt: Date.now() }));
  } catch {
    // The main local store reports storage failures; sync queuing is best effort.
  }
};

const syncState = (state) => ({
  ...state,
  syncTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
});

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Cloud request failed.');
    error.status = response.status;
    throw error;
  }
  return body;
};

export async function initialiseCloud(localState) {
  try {
    const status = await request('/api/backend/status');
    if (!status.enabled) return { status: { kind: 'disabled', message: 'Add backend environment variables to enable cloud sync.' } };
    if (!status.authenticated) return { status: { kind: 'signed-out', message: 'Sign in to sync this device.' } };
    const saved = readMeta();
    const remote = await request('/api/sync', {
      headers: saved.householdId ? { 'x-forq-household-id': saved.householdId } : {},
    });
    let meta = {
      deviceId: deviceId(),
      householdId: remote.householdId,
      version: remote.version,
    };
    const baseVersion = saved.householdId
      && String(saved.householdId) === String(remote.householdId)
      ? Number(saved.version || 0)
      : null;
    if (remote.state) {
      saveMeta(meta);
      return {
        state: remote.state,
        meta,
        baseVersion,
        status: { kind: 'ready', message: 'Synced with your household.' },
      };
    }
    if (localState.onboarded) {
      const result = await request('/api/sync', {
        method: 'PUT',
        body: JSON.stringify({ version: 0, deviceId: meta.deviceId, state: syncState(localState) }),
      });
      meta = saveMeta({ ...meta, version: result.version });
    } else {
      saveMeta(meta);
    }
    return { meta, status: { kind: 'ready', message: 'Cloud sync is ready.' } };
  } catch (error) {
    return {
      status: {
        kind: navigator.onLine ? 'error' : 'offline',
        message: navigator.onLine ? error.message : 'Offline. Changes will remain on this device.',
      },
    };
  }
}

export async function pushCloud(state, meta, { queueOnFailure = true } = {}) {
  try {
    const result = await request('/api/sync', {
      method: 'PUT',
      headers: meta.householdId ? { 'x-forq-household-id': meta.householdId } : {},
      body: JSON.stringify({ version: meta.version, deviceId: meta.deviceId, state: syncState(state) }),
    });
    return {
      meta: saveMetaIfNewer({ ...meta, version: result.version }),
      status: { kind: 'ready', message: 'All changes synced.' },
    };
  } catch (error) {
    if (queueOnFailure && error.status !== 409) saveQueue(state, meta);
    return {
      meta,
      status: {
        kind: error.status === 409 ? 'conflict' : (navigator.onLine ? 'error' : 'offline'),
        message: error.status === 409
          ? 'This household changed on another device. Export a backup, then reload to use the newer copy.'
          : (navigator.onLine ? error.message : 'Offline changes queued. They will sync automatically when you reconnect.'),
      },
    };
  }
}

export async function retryQueuedCloud() {
  const queued = readQueue();
  if (!queued) return null;
  const result = await pushCloud(queued.state, queued.meta, { queueOnFailure: false });
  if (result.status.kind === 'ready') localStorage.removeItem(QUEUE_KEY);
  return result;
}

export function hasQueuedCloud() {
  return Boolean(readQueue());
}

export function selectCloudHousehold(householdId) {
  saveMeta({ ...readMeta(), householdId, version: 0 });
}

export async function pullCloud(meta) {
  try {
    const remote = await request('/api/sync', {
      headers: meta.householdId ? { 'x-forq-household-id': meta.householdId } : {},
    });
    return {
      state: remote.version > meta.version ? remote.state : null,
      meta: saveMetaIfNewer({ ...meta, householdId: remote.householdId, version: remote.version }),
      status: { kind: 'ready', message: 'Household changes received live.' },
    };
  } catch (error) {
    return {
      state: null,
      meta,
      status: {
        kind: navigator.onLine ? 'error' : 'offline',
        message: navigator.onLine ? error.message : 'Offline. Live changes will resume when you reconnect.',
      },
    };
  }
}

export async function subscribeCloud(meta, onChanged, onStatus = () => {}) {
  if (typeof EventSource === 'undefined') throw new Error('Live updates are not supported by this browser.');
  let source;
  let refreshTimer;
  let reconnectTimer;
  let stopped = false;
  let redisSince = new Date(Date.now() - 10000).toISOString();
  let redisCursor = '';
  let redisFailures = 0;
  const report = (kind, message) => onStatus({ kind, message });
  const updateCursor = (event, data) => {
    let candidate = data?.__forqCreatedAt;
    let nextCursor = data?.__forqCursor || '';
    if (!candidate && event.lastEventId) [candidate, nextCursor] = event.lastEventId.split('|');
    if (!candidate) return;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return;
    const nextSince = parsed.toISOString();
    if (nextSince > redisSince || (nextSince === redisSince && nextCursor > redisCursor)) {
      redisSince = nextSince;
      redisCursor = nextCursor;
    }
  };
  const connectRedis = (announce = true) => {
    if (stopped) return;
    if (announce) report('connecting', 'Connecting live household sync…');
    source?.close();
    const url = new URL('/api/realtime/stream', window.location.origin);
    url.search = new URLSearchParams({
      householdId: meta.householdId,
      since: redisSince,
      ...(redisCursor ? { cursor: redisCursor } : {}),
    });
    source = new EventSource(url);
    source.addEventListener('changed', (event) => {
      try {
        const data = JSON.parse(event.data);
        updateCursor(event, data);
        const { __forqCreatedAt, __forqCursor, ...change } = data || {};
        onChanged(change);
      } catch {
        // Ignore malformed provider messages; the stream reconnects on failure.
      }
    });
    source.onerror = () => {
      source?.close();
      redisFailures += 1;
      if (redisFailures >= 2) report('reconnecting', 'Live sync paused. Reconnecting…');
      if (!stopped) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => connectRedis(false), 3000);
      }
    };
    source.onopen = () => {
      redisFailures = 0;
      report('connected', 'Live household sync connected.');
    };
  };
  const connect = async () => {
    report('connecting', 'Connecting live household sync…');
    const auth = await request('/api/realtime/token', {
      method: 'POST',
      headers: meta.householdId ? { 'x-forq-household-id': meta.householdId } : {},
      body: '{}',
    }).catch(() => ({ fallback: 'redis' }));
    if (stopped) return;
    if (auth.fallback === 'redis') {
      connectRedis();
      return;
    }
    source?.close();
    const url = new URL('https://main.realtime.ably.net/sse');
    url.search = new URLSearchParams({
      channels: `household:${meta.householdId}`,
      v: '1.2',
      accessToken: auth.token,
      enveloped: 'true',
    });
    source = new EventSource(url);
    source.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.name !== 'changed') return;
        const data = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
        const { __forqCreatedAt, __forqCursor, ...change } = data || {};
        onChanged(change);
      } catch {
        // Ignore malformed provider messages; the provider refresh still runs.
      }
    });
    source.onerror = () => report('reconnecting', 'Live sync paused. Reconnecting…');
    source.onopen = () => report('connected', 'Live household sync connected.');
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(connect, Math.max(60000, Number(auth.expires) - Date.now() - 60000));
  };
  await connect();
  return () => {
    stopped = true;
    clearTimeout(refreshTimer);
    clearTimeout(reconnectTimer);
    source?.close();
  };
}

const selectedHeaders = () => {
  const householdId = readMeta().householdId;
  return householdId ? { 'x-forq-household-id': householdId } : {};
};

export const listCoachShares = () => request('/api/coach-shares', { headers: selectedHeaders() });

export const createCoachShare = (input) => request('/api/coach-shares', {
  method: 'POST',
  headers: selectedHeaders(),
  body: JSON.stringify(input),
});

export const revokeCoachShare = (id) => request(`/api/coach-shares?id=${encodeURIComponent(id)}`, {
  method: 'DELETE',
  headers: selectedHeaders(),
  body: '{}',
});

export const listHouseholdAudit = () => request('/api/households/audit', {
  headers: selectedHeaders(),
});

export function selectedCloudHouseholdId() {
  return readMeta().householdId || null;
}

export function forgetCloudHousehold() {
  localStorage.removeItem(META_KEY);
}
