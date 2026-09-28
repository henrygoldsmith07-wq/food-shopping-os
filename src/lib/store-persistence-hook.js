/**
 * Saving the app to this device.
 *
 * Persistence is one concern with four moments — every write, another tab's
 * write, the moment you leave, and the theme the app is wearing — and none of
 * them belong among the store's domain actions. Keeping them here means the
 * rules live in one readable place: what is written, what is deliberately
 * *not* written (health data behind the vault), when a save is skipped, and
 * what happens when the browser refuses.
 *
 * The canonical store is IndexedDB (see `persistent-state.js`). localStorage
 * keeps a *small* pointer to it and a BroadcastChannel tells other tabs that
 * it changed — so localStorage is a signpost, never the state transport. A
 * browser without IndexedDB falls back to the localStorage copy, and says so
 * through the same issue channel rather than pretending.
 *
 * Nothing here decides anything about the app's data. It is told when the
 * state changed, and it writes it.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  encryptHealth, healthSnapshot, HEALTH_VAULT_KEY, withoutHealth,
} from './health-vault.js';
import { parseBackup } from './store-persistence.js';
import { EMPTY_STATE } from './state.js';
import { STORAGE_KEY, STATE_VERSION } from './state-versions.js';
import {
  announceState, idbSupported, openStateChannel, readSnapshot,
  writeHeartbeat, writePointer, writeSnapshot,
} from './persistent-state.js';
import { POINTER_KEY } from './persistent-state.js';

const KEY = STORAGE_KEY;

const writeError = (setStorageIssue, message, detail) => setStorageIssue({
  kind: 'write',
  message,
  detail: detail ? String(detail) : null,
  raw: null,
});

/**
 * Save the state to this device, and keep the encrypted health snapshot in
 * step with it. Returns the hook's `persist` so a caller that knows it is
 * leaving (rather than merely changed) can stamp the heartbeat itself.
 */
export const usePersistence = ({
  state, theme, accent, latest, demoRef, blockPersistence, setState, setStorageIssue,
  vaultKey, vaultSalt, vaultWrites, undoHistory, undoBatch, storage = 'localStorage',
}) => {
  // A state that came from another tab must not immediately be written back
  // out, or two tabs would ping-pong the same write forever.
  const applyingRemote = useRef(false);
  // Which store writes go to. Fixed for the tab's life: it is decided once at
  // boot, so a mid-session change can never split the app across two.
  const store = useRef(storage);
  store.current = storage;

  const persist = useCallback((next) => {
    const stored = next.healthVaultEnabled ? withoutHealth(next, EMPTY_STATE) : next;
    const payload = { ...stored, schemaVersion: STATE_VERSION, lastSeenAt: Date.now() };
    if (next.healthVaultEnabled && vaultKey.current && vaultSalt.current) {
      vaultWrites.current = vaultWrites.current
        .then(() => encryptHealth(healthSnapshot(next), vaultKey.current, vaultSalt.current))
        .then((record) => localStorage.setItem(HEALTH_VAULT_KEY, JSON.stringify(record)))
        .catch((error) => writeError(
          setStorageIssue,
          'Your latest health changes could not be encrypted. Keep this tab open and export a backup.',
          error?.message,
        ));
    }
    setStorageIssue((current) => (current?.kind === 'write' ? null : current));

    if (store.current === 'indexedDB' && idbSupported()) {
      // Asynchronous and transactional: no serialisation of the whole app on
      // the main thread, and no localStorage ceiling to hit.
      return writeSnapshot(payload, { schemaVersion: STATE_VERSION, savedAt: payload.lastSeenAt })
        .then((result) => {
          writePointer({ schemaVersion: STATE_VERSION, seq: result.latestSeq, savedAt: result.record?.savedAt ?? null });
          // A signal, not a payload: the other tab reads the canonical record.
          announceState({ seq: result.latestSeq });
          return true;
        })
        .catch((error) => {
          writeError(
            setStorageIssue,
            'Your latest changes could not be saved. Export a backup before closing Forq.',
            error?.message,
          );
          return false;
        });
    }

    // The fallback store. Still real, still honest about being the smaller one.
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      writeError(
        setStorageIssue,
        'Your latest changes could not be saved. Export a backup before closing Forq.',
        error?.message,
      );
      return false;
    }
  }, [setStorageIssue, vaultKey, vaultSalt, vaultWrites]);


  /* Every write stamps the moment the app was last in front of you, which is
     what the next visit measures "while you were away" from. It's written on
     the way out rather than held in state, so the heartbeat can't re-render
     every screen once a minute. */
  useEffect(() => {
    if (applyingRemote.current) {
      applyingRemote.current = false;
      return;
    }
    if (!blockPersistence.current) persist(state);
  }, [state, blockPersistence, persist]);

  // Another tab wrote this device's canonical store. Adopt it, and drop the
  // undo history: those steps no longer describe the state on screen. The
  // state is read from IndexedDB, never taken off the wire — localStorage is
  // not the transport here, it is only the fallback and a signpost.
  useEffect(() => {
    let cancelled = false;
    const adopt = async () => {
      try {
        const record = await readSnapshot();
        if (cancelled || !record?.state) return;
        applyingRemote.current = true;
        undoHistory.current = [];
        undoBatch.current = null;
        setState(parseBackup(record.state));
      } catch {
        // A half-finished write in another tab is not ours to interpret.
      }
    };
    const stopChannel = openStateChannel(() => { adopt(); });
    // Fallback for browsers without BroadcastChannel: the pointer key changing
    // is the same signal, just carried by the storage event.
    const onStorage = (event) => {
      if (event.key && event.key !== POINTER_KEY && event.key !== KEY) return;
      adopt();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      stopChannel();
      window.removeEventListener('storage', onStorage);
    };
  }, [setState, undoHistory, undoBatch]);

  // Leaving is the most accurate moment to stamp, and there may be no render
  // left after it — so the heartbeat is its own small record rather than a
  // full-state write on the way out of the page.
  useEffect(() => {
    const mark = () => {
      // A demo session must never reach storage, even on the way out.
      if (blockPersistence.current || demoRef.current) return;
      const at = Date.now();
      if (store.current === 'indexedDB' && idbSupported()) {
        writeHeartbeat(at).catch(() => { /* leaving: nobody left to tell */ });
        return;
      }
      persist({ ...latest.current, lastSeenAt: at });
    };

    const onHide = () => { if (document.visibilityState === 'hidden') mark(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', mark);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', mark);
    };
  }, [blockPersistence, demoRef, latest, persist]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
  }, [theme, accent]);

  return persist;
};
