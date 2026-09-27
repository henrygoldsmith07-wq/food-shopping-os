import { adoptRemoteSharedState, baseStateSnapshot } from './household-merge.js';
import { valueFingerprint } from './state-merge.js';

const META_KEY = 'forq-cloud-meta-v1';
const QUEUE_KEY = 'forq-cloud-queue-v1';
const BASE_FP_KEY = 'forq-cloud-base-v2';

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

/** When this device last confirmed a successful sync, or null. */
export function lastSyncedAt() {
  const meta = readMeta();
  return meta.syncedAt || null;
}

/* ---- Divergence base for the shared state --------------------------------
   Fingerprints of the state as it was when this device last confirmed a
   sync. A later 409 or pull compares local rows against this base to tell
   "I changed this" from "the household changed this" — without a base,
   every difference looks like a fight. Saved only on confirmed syncs, never
   on a failed push, so the base never drifts towards an unsynced edit. */

const readBase = () => {
  try {
    return JSON.parse(localStorage.getItem(BASE_FP_KEY) || 'null');
  } catch {
    return null;
  }
};

export function saveBaseState(state, version) {
  try {
    localStorage.setItem(BASE_FP_KEY, JSON.stringify(baseStateSnapshot(state, version)));
  } catch {
    // Sync already tells the user when storage fails; the base is best effort.
  }
}

/** What this device last agreed with the household, or null. */
export function readBaseState() {
  return readBase();
}

/** When offline changes were queued, or null. */
export function queuedSince() {
  const queued = readQueue();
  return queued?.queuedAt || null;
}

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
    // The server returns the current household state on a 409 so the losing
    // device can reconcile the shared list instead of reloading and dropping
    // its edits.
    error.body = body;
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
      saveMeta({ ...meta, syncedAt: Date.now() });
      saveBaseState(remote.state, meta.version);
      return {
        state: remote.state,
        meta: { ...meta, syncedAt: Date.now() },
        baseVersion,
        status: { kind: 'ready', message: 'Synced with your household.' },
      };
    }
    if (localState.onboarded) {
      const result = await request('/api/sync', {
        method: 'PUT',
        body: JSON.stringify({ version: 0, deviceId: meta.deviceId, state: syncState(localState) }),
      });
      meta = saveMeta({ ...meta, version: result.version, syncedAt: Date.now() });
      saveBaseState(localState, result.version);
    } else {
      saveMeta({ ...meta, syncedAt: Date.now() });
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

/* ---- Reconcile on 409 -----------------------------------------------------
   When a push loses the version race, the household copy rides back on the
   error. adoptRemoteListRows folds it into the local state; the caller then
   pushes the merged copy against the version the other device won with. */

export const listConflictStatus = (applied, mergedMessage) => (applied.conflicts
  ? {
    kind: 'conflict',
    message: `${applied.conflicts} item${applied.conflicts === 1 ? ' was' : 's were'} changed on two devices — pick which copy to keep.`,
  }
  : { kind: 'ready', message: mergedMessage });

/** Wire the pure fold into a live store: latest/meta/push guards are refs. */
export const makeCloudStateAdopter = ({ latest, cloudMeta, skipCloudPush, setState }) => (remoteState, remoteVersion) => {
  const applied = adoptRemoteSharedState(latest.current, remoteState, readBase());
  // Whichever copy wins the fold, the household's version is now the base
  // this device stands on — and the merged copy must reach the household
  // against that winning version.
  skipCloudPush.current = false;
  cloudMeta.current = {
    ...(cloudMeta.current || {}),
    version: Number(remoteVersion) || Number(cloudMeta.current?.version || 0),
    syncedAt: Date.now(),
  };
  if (!applied) {
    // Nothing to fold in. If the two copies already agree there is nothing
    // to push back either; otherwise this device's copy still needs its turn
    // at the household, so nudge the debounced push with the current state.
    const echoes = valueFingerprint(latest.current) === valueFingerprint(remoteState || {});
    skipCloudPush.current = echoes;
    if (!echoes) setState({ ...latest.current });
    return null;
  }
  // A fold that ends up exactly on the household copy has nothing of its own
  // to add — adopting it must not bounce it back as a new version.
  skipCloudPush.current = valueFingerprint(applied.state) === valueFingerprint(remoteState || {});
  setState(applied.state);
  return { conflicts: applied.conflicts };
};

export async function pushCloud(state, meta, { queueOnFailure = true } = {}) {
  try {
    const result = await request('/api/sync', {
      method: 'PUT',
      headers: meta.householdId ? { 'x-forq-household-id': meta.householdId } : {},
      body: JSON.stringify({ version: meta.version, deviceId: meta.deviceId, state: syncState(state) }),
    });
    // This device is now the canonical copy — the base for any future split.
    saveBaseState(state, result.version);
    return {
      meta: saveMetaIfNewer({ ...meta, version: result.version, syncedAt: Date.now() }),
      status: { kind: 'ready', message: 'All changes synced.' },
    };
  } catch (error) {
    if (queueOnFailure && error.status !== 409) saveQueue(state, meta);
    const isConflict = error.status === 409;
    return {
      meta,
      status: {
        kind: isConflict ? 'conflict' : (navigator.onLine ? 'error' : 'offline'),
        message: isConflict
          ? (error.body?.state
            ? 'Another device changed this list while you were offline — the household copy is on its way; overlapping edits need a pick.'
            : 'This household changed on another device. Export a backup, then reload to use the newer copy.')
          : (navigator.onLine ? error.message : 'Offline changes queued. They will sync automatically when you reconnect.'),
        // The current household copy, when the server sent it back with the 409.
        remoteState: isConflict ? error.body?.state || null : null,
        remoteVersion: isConflict ? Number(error.body?.version || 0) : 0,
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
    if (remote.version > meta.version && remote.state) {
      // The household copy is now canonical — the base for any future split.
      saveBaseState(remote.state, remote.version);
    }
    return {
      state: remote.version > meta.version ? remote.state : null,
      meta: saveMetaIfNewer({ ...meta, householdId: remote.householdId, version: remote.version, syncedAt: Date.now() }),
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

/** Invite someone by email. Returns { token, expiresInHours } — the token is
 * shown once; the server stores only its hash. */
export const createHouseholdInvitation = (input) => request('/api/households/invitations', {
  method: 'POST',
  headers: selectedHeaders(),
  body: JSON.stringify(input),
});

/** Accept an invitation with the signed-in account's matching email; on
 * success the household becomes this device's sync target, version 0, exactly
 * as a fresh pull would set it. */
export const acceptHouseholdInvitation = async (token) => {
  const result = await request('/api/households/invitations', {
    method: 'PATCH',
    headers: selectedHeaders(),
    body: JSON.stringify({ token }),
  });
  if (result?.householdId) saveMeta({ ...readMeta(), householdId: result.householdId, version: 0 });
  return result;
};

export function selectedCloudHouseholdId() {
  return readMeta().householdId || null;
}

export function forgetCloudHousehold() {
  localStorage.removeItem(META_KEY);
}
