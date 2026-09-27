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
 * Nothing here decides anything about the app's data. It is told when the
 * state changed, and it writes it.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  encryptHealth, healthSnapshot, HEALTH_VAULT_KEY, withoutHealth,
} from './health-vault.js';
import { parseBackup } from './store-persistence.js';
import { EMPTY_STATE, STORAGE_KEY, STATE_VERSION } from './state.js';

const KEY = STORAGE_KEY;

/**
 * Save the state to this device, and keep the encrypted health snapshot in
 * step with it. Returns the hook's `persist` so a caller that knows it is
 * leaving (rather than merely changed) can stamp the heartbeat itself.
 */
export const usePersistence = ({
  state, theme, accent, latest, demoRef, blockPersistence, setState, setStorageIssue,
  vaultKey, vaultSalt, vaultWrites, undoHistory, undoBatch,
}) => {
  // A state that came from another tab must not immediately be written back
  // out, or two tabs would ping-pong the same write forever.
  const applyingRemote = useRef(false);

  const persist = useCallback((next) => {
    try {
      const stored = next.healthVaultEnabled ? withoutHealth(next, EMPTY_STATE) : next;
      localStorage.setItem(KEY, JSON.stringify({
        ...stored,
        schemaVersion: STATE_VERSION,
        lastSeenAt: Date.now(),
      }));
      if (next.healthVaultEnabled && vaultKey.current && vaultSalt.current) {
        const snapshot = healthSnapshot(next);
        vaultWrites.current = vaultWrites.current
          .then(() => encryptHealth(snapshot, vaultKey.current, vaultSalt.current))
          .then((record) => localStorage.setItem(HEALTH_VAULT_KEY, JSON.stringify(record)))
          .catch((error) => setStorageIssue({
            kind: 'write',
            message: 'Your latest health changes could not be encrypted. Keep this tab open and export a backup.',
            detail: error instanceof Error ? error.message : String(error),
            raw: null,
          }));
      }
      setStorageIssue((current) => (current?.kind === 'write' ? null : current));
      return true;
    } catch (error) {
      setStorageIssue({
        kind: 'write',
        message: 'Your latest changes could not be saved. Export a backup before closing Forq.',
        detail: error instanceof Error ? error.message : String(error),
        raw: null,
      });
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

  // Another tab wrote the same device's storage. Adopt it, and drop the undo
  // history: those steps no longer describe the state on screen.
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== KEY || !event.newValue) return;
      try {
        applyingRemote.current = true;
        undoHistory.current = [];
        undoBatch.current = null;
        setState(parseBackup(event.newValue));
      } catch {
        // Ignore incomplete writes from another tab.
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [setState, undoHistory, undoBatch]);

  // Leaving is the most accurate moment to stamp, and there may be no render
  // left after it — so this one writes directly.
  useEffect(() => {
    const mark = () => {
      // A demo session must never reach storage, even on the way out.
      if (!blockPersistence.current && !demoRef.current) persist(latest.current);
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
