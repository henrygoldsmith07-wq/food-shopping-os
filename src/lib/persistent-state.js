/**
 * This device's canonical store.
 *
 * Forq's state is large, structured and written on almost every interaction.
 * Writing that to localStorage on each change is a synchronous, main-thread
 * serialisation of the whole app — and localStorage's ceiling is a few
 * megabytes. IndexedDB is the right home for it: asynchronous, transactional,
 * and large. So the arrangement is:
 *
 *   IndexedDB      the canonical full-state snapshot. One record, one writer.
 *   localStorage   a *small* pointer plus the legacy full-state copy that only
 *                  exists until a legacy install has been migrated. It also
 *                  carries the health vault and the cloud metadata, which are
 *                  deliberately separate concerns.
 *
 * Three properties this file exists to guarantee:
 *
 *  1. **No stale overwrite.** Every write carries a monotonic `seq`. A slower
 *     write that began earlier finishes later; the transaction re-reads the
 *     stored record and refuses to put anything that is not newer. Without
 *     that, a burst of edits could land out of order and the app would come
 *     back to a state the user had already moved past.
 *  2. **Nothing is destroyed on the way in.** Reads never write. A record that
 *     cannot be parsed is handed back with its raw text so the recovery screen
 *     can offer it for download.
 *  3. **Cross-tab without a transport.** A `BroadcastChannel` carries only the
 *     fact that state changed — never the state. Each tab then reads the
 *     canonical record itself, so localStorage is never the thing two tabs are
 *     fighting over.
 *
 * When IndexedDB is missing (private mode, an old browser, a test environment)
 * every function here reports that honestly and the caller falls back to
 * localStorage, which is why the store treats the two as one interface.
 */

/** The database and store names. Version 1 holds the snapshot + heartbeat. */
const DB_NAME = 'forq-local';
const DB_VERSION = 1;
const STORE = 'state';
const SNAPSHOT = 'snapshot';
const HEARTBEAT = 'heartbeat';

/** The channel another tab hears about a write on. Carries a signal, not data. */
const CHANNEL = 'forq-state-sync';

/**
 * The one small localStorage key that describes the canonical store: which
 * schema it holds and when this device last migrated into it. Deliberately
 * tiny — it is bootstrap metadata, not a second copy of the state.
 */
export const POINTER_KEY = 'forq-state-pointer-v1';

/** True when this browser can actually give us IndexedDB. */
export const idbSupported = () => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false; // some browsers throw on property access under strict policy
  }
};

/* ---- database handle -------------------------------------------------- */

let dbPromise = null;

const forgetDatabase = () => { dbPromise = null; };

/** Open (and cache) the database. Rejects rather than hanging on a blocked open. */
export const openForqDatabase = () => {
  if (!idbSupported()) return Promise.reject(new Error('IndexedDB is not available'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      // Another tab asking for a newer schema must not be blocked forever.
      const db = request.result;
      db.onversionchange = () => { db.close(); forgetDatabase(); };
      resolve(db);
    };
    request.onerror = () => {
      forgetDatabase();
      reject(request.error || new Error('IndexedDB could not be opened'));
    };
    request.onblocked = () => {
      forgetDatabase();
      reject(new Error('IndexedDB open is blocked by another tab'));
    };
  }).catch((error) => {
    forgetDatabase();
    throw error;
  });
  return dbPromise;
};

/* ---- request / transaction plumbing ----------------------------------- */

const resultOf = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const completed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction was aborted'));
});


/* ---- monotonic write sequence ---------------------------------------- */

/**
 * The highest sequence this tab has issued. A module-level counter, not a
 * timestamp: two writes in the same millisecond must still be orderable.
 */
let sequence = 0;

const issueSequence = () => (sequence += 1);

const adoptSequence = (value) => {
  const seen = Number(value);
  if (Number.isFinite(seen) && seen > sequence) sequence = seen;
};

/* ---- reads ------------------------------------------------------------ */

/** The stored snapshot record, or null. Never writes; never repairs. */
export const readSnapshot = async () => {
  const db = await openForqDatabase();
  const record = await resultOf(db.transaction(STORE, 'readonly').objectStore(STORE).get(SNAPSHOT));
  adoptSequence(record?.seq);
  return record ?? null;
};

/** When the app was last in front of the user, as recorded on the way out. */
export const readHeartbeat = async () => {
  const db = await openForqDatabase();
  const record = await resultOf(db.transaction(STORE, 'readonly').objectStore(STORE).get(HEARTBEAT));
  return record?.at ?? null;
};

/* ---- writes ----------------------------------------------------------- */

/**
 * Write the canonical snapshot.
 *
 * Resolves with the record now in the database. A write older than what is
 * already stored is refused — the newer state is kept, and the result says so
 * (`saved: false`) so the caller can tell "stored" from "superseded".
 */
export const writeSnapshot = async (state, meta = {}) => {
  const db = await openForqDatabase();
  const seq = issueSequence();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  // Read and write inside one transaction: the read is what makes the
  // ordering check atomic against any other writer.
  const existing = await resultOf(store.get(SNAPSHOT));
  const existingSeq = Number(existing?.seq) || 0;
  if (existingSeq > seq) {
    adoptSequence(existingSeq);
    // Abandon the transaction rather than committing a no-op write.
    try { tx.abort(); } catch { /* already finished */ }
    return { record: existing, saved: false, seq, latestSeq: existingSeq };
  }
  const record = {
    key: SNAPSHOT,
    seq,
    schemaVersion: meta.schemaVersion ?? state?.schemaVersion ?? null,
    savedAt: meta.savedAt ?? Date.now(),
    state,
  };
  store.put(record);
  await completed(tx);
  return { record, saved: true, seq, latestSeq: seq };
};

/**
 * Stamp the moment the app was last open. Deliberately its own tiny record:
 * the "while you were away" calculation should never drag the whole state
 * through a serialiser on the way out of the page.
 */
export const writeHeartbeat = async (at) => {
  const db = await openForqDatabase();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ key: HEARTBEAT, at });
  await completed(tx);
  return at;
};

/** Wipe every record this store owns. Used by reset. */
export const clearPersistedState = async () => {
  const db = await openForqDatabase();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await completed(tx);
  sequence = 0;
};


/* ---- the small localStorage pointer ----------------------------------- */

export const readPointer = () => {
  try {
    return JSON.parse(localStorage.getItem(POINTER_KEY) || 'null');
  } catch {
    return null; // an unreadable pointer is metadata, not data
  }
};

export const writePointer = (pointer) => {
  try {
    localStorage.setItem(POINTER_KEY, JSON.stringify(pointer));
  } catch {
    // The pointer is a convenience; IndexedDB is the store that matters.
  }
};

export const clearPointer = () => {
  try {
    localStorage.removeItem(POINTER_KEY);
  } catch {
    // A storage-blocked browser has no pointer to clear.
  }
};

/* ---- cross-tab signal -------------------------------------------------- */

let channel = null;

/**
 * Listen for "another tab saved". The payload is a signal only — the state is
 * read from the canonical store, so two tabs never pass a payload back and
 * forth. Returns an unsubscribe function; a browser without
 * BroadcastChannel gets a no-op, and the caller falls back to the storage
 * event on the pointer key.
 */
export const openStateChannel = (onSignal) => {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  let open;
  try {
    open = new BroadcastChannel(CHANNEL);
  } catch {
    return () => {};
  }
  const handler = (event) => {
    if (event?.data?.type === 'state') onSignal(event.data);
  };
  open.addEventListener('message', handler);
  return () => {
    try {
      open.removeEventListener('message', handler);
      open.close();
    } catch { /* already closed */ }
  };
};

/** Tell other tabs that the canonical record has changed. */
export const announceState = (signal) => {
  try {
    channel?.postMessage({ type: 'state', ...signal });
  } catch {
    // A closed channel means the tab is on its way out.
  }
};

/**
 * Bind the channel this tab writes on. Split from `openStateChannel` so a tab
 * that only writes never installs a listener for its own message.
 */
export const createStateChannel = () => {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
};

/** Drop the cached handles. Tests and a hard reset need a clean slate. */
export const resetStoreHandles = () => {
  try { channel?.close(); } catch { /* nothing open */ }
  channel = null;
  forgetDatabase();
  sequence = 0;
};
