/**
 * Whole-state three-way merge for shared household state.
 *
 * The shopping list (household-concurrency.js) is one of the collections a
 * household edits together. The same base-aware merge covers the pantry and
 * the meal plan row by row, treats hard preference lines as sets, and lets
 * every other key keep the one rule that is always honest: the side that
 * changed it since the base wins, and a key changed differently on both
 * sides keeps this device's copy until the next push makes it the shared
 * truth. The mechanics live in state-merge.js; this module is the policy —
 * which state key merges by which rule.
 */

import { LIST_FP_FIELDS, baseListFingerprint, listConflictFor } from './household-concurrency.js';
import {
  fieldsFingerprint, threeWayMap, threeWayRecords, threeWayRows, threeWaySets, valueFingerprint,
} from './state-merge.js';
import { mergePantryQuantities, quantityCanMerge } from './pantry-intelligence.js';

/** The pantry fields a sync comparison cares about (confidence timestamps
 * change on every touch and never make a row look edited). */
export const PANTRY_FP_FIELDS = ['name', 'qty', 'unit', 'cat', 'location', 'expiry', 'note', 'low'];

/** The meal-plan fields a sync comparison cares about. */
export const PLAN_FP_FIELDS = ['recipeId'];

/** Two contested pantry rows merge when their amounts are measurable. */
const mergePantryContested = (mine, theirs, contested) => {
  if (contested.length !== 1 || contested[0] !== 'qty') return null;
  const ingredient = mine.ingredientKey || mine.name;
  if (!quantityCanMerge(mine.qty, theirs.qty, ingredient)) return null;
  try {
    const merged = mergePantryQuantities(mine.qty, theirs.qty, { ingredient });
    if (!merged) return null;
    return { ...mine, qty: merged, merged: true, amountConfidence: 'approximate' };
  } catch {
    return null;
  }
};

/** Arrays of primitives that are hard lines or simple selections. */
const SET_KEYS = [
  'allergies', 'intolerances', 'religious', 'cuisines', 'equipment', 'diets',
  'modes', 'enabledTools', 'favourites', 'favouriteFoods', 'dismissedSetupSteps',
  'starterRecipeIds',
];

/** Plain objects keyed by an id (ratings, learned aliases, per-item settings). */
const MAP_KEYS = [
  'tasteRatings', 'recipeRatings', 'aliasMemory', 'aisleMemory', 'storeRoutes',
  'reminderDone', 'skipReasonProfile', 'adventureCompleted', 'units', 'targets',
  'body', 'shoppingMeta', 'shoppingPreferences', 'priceAlertConfig',
  'awayKitchenProfile',
];

/** Arrays of records appended from real events (facts — never invented). */
const RECORD_KEYS = [
  'myRecipes', 'customFoods', 'shops', 'cooked', 'waste', 'leftovers',
  'pantryEvents', 'mealPlanEvents', 'householdLedger', 'ledgerArchive', 'chores',
  'householdEvents', 'reminders', 'placeReminders', 'offers', 'coupons',
  'priceAlerts', 'predictionCorrections', 'predictionSnapshots', 'shoppingPredictions',
  'quantityOverrides', 'basketPredictions', 'autopilotOutcomes', 'planSimulations',
  'measurements', 'vitals', 'sleep', 'stress', 'cycles', 'workouts', 'bloods',
  'glucose', 'photos', 'cookingTimeHistory', 'preferenceEvents', 'calendarBusy',
  'recipeCollections', 'recipeFolders', 'mealTemplates', 'favouriteShopping',
];

/**
 * A stable snapshot of what this device last agreed with the household: one
 * fingerprint per state key, saved only on confirmed syncs. It is small
 * enough to live beside the state itself and is best-effort — without it the
 * merge stays conservative (differences become conflicts, never losses).
 */
export const baseStateSnapshot = (state = {}, version = 0) => ({
  version: Number(version || 0) || 0,
  savedAt: Date.now(),
  keys: Object.fromEntries(
    Object.entries(state)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, valueFingerprint(value)]),
  ),
});

const baseValue = (base, key) => {
  const fp = base?.keys?.[key];
  if (fp === undefined) return undefined;
  try {
    return JSON.parse(fp);
  } catch {
    return undefined;
  }
};

/** Flatten the meal plan to rows keyed `date|slot` for a row-level merge. */
const planRows = (plan = {}) => Object.entries(plan).flatMap(([date, day]) =>
  Object.entries(day || {}).map(([slot, recipeId]) => ({
    id: `${date}|${slot}`, date, slot, recipeId,
  })));

const planFromRows = (rows = []) => {
  const plan = {};
  for (const row of rows) {
    if (!row.recipeId) continue;
    plan[row.date] = plan[row.date] || {};
    plan[row.date][row.slot] = row.recipeId;
  }
  return plan;
};

const planConflictFor = (fight) => {
  const { mine, theirs } = fight;
  return {
    id: `plc_${fight.key}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'plan',
    status: 'open',
    date: mine.date,
    slot: mine.slot,
    name: `${mine.date} ${mine.slot}`,
    mine: { recipeId: mine.recipeId },
    theirs: { recipeId: theirs.recipeId },
    createdAt: Date.now(),
  };
};

const pantryConflictFor = (fight) => {
  const { mine, theirs, key } = fight;
  return {
    id: `pc_${key}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'divergence',
    status: 'open',
    ingredientKey: mine.ingredientKey || key,
    itemIds: [...new Set([mine.id, theirs.id].filter(Boolean))],
    itemNames: [...new Set([mine.name, theirs.name].filter(Boolean))],
    title: `Check ${mine.name || theirs.name || 'pantry item'}`,
    reason: 'Two devices changed this pantry item differently '
      + `(${mine.qty || 'amount unknown'} and ${theirs.qty || 'amount unknown'}).`,
    action: 'Merge the amounts, keep both, or keep this device\u2019s copy.',
    mine,
    theirs,
    createdAt: Date.now(),
  };
};

/**
 * Three-way merge of the whole shared household state.
 *
 * Returns `{ state, conflicts, counts }` where `state` is the next state,
 * `conflicts` carries the rows that need a human, and `counts` says how many
 * fights each collection raised. Pure — the caller commits.
 */
export const mergeSharedState = (localState = {}, remoteState = {}, base = null) => {
  const local = localState || {};
  const remote = remoteState || {};
  const state = { ...local };
  const conflicts = { list: [], pantry: [], plan: [] };
  const baseKeys = base?.keys || {};

  // 1. The shopping list: rows parked in an open conflict stay parked.
  const openList = (local.listConflicts || []).filter((entry) => entry.status !== 'resolved');
  const listBase = baseValue(base, 'shoppingList');
  const listMerge = threeWayRows(local.shoppingList || [], remote.shoppingList || [], baseListFingerprint(listBase || []), {
    fields: LIST_FP_FIELDS,
    keyOf: (row) => row.id,
    keepOnFight: 'none',
    parked: new Set(openList.map((entry) => entry.itemId)),
  });
  state.shoppingList = listMerge.rows;
  conflicts.list = listMerge.fights
    .filter((fight) => !openList.some((entry) => entry.itemId === fight.key))
    .map((fight) => listConflictFor(fight, local.shoppingList || []));

  // 2. The pantry: measurable contested amounts merge; the rest keep this
  //    device's row in place while both copies wait for a decision.
  const openPantry = (local.pantryConflicts || []).filter((entry) => entry.status !== 'resolved');
  const pantryBase = baseValue(base, 'pantry') || [];
  const pantryMerge = threeWayRows(local.pantry || [], remote.pantry || [], baseListFingerprintAs(pantryBase, PANTRY_FP_FIELDS), {
    fields: PANTRY_FP_FIELDS,
    keyOf: (row) => row.id,
    keepOnFight: 'mine',
    resolveContested: mergePantryContested,
  });
  state.pantry = pantryMerge.rows;
  conflicts.pantry = pantryMerge.fights
    .filter((fight) => !openPantry.some((entry) => (entry.itemIds || []).includes(fight.key)))
    .map(pantryConflictFor);

  // 3. The meal plan: slots are rows; independent days always coexist.
  const openPlan = (local.planConflicts || []).filter((entry) => entry.status !== 'resolved');
  const planBase = baseValue(base, 'plan') || {};
  const planMerge = threeWayRows(planRows(local.plan), planRows(remote.plan), baseListFingerprintAs(planRows(planBase), PLAN_FP_FIELDS), {
    fields: PLAN_FP_FIELDS,
    keyOf: (row) => row.id,
    keepOnFight: 'mine',
  });
  state.plan = planFromRows(planMerge.rows);
  conflicts.plan = planMerge.fights
    .filter((fight) => !openPlan.some((entry) => entry.date === fight.mine.date && entry.slot === fight.mine.slot))
    .map(planConflictFor);

  // 4. Conflicts themselves are shared records: union, never re-raise. Keys
  //    are only written when there is something to write, so a clean merge
  //    stays byte-identical to the state it folded into.
  const mergedListConflicts = threeWayRecords(local.listConflicts || [], remote.listConflicts || [], baseValue(base, 'listConflicts') || []);
  const mergedPantryConflicts = [
    ...threeWayRecords(local.pantryConflicts || [], remote.pantryConflicts || [], baseValue(base, 'pantryConflicts') || []),
    ...conflicts.pantry,
  ].slice(-100);
  const mergedPlanConflicts = [
    ...threeWayRecords(local.planConflicts || [], remote.planConflicts || [], baseValue(base, 'planConflicts') || []),
    ...conflicts.plan,
  ].slice(-50);
  if (mergedListConflicts.length || 'listConflicts' in local || 'listConflicts' in remote) state.listConflicts = mergedListConflicts;
  if (mergedPantryConflicts.length || 'pantryConflicts' in local || 'pantryConflicts' in remote) state.pantryConflicts = mergedPantryConflicts;
  if (mergedPlanConflicts.length || 'planConflicts' in local || 'planConflicts' in remote) state.planConflicts = mergedPlanConflicts;

  // 5. The diary is dated record lists — one merge per day.
  const mergedLog = mergeDatedLog(local.log || {}, remote.log || {}, baseValue(base, 'log') || {});
  if (Object.keys(mergedLog).length || 'log' in local || 'log' in remote) state.log = mergedLog;

  // 6. Sets, maps and record lists with their own honest rules.
  for (const key of SET_KEYS) {
    if (key in local || key in remote) {
      state[key] = threeWaySets(local[key] || [], remote[key] || [], baseValue(base, key) || []);
    }
  }
  for (const key of MAP_KEYS) {
    if (key in local || key in remote) {
      state[key] = threeWayMap(local[key] || {}, remote[key] || {}, baseValue(base, key) || {});
    }
  }
  for (const key of RECORD_KEYS) {
    if (key in local || key in remote) {
      state[key] = threeWayRecords(local[key] || [], remote[key] || [], baseValue(base, key) || []);
    }
  }

  // 7. Everything else: the side that changed it since the base wins. A key
  //    changed differently on both sides keeps this device's copy — session
  //    truth like the calendar day or the water glass is device-scoped, and
  //    the next push makes the kept value the shared one.
  const handled = new Set([
    'shoppingList', 'pantry', 'plan', 'log',
    'listConflicts', 'pantryConflicts', 'planConflicts',
    ...SET_KEYS, ...MAP_KEYS, ...RECORD_KEYS,
  ]);
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (handled.has(key) || key === 'schemaVersion') continue;
    const inLocal = Object.prototype.hasOwnProperty.call(local, key);
    const inRemote = Object.prototype.hasOwnProperty.call(remote, key);
    const baseFp = baseKeys[key];
    if (inLocal && inRemote) {
      if (valueFingerprint(local[key]) === valueFingerprint(remote[key])) continue;
      if (baseFp !== undefined && baseFp === valueFingerprint(remote[key])) continue; // only we changed
      if (baseFp !== undefined && baseFp === valueFingerprint(local[key])) {
        state[key] = remote[key]; // only the household changed it
        continue;
      }
      state[key] = local[key]; // both changed: this device's copy stays
      continue;
    }
    const side = inLocal ? local : remote;
    const value = inLocal ? local[key] : remote[key];
    if (baseFp !== undefined && baseFp === valueFingerprint(side[key])) {
      delete state[key]; // removed on one side, untouched on the other
    } else {
      state[key] = value;
    }
  }

  return { state, conflicts, counts: conflictsCount(conflicts) };
};

const conflictsCount = (conflicts) =>
  conflicts.list.length + conflicts.pantry.length + conflicts.plan.length;

/** Row fingerprints of any id-keyed list, for a given field set. */
const baseListFingerprintAs = (rows = [], fields) => {
  const map = {};
  for (const row of rows) if (row?.id) map[row.id] = fieldsFingerprint(row, fields);
  return map;
};

/** The diary: `{ 'YYYY-MM-DD': entry[] }` merged day by day, entries by id. */
const mergeDatedLog = (local = {}, remote = {}, base = {}) => {
  const out = {};
  for (const date of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const rows = threeWayRecords(local[date] || [], remote[date] || [], base[date] || []);
    if (rows.length) out[date] = rows;
  }
  return out;
};

/**
 * Fold a newer household copy into the local state with the whole-state
 * merge. Returns `{ state, conflicts }`, or null when there is nothing to
 * adopt (the two copies already agree). Pure — the caller commits.
 */
export const adoptRemoteSharedState = (localState, remoteState, base = null) => {
  const { state, counts } = mergeSharedState(localState, remoteState, base);
  if (valueFingerprint(state) === valueFingerprint(localState || {})) return null;
  return { state, conflicts: counts };
};
