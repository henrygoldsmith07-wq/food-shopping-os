/**
 * Booting the app: which store wins, and what happens to the one that doesn't.
 *
 * The rule this file states once, so no call site has to re-derive it:
 *
 *   - IndexedDB holds a readable snapshot  → that is the app. Always. Even if
 *     localStorage still holds something, because a legacy copy can only be
 *     older than the record it was migrated into.
 *   - IndexedDB holds nothing, localStorage does → this is a legacy install.
 *     Read it, migrate it into IndexedDB, and only then drop the local copy.
 *     The drop is the last step: if migration fails, the old copy stays and the
 *     app runs on it, so nothing is ever lost to a failed upgrade.
 *   - Neither is readable                  → an empty kitchen, plus an issue
 *     the recovery screen can explain and hand back the raw text for.
 *
 * Everything here is async because IndexedDB is async. The store keeps a
 * synchronous first paint (the localStorage read, or empty) and adopts the
 * canonical snapshot as soon as it lands, so a slow disk costs a moment, not a
 * blank screen.
 */

import {
  clearPersistedState, clearPointer, idbSupported, readPointer, readSnapshot,
  writePointer, writeSnapshot,
} from './persistent-state.js';
import { EMPTY_STATE } from './state.js';
import { STORAGE_KEY, STATE_VERSION } from './state-versions.js';
import { futureVersionIssue, hydrate, applyBootLifecycle, isFutureVersion, parseBackup } from './store-persistence.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The raw text of a record we could not parse, for the recovery download. */
const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return null; // a cyclic record cannot be offered for download, and is not destroyed either
  }
};

/** Read the legacy localStorage copy. Never writes, never repairs. */
const readLegacyCopy = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { raw: null, state: null, issue: null };
    return { raw, state: parseBackup(raw), issue: null };
  } catch (error) {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage itself is gone */ }
    return {
      raw,
      state: null,
      // A record from a newer Forq already carries the right explanation.
      issue: error?.issue || {
        kind: raw ? 'corrupt' : 'unavailable',
        message: raw
          ? 'Forq could not read your saved data. It has not been overwritten.'
          : 'This browser is blocking local storage, so changes cannot be saved.',
        raw,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

const unavailable = (detail) => ({
  kind: 'unavailable',
  message: 'This browser cannot save Forq\'s full data here, so only a smaller local copy is being kept. Export a backup regularly.',
  raw: null,
  detail: detail ? String(detail) : null,
});

/** Everything the app needs to open, in the order the rules above describe. */
export const loadCanonicalState = async () => {
  // A browser without IndexedDB is not broken, just smaller. localStorage is
  // then the store, and the pointer records that so nothing claims otherwise.
  if (!idbSupported()) {
    const legacy = readLegacyCopy();
    return {
      state: legacy.state ? applyBootLifecycle(legacy.state) : { ...EMPTY_STATE },
      issue: legacy.issue,
      storage: 'localStorage',
      migrated: false,
    };
  }

  let record = null;
  try {
    record = await readSnapshot();
  } catch (error) {
    // The canonical store could not be opened at all. The legacy copy is still
    // perfectly readable, so the app runs from it rather than refusing to start.
    const legacy = readLegacyCopy();
    return {
      state: legacy.state ? applyBootLifecycle(legacy.state) : { ...EMPTY_STATE },
      issue: legacy.issue || unavailable(error?.message),
      storage: 'localStorage',
      migrated: false,
    };
  }

  if (record?.state) {
    // The canonical record wins outright. A legacy localStorage copy left
    // behind by an interrupted migration is dropped here, once, and only
    // because we can see the newer record it belongs to.
    const pointer = readPointer();
    if (pointer?.schemaVersion !== STATE_VERSION) {
      writePointer({ schemaVersion: STATE_VERSION, seq: record.seq ?? 0, savedAt: record.savedAt ?? null });
    }
    // A record from a newer Forq is read, never rewritten. It comes back as an
    // empty kitchen with a recovery screen in front of it, and the record
    // itself is left exactly as it was found.
    if (isFutureVersion(record.state)) {
      return {
        state: { ...EMPTY_STATE },
        issue: futureVersionIssue(record.state.schemaVersion),
        storage: 'indexedDB',
        migrated: false,
      };
    }
    try {
      return { state: applyBootLifecycle(record.state), issue: null, storage: 'indexedDB', migrated: false };
    } catch (error) {
      // A canonical record we cannot parse is still not destroyed. The raw
      // text goes back to whoever owns it.
      return {
        state: { ...EMPTY_STATE },
        issue: {
          kind: 'corrupt',
          message: 'Forq could not read its saved data. It has not been overwritten.',
          raw: safeStringify(record.state),
          detail: error instanceof Error ? error.message : String(error),
        },
        storage: 'indexedDB',
        migrated: false,
      };
    }
  }

  // No canonical record. A legacy install is a migration, not a preference.
  const legacy = readLegacyCopy();
  if (legacy.issue || !legacy.state) {
    return {
      state: { ...EMPTY_STATE },
      issue: legacy.issue,
      storage: legacy.state ? 'localStorage' : 'indexedDB',
      migrated: false,
    };
  }
  const state = applyBootLifecycle(legacy.state);
  try {
    const written = await writeSnapshot(state, { schemaVersion: STATE_VERSION });
    // The drop happens last, and only after the record is committed.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* blocked: harmless */ }
    writePointer({ schemaVersion: STATE_VERSION, seq: written.seq, savedAt: written.record?.savedAt ?? null, migratedAt: Date.now() });
    return { state, issue: null, storage: 'indexedDB', migrated: true };
  } catch (error) {
    // The upgrade failed. The old copy is untouched and stays the store.
    return { state, issue: unavailable(error?.message), storage: 'localStorage', migrated: false };
  }
};

/**
 * Reset: every layer this app owns, in every store it owns it in. Local keys
 * the app has written, the canonical record, and the pointer that describes it.
 */
export const wipeEverything = async (localKeys = [STORAGE_KEY]) => {
  for (const key of localKeys) {
    try { localStorage.removeItem(key); } catch { /* blocked: nothing to clear */ }
  }
  clearPointer();
  if (!idbSupported()) return;
  try {
    await clearPersistedState();
  } catch {
    // Nothing else can be done about an IndexedDB that will not clear; the
    // caller resets in memory regardless, and the next write replaces the
    // record rather than merging with it.
  }
};
