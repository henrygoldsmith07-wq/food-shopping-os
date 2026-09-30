import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TARGETS } from '../data/nutrients.js';
import { guessAisle } from '../data/stores.js';
import { setMyRecipes } from '../data/recipes.js';
import { ensureFullCatalogue } from './catalogue-loader.js';
import {
  aisleFor, applyOffers, mergeItems, rememberAisle, routeFromTicks,
} from './shopping.js';
import { buildEntry, copyEntries } from './nutrition.js';
import { recipeFood } from './foodlog.js';
import { targetsFor } from './goals.js';
import { applyEntries, clearDates, LEFTOVER_CAT, leftoverEntry, moveMeal } from './mealplan.js';
import { deriveApp } from './derive.js';
import { consumePantryIngredients } from './kitchen.js';
import { healthActions, seedMeasurements } from './health-actions.js';
import { reminderActions } from './reminder-actions.js';
import { advancedActions, preferenceActions } from './preference-actions.js';
import { householdActions } from './household-actions.js';
import { smartActions } from './smart-actions.js';
import { DEFAULT_PERMISSIONS, householdPermission } from './household.js';
import { dueBetween, dueNow, reminderContext } from './reminders.js';
import { moveBefore } from './utils.js';
import {
  initialiseCloud, listConflictStatus, makeCloudStateAdopter, pullCloud, pushCloud, retryQueuedCloud, subscribeCloud,
} from './cloud.js';
import { startCloudRetryLoop } from './cloud-retry.js';
import { platformUnlockAvailable } from './health-vault.js';
import {
  applyBootLifecycle, hydrate, loadStoredState, parseBackup, serialiseBackup,
} from './store-persistence.js';
import { loadCanonicalState } from './persistence-boot.js';
import { idbSupported } from './persistent-state.js';
import { usePersistence } from './store-persistence-hook.js';
import { useStoreApi } from './store-api.js';
import { isUnderEighteen } from './youth.js';
import { readAnalyticsConsent, setAnalyticsConsent } from './product-analytics.js';
import { createExampleWeekState } from '../data/exampleWeek.js';

export { PHOTO_LIMIT } from './health-actions.js';

import {
  ACCENT_IDS, emojiFor, EMPTY_STATE, rolloverDay, STATE_VERSION, todayStamp, uid,
} from './state.js';

export {
  EMPTY_STATE, foodFromEntry, levelFromXp, rolloverDay, STATE_VERSION,
  STORAGE_KEY, todayStamp, XP_PER_LEVEL, xpIntoLevel,
} from './state.js';

// Catalogue-dependent lookups are re-exported here so the public surface of
// the store is unchanged by the move that took them off the boot path.
export { emojiFor, foodById, recentFoodsFrom } from './food-lookup.js';

export { applyBootLifecycle, hydrate, parseBackup, serialiseBackup };

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Boot in two beats, and the reason is the canonical store. IndexedDB is
  // asynchronous, so the first paint uses whatever can be read synchronously
  // (the legacy localStorage copy, or an empty kitchen) and the canonical
  // snapshot is adopted the moment it lands. That ordering means a slow disk
  // costs a moment rather than a blank screen, and a legacy install still opens
  // instantly while its data moves across.
  const initial = useRef(null);
  if (!initial.current) {
    const first = loadStoredState();
    // The synchronous issue is kept as well as the async one: unreadable data
    // must stop *writing* immediately, not once the canonical store has been
    // consulted, or the first keystroke would overwrite it.
    initial.current = { ...first, storage: 'localStorage' };
  }
  const [state, setState] = useState(initial.current.state);
  const [storageIssue, setStorageIssue] = useState(initial.current.issue);
  const [storage, setStorage] = useState(initial.current.storage);

  /* ---- Sandbox / demonstration kitchen --------------------------------
     While a demo session is open, every read comes from the demo copy and
     every write is routed into it — the whole app is clickable, but the
     real state object is never touched, so nothing persists, nothing syncs,
     and nothing the visitor does can overwrite an empty (or any) kitchen. */
  const [demo, setDemoState] = useState(null);
  const demoRef = useRef(null);
  const realUndoStack = useRef(null);
  // Set by the first real write. The canonical snapshot arrives asynchronously,
  // and adopting one that predates an edit the user has already made would be
  // a silent rollback.
  const editedSinceBoot = useRef(false);
  const [cloudStatus, setCloudStatus] = useState({ kind: 'checking', message: 'Checking cloud sync…' });
  const blockPersistence = useRef(initial.current.issue?.kind === 'corrupt');
  const cloudMeta = useRef(null);
  const cloudReady = useRef(false);
  const skipCloudPush = useRef(false);
  const cloudTimer = useRef(null);
  const cloudPulling = useRef(false);
  const cloudPullPending = useRef(false);
  const cloudInitialising = useRef(false);
  const liveConnection = useRef(false);
  const undoHistory = useRef([]);
  // While an import is in flight its writes share one undo step — reverting a
  // 12-trip CSV import should not take 12 presses of Ctrl+Z.
  const undoBatch = useRef(null);
  const vaultKey = useRef(null);
  const vaultSalt = useRef(null);
  const vaultWrites = useRef(Promise.resolve());
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  // Reminders are due at a time, not at a state change, so the clock has to
  // move on its own. A minute is finer than any reminder needs.
  const [tick, setTick] = useState(() => Date.now());
  // Where the catch-up starts: read once, so it doesn't slide as you look at it.
  const [seenFrom] = useState(() => state.lastSeenAt);

  // Stable across the provider's life: the api memoises on this identity.
  const routedSetState = useCallback((update) => {
    editedSinceBoot.current = true;
    if (demoRef.current) setDemoState(update);
    else setState(update);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return undefined;
    return startCloudRetryLoop({
      cloudInitialising, cloudMeta, cloudReady, retryQueuedCloud, setCloudStatus, liveConnection,
    });
  }, []);

  // The state as it stands right now, for code that runs after a render —
  // leaving the page, a sync reply, a debounced push.
  const latest = useRef(state);
  latest.current = demo ?? state;

  /* Saving to this device: every write, another tab's write, the moment you
     leave, and the theme. It is one concern with four moments, so it lives
     beside the store rather than inside it. */
  usePersistence({
    state, theme: state.theme, accent: state.accent, latest, demoRef,
    blockPersistence, setState, setStorageIssue, storage,
    vaultKey, vaultSalt, vaultWrites, undoHistory, undoBatch,
  });

  /* The canonical store is IndexedDB, and it is asynchronous. The first paint
     above used the synchronous copy so the app is never blank; this adopts the
     real one and, for a legacy install, is also the migration. Guarded so an
     edit made in the first few milliseconds is not thrown away by a snapshot
     that predates it.

     Skipped entirely when there is no IndexedDB: the synchronous read above
     already *is* the answer then, so the async pass would only re-read the same
     localStorage copy and write the same state back. */
  useEffect(() => {
    if (!idbSupported()) return undefined;
    let cancelled = false;
    loadCanonicalState().then((result) => {
      if (cancelled) return;
      setStorage(result.storage);
      if (result.issue) setStorageIssue(result.issue);
      if (editedSinceBoot.current) return; // the user got there first
      setState(result.state);
    }, () => { /* a boot that cannot read keeps the first paint it already has */ });
    return () => { cancelled = true; };
  }, [setState, setStorage, setStorageIssue]);

  // A losing push — or a pull carrying a newer household copy — gets folded
  // in by the whole-state adopter: rows both sides changed wait for a person,
  // not a last writer, and independent edits coexist.
  const adoptHouseholdCopy = makeCloudStateAdopter({
    latest, cloudMeta, skipCloudPush,
    setState: (next) => routedSetState(hydrate(next)),
  });

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return undefined;
    let cancelled = false;
    let poll;
    let unsubscribeRealtime;
    const pullNewerState = async (fromLiveEvent = false) => {
      if (!cloudMeta.current) return;
      if (cloudPulling.current) {
        cloudPullPending.current = true;
        return;
      }
      cloudPulling.current = true;
      try {
        const requestedVersion = Number(cloudMeta.current.version || 0);
        const update = await pullCloud(cloudMeta.current);
        if (cancelled) return;
        const currentVersion = Number(cloudMeta.current?.version || 0);
        const remoteVersion = Number(update.meta?.version || 0);
        if (currentVersion > requestedVersion && remoteVersion <= currentVersion) return;
        if (update.state) {
          cloudMeta.current = update.meta;
          // Fold the household copy in rather than replacing this device's
          // state wholesale — unsynced local edits used to vanish here.
          adoptHouseholdCopy(hydrate(update.state), remoteVersion);
          if (liveConnection.current && update.status.kind === 'ready') {
            setCloudStatus({
              kind: 'live',
              message: fromLiveEvent ? 'Updated from your household.' : 'Live household sync connected.',
            });
          } else if (!fromLiveEvent) {
            setCloudStatus((current) => current.kind === 'reconnecting' ? current : update.status);
          }
        } else if (!fromLiveEvent && update.status.kind === 'ready') {
          setCloudStatus(liveConnection.current
            ? { kind: 'live', message: 'Live household sync connected.' }
            : { kind: 'ready', message: 'Household is up to date.' });
        } else if (update.status.kind !== 'ready' && (!fromLiveEvent || !liveConnection.current)) {
          setCloudStatus((current) => current.kind === 'reconnecting'
            ? current
            : { kind: 'reconnecting', message: update.status.message || 'Live sync paused. Reconnectingâ€¦' });
        }
      } finally {
        cloudPulling.current = false;
        if (!cancelled && cloudPullPending.current) {
          cloudPullPending.current = false;
          pullNewerState(true);
        }
      }
    };
    const refreshCloud = () => {
      setCloudStatus({ kind: 'connecting', message: 'Checking household changesâ€¦' });
      if (cloudMeta.current) pullNewerState();
      else loadCloud();
    };
    window.addEventListener('forq-cloud-refresh', refreshCloud);
    const loadCloud = async () => {
      if (cloudInitialising.current) return;
      cloudInitialising.current = true;
      try {
        const result = await initialiseCloud(latest.current);
        if (cancelled) return;
        let status = result.status;
        let meta = result.meta || null;
        let remoteState = result.state;
        if (result.state && result.meta) {
          const localChanged = JSON.stringify(latest.current) !== JSON.stringify(initial.current.state);
          if (localChanged) {
            if (Number.isInteger(result.baseVersion)) {
              const localPush = await pushCloud(
                latest.current,
                { ...result.meta, version: result.baseVersion },
              );
              if (localPush.status.kind === 'conflict' && localPush.status.remoteState) {
                // Fold the household copy in (the 409 carries it) instead of
                // asking for a reload that would drop the local edits.
                const applied = adoptHouseholdCopy(hydrate(localPush.status.remoteState), localPush.status.remoteVersion);
                if (applied) {
                  meta = cloudMeta.current;
                  status = listConflictStatus(applied, 'Your offline changes merged with the household.');
                } else {
                  meta = result.meta;
                  status = localPush.status;
                }
                remoteState = null;
              } else {
                meta = localPush.status.kind === 'conflict' ? result.meta : localPush.meta;
                status = localPush.status.kind === 'ready'
                  ? { kind: 'ready', message: 'Your offline changes are synced.' }
                  : localPush.status;
              }
            } else {
              status = {
                kind: 'conflict',
                message: 'Cloud data was found after offline edits. Your local changes were kept; export a backup before reconciling.',
              };
            }
            remoteState = null;
          }
        }
        cloudMeta.current = meta;
        cloudReady.current = status.kind === 'ready';
        setCloudStatus((current) => {
          if (status.kind !== 'ready') return status;
          if (liveConnection.current) return { kind: 'live', message: 'Live household sync connected.' };
          return current.kind === 'reconnecting' ? current : status;
        });
        if (remoteState) {
          skipCloudPush.current = true;
          setState(hydrate(remoteState));
        }
        if (meta && status.kind === 'ready') {
        poll = setInterval(pullNewerState, 60000);
          subscribeCloud(meta, (event) => {
            if (event.deviceId === meta.deviceId) return;
          if (Number(event.version) <= Number(cloudMeta.current?.version || 0)) return;
          pullNewerState(true);
        }, (nextStatus) => {
          if (nextStatus.kind === 'connected') {
            liveConnection.current = true;
            setCloudStatus({ kind: 'live', message: nextStatus.message });
          } else if (nextStatus.kind === 'reconnecting' || nextStatus.kind === 'connecting') {
            liveConnection.current = false;
            setCloudStatus({ kind: 'reconnecting', message: nextStatus.message });
          }
        }).then((unsubscribe) => {
          if (cancelled) unsubscribe();
          else unsubscribeRealtime = unsubscribe;
        }).catch(() => {
          liveConnection.current = false;
          setCloudStatus({ kind: 'reconnecting', message: 'Cloud sync ready. Reconnecting live updates…' });
        });
        }
      } finally {
        cloudInitialising.current = false;
      }
    };
    loadCloud();
    return () => {
      cancelled = true;
      liveConnection.current = false;
      clearInterval(poll);
      unsubscribeRealtime?.();
      window.removeEventListener('forq-cloud-refresh', refreshCloud);
    };
  }, []);

  useEffect(() => {
    if (!cloudReady.current || !cloudMeta.current) return;
    // Demo mutations never belong in household sync.
    if (demoRef.current || skipCloudPush.current) {
      skipCloudPush.current = false;
      return;
    }
    clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(async () => {
      const requestedVersion = Number(cloudMeta.current?.version || 0);
      const result = await pushCloud({
        ...latest.current,
        ...(latest.current.healthVaultEnabled && !vaultKey.current ? { __preserveHealth: true } : {}),
      }, cloudMeta.current);
      const currentVersion = Number(cloudMeta.current?.version || 0);
      if (Number(result.meta?.version || 0) >= currentVersion || currentVersion <= requestedVersion) {
        cloudMeta.current = result.meta;
      }
      let status = result.status;
      if (status.kind === 'conflict' && status.remoteState) {
        const applied = adoptHouseholdCopy(hydrate(status.remoteState), status.remoteVersion);
        if (applied) status = listConflictStatus(applied, 'Household changes merged with yours.');
      }
      if (status.kind !== 'ready') cloudReady.current = false;
      setCloudStatus((current) => {
        if (status.kind !== 'ready') return status;
        if (liveConnection.current) return { kind: 'live', message: 'Live household sync connected.' };
        return current.kind === 'reconnecting' ? current : status;
      });
    }, 750);
    return () => clearTimeout(cloudTimer.current);
  }, [state]);

  /* Under 18 the product-insights answer is "no" and stays "no". Hiding the
     toggle isn't enough — a consent granted before a birthday, or restored
     from a backup, is revoked here rather than quietly honoured. */
  useEffect(() => {
    if (isUnderEighteen(state) && readAnalyticsConsent()) setAnalyticsConsent(false);
  }, [state.body?.age]);

  // Your recipes join the book's lookup, so a plan slot or a cook history entry
  // pointing at one of yours resolves like any other dish.
  setMyRecipes(state.myRecipes);

  const api = useStoreApi({
    blockPersistence, cloudStatus, latest, setState: routedSetState, setStorageIssue, storageIssue,
    undoHistory, undoBatch, vaultKey, vaultSalt, vaultWrites, setVaultUnlocked,
  });

  /* An import records one undo step for all its writes. Begin/end go through
     the same state queue as the writes themselves, so they run in order even
     though React defers every updater: begin opens the batch, the writes
     checkpoint against it, end promotes the checkpoint to one undo step. */
  const beginImportBatch = useCallback(() => {
    routedSetState((s) => {
      undoBatch.current = 'open';
      return s;
    });
  }, [routedSetState]);
  const endImportBatch = useCallback(() => {
    routedSetState((s) => {
      const checkpoint = undoBatch.current;
      undoBatch.current = null;
      // The pre-import state becomes exactly one undo step — but only if the
      // import actually wrote something.
      if (checkpoint && checkpoint !== 'open') {
        undoHistory.current = [...undoHistory.current.slice(-29), checkpoint];
      }
      return s;
    });
  }, [routedSetState, undoHistory]);

  /* Everything below is derived — the app never stores a number twice. */
  const effectiveState = demo ?? state;
  // The eager tier of the book ships in the first paint and is what planning,
  // the shopping list, cooking and logging run on offline from the first
  // second. The long tail is a local module fetch; when it lands it appends to
  // the same live arrays, so the derived view is recomputed once to pick the
  // extra rows up. A failed load leaves the eager book in place — a partial
  // book must never look like a broken app.
  const [catalogueComplete, setCatalogueComplete] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureFullCatalogue().then(
      () => { if (!cancelled) setCatalogueComplete(true); },
      () => { if (!cancelled) setCatalogueComplete(false); },
    );
    return () => { cancelled = true; };
  }, []);
  const derived = useMemo(
    () => deriveApp(effectiveState),
    // deriveApp is a pure function of the state; catalogueComplete is the one
    // extra input, and it only ever changes once, when the long tail lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveState, catalogueComplete],
  );

  /* Reminders answer to the clock as well as to your data, so they're derived
     against the tick rather than only against state changes. */
  const alerts = useMemo(() => {
    const now = new Date(tick);
    const due = dueNow(effectiveState.reminders, { now, done: effectiveState.reminderDone });
    return {
      remindersDue: due,
      // What came due while the app was shut. It can't notify you then — no
      // server to wake it — so the least it can do is not pretend otherwise.
      remindersMissed: dueBetween(effectiveState.reminders, seenFrom, tick, effectiveState.reminderDone)
        .filter((m) => !due.some((d) => d.reminder.id === m.reminder.id && d.stamp === m.stamp && d.time === m.time)),
      now,
    };
  }, [effectiveState.reminders, effectiveState.reminderDone, seenFrom, tick]);

  const enterDemoMode = useCallback(() => {
    const demoSession = createExampleWeekState(todayStamp());
    demoRef.current = demoSession;
    // Undo history is a stack of real states; a demo undo must never pop one
    // back into the sandbox (or a demo state back into the real app).
    realUndoStack.current = undoHistory.current;
    undoHistory.current = [];
    setDemoState(demoSession);
  }, [undoHistory]);

  const exitDemoMode = useCallback(() => {
    demoRef.current = null;
    undoHistory.current = realUndoStack.current ?? [];
    realUndoStack.current = null;
    undoBatch.current = null;
    setDemoState(null);
  }, [undoHistory]);

  const value = useMemo(() => ({
    ...effectiveState,
    ...derived,
    ...alerts,
    isDemoMode: Boolean(demo),
    enterDemoMode,
    exitDemoMode,
    beginImportBatch,
    endImportBatch,
    reminderLine: (kind) => reminderContext(kind, { ...effectiveState, ...derived }),
    healthVault: {
      enabled: state.healthVaultEnabled,
      unlocked: vaultUnlocked,
      platformAvailable: platformUnlockAvailable(),
    },
    ...api,
  }), [effectiveState, state.healthVaultEnabled, derived, alerts, api, vaultUnlocked, enterDemoMode, exitDemoMode]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
};

export const useOptionalApp = () => useContext(AppContext);
