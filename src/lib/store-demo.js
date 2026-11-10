import { useCallback } from 'react';
import { buildDemoAdoptionPatch, createExampleWeekState } from '../data/exampleWeek.js';
import { recordProductEvent, setDemoAnalyticsSuppressed } from './product-analytics.js';
import { todayStamp } from './state.js';
import { weekDates } from './kitchen.js';
import { shoppingForWeekLoop } from './week-loop.js';

/**
 * Sandbox / demonstration kitchen.
 *
 * While a demo session is open, every read comes from the demo copy and
 * every write is routed into it — the whole app is clickable, but the real
 * state object is never touched, so nothing persists, nothing syncs, and
 * nothing the visitor does can overwrite an empty (or any) kitchen.
 *
 * Lives beside the store rather than inside it so `store.jsx` stays within
 * the 500-line module boundary the merge-conflict tripwires enforce. The
 * callbacks are identical to the ones that used to live in the provider;
 * only their address changed.
 */
export function useDemoKitchen({
  demoRef, realUndoStack, undoHistory, undoBatch, editedSinceBoot,
  setDemoState, state, api, beginImportBatch, endImportBatch,
}) {
  const enterDemoMode = useCallback(() => {
    const demoSession = createExampleWeekState(todayStamp());
    demoRef.current = demoSession;
    // Undo history is a stack of real states; a demo undo must never pop one
    // back into the sandbox (or a demo state back into the real app).
    realUndoStack.current = undoHistory.current;
    undoHistory.current = [];
    // The sandbox never counts toward analytics — suppress recording for the
    // whole session, not per call site.
    setDemoAnalyticsSuppressed(true);
    setDemoState(demoSession);
    // demoRef, realUndoStack, undoBatch and setDemoState are held for the
    // demo session's whole lifetime (refs and a useState setter), so the
    // exhaustive-deps omission is sound — listing it keeps lint honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoHistory]);

  const exitDemoMode = useCallback(() => {
    demoRef.current = null;
    undoHistory.current = realUndoStack.current ?? [];
    realUndoStack.current = null;
    undoBatch.current = null;
    setDemoAnalyticsSuppressed(false);
    setDemoState(null);
    // Same as enterDemoMode: the omitted deps are stable refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoHistory]);

  /* Adopt the demo week as the real kitchen: the dinner rotation is rebased
     onto this week, pantry staples merge in without touching real rows, and
     demo-only flags/receipts stay behind (see buildDemoAdoptionPatch). The
     demo snapshot is captured first, the sandbox is exited (restoring the
     real undo stack and analytics), and the patch lands on the real state —
     so one Ctrl+Z reverts the adoption. Returns false when no demo is open. */
  const adoptDemoWeek = useCallback(() => {
    const snap = demoRef.current;
    if (!snap) return false;
    const day = todayStamp();
    const patch = buildDemoAdoptionPatch(snap, state, day);
    const adopted = {
      // Dinners the demo actually added — dates the household already planned
      // keep their meal and are not counted as adopted.
      dinners: Math.max(0, Object.keys(patch.plan || {}).length - Number(patch.adoptedFromDemo?.keptMeals || 0)),
      staples: Math.max(0, patch.pantry.length - (state.pantry || []).length),
    };
    // The list the adopted week needs, from the same hand-off every other
    // Plan → List step commits (WeekLoop's generate runs this, then
    // addToList): pantry- and leftover-aware, waste-learned, portion-scaled.
    // Computed up front from the merged kitchen because nothing below may
    // read the demo sandbox once it closes.
    const { items: need } = shoppingForWeekLoop({ ...state, ...patch }, weekDates(day));
    exitDemoMode();
    // Everything below goes through the store-api verbs, never raw setState:
    // routedSetState now targets the real kitchen, `set` re-runs the usual
    // plan→list derivation, and the import batch folds plan + list into the
    // single undo step the receipt's Undo button promises. addToList dedupes
    // by name, so an existing household keeps its checked rows, hand
    // quantities and hand-added rows while a fresh kitchen gets the full
    // generated list — the reconciler alone could never seed an empty one.
    beginImportBatch();
    api.set({ ...patch });
    if (need.length) api.addToList(need);
    endImportBatch();
    editedSinceBoot.current = true;
    // The sandbox promised the demo never counts — and this event fires after
    // suppression lifts, so the adoption itself is the first measurable act.
    // Coarse only: dinner count + staples adopted, never names or prices.
    recordProductEvent('demo_adopted', {
      source: 'demo', mealCount: adopted.dinners, count: adopted.staples,
    }, undefined, { ...state, ...patch });
    return true;
    // demoRef, editedSinceBoot, setDemoState and undoBatch are refs/setters
    // held across the session — the deliberate exhaustive-deps omission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, exitDemoMode, api, beginImportBatch, endImportBatch]);

  return { enterDemoMode, exitDemoMode, adoptDemoWeek };
}
