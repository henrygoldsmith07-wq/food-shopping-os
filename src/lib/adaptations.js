/**
 * What Forq changed, and why — the adaptation ledger the household reads.
 *
 * Forq quietly improves three things: how much of an item it asks you to
 * buy (waste learning), how many portions it plans for (learned appetite),
 * and how the rest of the week is rearranged after reality (recovery).
 * This module gathers those changes from the state that already exists —
 * the reduced list rows, the portion decision, the WeekRecovered events —
 * and gives each one the same four-part shape:
 *
 *   change  — what is now different, in one line
 *   evidence — what was observed that caused it
 *   confidence — how strong that evidence is (high / medium / low)
 *   undo — how to take it back, when taking it back makes sense
 *
 * Everything here is a pure reading. Nothing writes; the store's
 * `undoAdaptation` command turns an adaptation's undo descriptor into the
 * one write that reverses it — and records the reversal, so a change the
 * household keeps undoing loses its influence (see adaptationPressure).
 */

import { canonicalName } from './aliases.js';
import { householdPortionsFor } from './portions.js';

/** How far back a correction keeps counting against a change. */
export const ADAPTATION_LOOKBACK_DAYS = 28;
/** Corrections needed before a change stops being applied for a key. */
export const ADAPTATION_UNDO_LIMIT = 2;

const NOON = 'T12:00:00';

const daysBetweenStamps = (from, to) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ''))) return null;
  return Math.round((new Date(`${to}${NOON}`) - new Date(`${from}${NOON}`)) / 86400000);
};

const dayOf = (stamp) => String(stamp || '').slice(0, 10);

/**
 * How many times the household undid each kind of change, from the one
 * timeline of what really happened. Undos arrive as RecommendationRejected
 * ledger events whose context names the adaptation (`kind: 'adaptation'`,
 * `key: '<adaptation id>'`), so a reversal teaches exactly like a rejected
 * recommendation does. Counts decay by age the same way the rest of the
 * learning does: last month's undo weighs half of this week's.
 */
export const adaptationPressure = (state = {}, { today = null, lookbackDays = ADAPTATION_LOOKBACK_DAYS } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const pressure = new Map();
  const weightFor = (day) => {
    const age = today ? daysBetweenStamps(dayOf(day), dayOf(today)) : null;
    if (age === null) return 1;
    if (age < 0 || age > lookbackDays) return 0;
    return Math.pow(0.5, age / 28);
  };
  for (const event of ledger) {
    if (event?.type !== 'RecommendationRejected') continue;
    const context = event.context;
    if (context?.kind !== 'adaptation' || !context.key) continue;
    const w = weightFor(event.day || event.at);
    if (w <= 0) continue;
    pressure.set(context.key, (pressure.get(context.key) || 0) + w);
  }
  return pressure;
};

/**
 * Keys whose change the household has repeatedly undone. These changes stay
 * visible as annotations but stop being applied — the recommendation that
 * users repeatedly correct becomes less influential, which is the whole
 * point of listening.
 */
export const suppressedAdaptationKeys = (state = {}, options = {}) => {
  const minUndos = Number.isFinite(options.minUndos) ? options.minUndos : ADAPTATION_UNDO_LIMIT;
  const pressure = adaptationPressure(state, options);
  const suppressed = new Set();
  for (const [key, weight] of pressure) {
    if (weight >= minUndos) suppressed.add(key);
  }
  return suppressed;
};

const confidenceFrom = (count, { high = 3, medium = 2 } = {}) =>
  count >= high ? 'high' : count >= medium ? 'medium' : 'low';

/** The human version of a recovery trigger — "IngredientWasted" → "food you binned". */
export const humanizeTrigger = (trigger) => {
  const map = {
    MealSkipped: 'a meal you skipped',
    IngredientWasted: 'food you binned',
    PantryCorrected: 'a pantry fix',
    LeftoverCreated: 'leftovers you saved',
    UnplannedShop: 'an unplanned shop',
    MealCooked: 'a meal you cooked off-plan',
  };
  return map[trigger] || (trigger ? String(trigger) : null);
};

/** Adaptations read from the list: rows the waste-learning pass reduced. */
const listAdaptations = (state = {}, { today } = {}) => {
  const rows = [];
  const list = Array.isArray(state.shoppingList) ? state.shoppingList : [];
  for (const item of list) {
    const reduction = item.autoReduction;
    if (!reduction || !item.name) continue;
    const key = canonicalName(item.name, state.aliasMemory) || String(item.name).toLowerCase();
    const binned = reduction.reason === 'binned';
    const evidence = binned
      ? `You binned ${item.name.toLowerCase()} ${reduction.count}× in the last month`
      : `${reduction.recipeName}'s leftovers were binned ${reduction.discards}× of ${reduction.cooks} recent cooks`;
    rows.push({
      id: `waste-qty:${key}`,
      kind: 'waste-qty',
      target: item.id,
      key,
      title: `Reduced ${item.name.toLowerCase()} from ${reduction.fromQty} to ${reduction.toQty}`,
      evidence,
      confidence: binned ? confidenceFrom(reduction.count) : confidenceFrom(reduction.discards, { high: 3, medium: 2 }),
      at: reduction.lastBinnedAt ? dayOf(reduction.lastBinnedAt) : dayOf(today),
      undo: { kind: 'waste-qty', itemId: item.id, fromQty: reduction.fromQty, key },
    });
  }
  return rows;
};

/** The learned-appetite adaptation: portions the plan follows that differ from the setting. */
const portionsAdaptation = (state = {}, { today } = {}) => {
  const household = householdPortionsFor(state);
  if (!household.autoLearned) return null;
  const typical = Math.round(household.evidence.typical * 10) / 10;
  return {
    id: 'portions:household',
    kind: 'portions',
    target: null,
    key: 'portions',
    title: `Planning ${household.portions} portions — your last ${household.evidence.observations} meals averaged ${typical}`,
    evidence: `Recorded portions from ${household.evidence.observations} cooked meals`,
    confidence: confidenceFrom(household.evidence.observations, { high: 6, medium: 3 }),
    at: dayOf(today),
    undo: { kind: 'portions', override: household.configured, key: 'portions' },
  };
};

/** Applied week recoveries, read from the ledger so only real ones show. */
const recoveryAdaptations = (state = {}, { today } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const rows = [];
  for (const event of ledger) {
    if (event?.type !== 'WeekRecovered') continue;
    const age = today ? daysBetweenStamps(dayOf(event.day || event.at), dayOf(today)) : 0;
    if (age !== null && (age < 0 || age > 7)) continue;
    const repairs = Array.isArray(event.repairs) ? event.repairs : [];
    const moved = repairs.filter((r) => r.kind === 'swap' || r.kind === 'reuse' || r.kind === 'free-slot').length;
    const added = Array.isArray(event.addedToList) ? event.addedToList.length : 0;
    const removed = Array.isArray(event.removedFromList) ? event.removedFromList.length : 0;
    const bits = [];
    if (moved) bits.push(`rearranged ${moved} meal${moved === 1 ? '' : 's'}`);
    if (added) bits.push(`added ${added} item${added === 1 ? '' : 's'} to the list`);
    if (removed) bits.push(`removed ${removed} item${removed === 1 ? '' : 's'} from the list`);
    if (!bits.length) continue;
    const cause = humanizeTrigger(event.trigger);
    rows.push({
      id: `recovery:${event.id}`,
      kind: 'recovery',
      target: null,
      key: `recovery:${event.id}`,
      title: `After ${cause || 'what happened'}: ${bits.join(', ')}`,
      evidence: cause ? `${cause.charAt(0).toUpperCase()}${cause.slice(1)} earlier this week` : 'Recorded earlier this week',
      confidence: 'high', // it already happened, and the household saw it
      at: dayOf(event.day || event.at),
      undo: null, // the loop's own undo/correction paths own this one
    });
  }
  return rows;
};

/**
 * Every adaptation worth saying out loud, most useful first. Rows the
 * household keeps undoing are held back — named in `suppressed`, not shown
 * as live changes. An empty result means Forq changed nothing worth
 * explaining, and the UI should say so by not existing.
 */
export const collectAdaptations = (state = {}, { today = state?.day || null } = {}) => {
  const suppressed = suppressedAdaptationKeys(state, { today });
  const live = [
    ...listAdaptations(state, { today }),
    portionsAdaptation(state, { today }),
    ...recoveryAdaptations(state, { today }),
  ].filter(Boolean);
  const adaptations = live
    .filter((row) => !suppressed.has(row.key))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      if (rank[a.confidence] !== rank[b.confidence]) return rank[a.confidence] - rank[b.confidence];
      return String(b.at || '').localeCompare(String(a.at || ''));
    })
    .slice(0, 6);
  return { adaptations, suppressed };
};
