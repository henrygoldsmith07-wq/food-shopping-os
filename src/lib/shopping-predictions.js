/**
 * Shopping prediction snapshots — what Forq actually told the household to buy.
 *
 * "How accurate was my quantity advice?" used to be answered by rebuilding the
 * prediction from the plan's recipes after the shop had already happened —
 * which quietly answers a different question: the list the household saw was
 * also shaped by the pantry deduction, the household's portions, the waste
 * learning and any suppressed adaptations, and a reconstruction sees none of
 * that. So the list builder now freezes the quantity it is about to show:
 *
 *   one row, one snapshot, written in the same state update that shows it.
 *
 * The store holds `shoppingPredictions`, keyed by a stable prediction id
 * (list item id) — re-deriving the same row overwrites the snapshot in place,
 * so the store never accumulates a snapshot per refresh. Rows that leave the
 * list have their snapshot evicted; `buildShopRecord` freezes the bought
 * rows' snapshots onto the shop record, where evaluation keeps reading them
 * even after the list has moved on.
 */

import { canonicalName } from './aliases.js';
import { parseQuantity } from './measure.js';

/**
 * One prediction row: the decision record behind the quantity on screen.
 * Every field answers "why this number" — the exact decision stack the task
 * names, in the order it applied:
 *
 *   plan need → pantry deduction → household portions → waste adjustment →
 *   adaptation/suppression state → the quantity finally displayed.
 */
export const shoppingPrediction = ({
  itemId = null,
  name = '',
  qty = null,
  sourceRecipes = [],
  portionsDecision = null,
  pantryDeduction = null,
  wasteAdjustment = null,
  suppressed = false,
  week = null,
  day = null,
} = {}) => {
  const parsed = parseQuantity(qty, { ingredient: name });
  return {
    id: String(itemId || `pred-${Math.random().toString(36).slice(2, 10)}`),
    predictionKey: canonicalName(name) || String(name || '').trim().toLowerCase(),
    name: String(name || ''),
    qty: qty == null ? null : String(qty),
    // Normalized where the engine can vouch for it; null for counts, hedged
    // quantities and anything else the engine will not sign.
    normalized: parsed && parsed.confidence === 'exact'
      ? { amount: parsed.amount, dim: parsed.dim, unit: parsed.unit }
      : null,
    sourceRecipes: Array.isArray(sourceRecipes) ? sourceRecipes.filter(Boolean) : [],
    portionsDecision,
    pantryDeduction,
    wasteAdjustment,
    suppressed: Boolean(suppressed),
    week: week == null ? null : String(week),
    day: day == null ? null : String(day).slice(0, 10),
    at: Date.now(),
  };
};

/** The week stamp (Monday of `day`'s week) for grouping predictions. */
export const weekStamp = (day) => {
  const stamp = String(day || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const date = new Date(`${stamp}T12:00:00`);
  const dow = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - dow);
  return date.toISOString().slice(0, 10);
};

/**
 * The decision context behind one list row, as the plan-to-list paths know
 * it — the exact inputs the snapshot must carry so evaluation never has to
 * reconstruct them.
 */
const decisionFor = (row, {
  portionsDecision = null,
  suppressed = false,
  pantry = [],
  learnedAliases = {},
} = {}) => ({
  sourceRecipes: Array.isArray(row.sourceRecipes) && row.sourceRecipes.length
    ? row.sourceRecipes
    : (row.fromRecipe ? [row.fromRecipe] : []),
  portionsDecision,
  pantryDeduction: row.requiredQty != null
    ? {
      requiredQty: row.requiredQty,
      pantryQty: row.pantryQty || '',
      shortfallQty: row.shortfallQty || '',
      deducted: Boolean(row.pantryQty),
    }
    : null,
  wasteAdjustment: row.autoReduction || null,
  suppressed,
  pantry,
  learnedAliases,
});

/**
 * Attach (or refresh) the prediction snapshots for a whole derived list, in
 * the same write that shows the list. The store keeps at most one snapshot
 * per list row id — a regenerated row overwrites its own prediction instead
 * of accumulating history no evaluation reads.
 *
 * `context` carries the household decision and the suppression set so each
 * row's record says what shaped it: { portionsDecision, suppressedKeys,
 * pantry, learnedAliases, day }.
 */
export const attachPredictions = (list = [], previous = [], context = {}) => {
  const rows = Array.isArray(list) ? list : [];
  // NOTE: no early return on an empty list — an emptied list means every
  // row left the screen, so every book entry is evicted (frozen copies
  // survive on the shop records that consumed them).
  const {
    portionsDecision = null,
    suppressedKeys = null,
    pantry = [],
    learnedAliases = {},
    day = null,
  } = context;
  // Held keys arrive in whatever language the rejection was recorded in;
  // both sides meet on the canonical name so a raw key still matches its
  // row.
  const suppressedSet = new Set(
    [...(suppressedKeys instanceof Set ? suppressedKeys : (suppressedKeys || []))]
      .map((k) => canonicalName(String(k), learnedAliases) || String(k).trim().toLowerCase()),
  );
  const week = weekStamp(day);
  const keep = new Map((Array.isArray(previous) ? previous : []).map((p) => [p.id, p]));
  for (const row of rows) {
    if (!row?.name || !row?.id) continue;
    const key = canonicalName(row.name, learnedAliases) || String(row.name).trim().toLowerCase();
    keep.set(row.id, shoppingPrediction({
      itemId: row.id,
      name: row.name,
      qty: row.qty,
      sourceRecipes: decisionFor(row, { portionsDecision, suppressed: suppressedSet.has(key), pantry, learnedAliases }).sourceRecipes,
      portionsDecision,
      pantryDeduction: row.requiredQty != null
        ? {
          requiredQty: row.requiredQty,
          pantryQty: row.pantryQty || '',
          shortfallQty: row.shortfallQty || '',
          deducted: Boolean(row.pantryQty),
        }
        : null,
      wasteAdjustment: row.autoReduction || null,
      suppressed: suppressedSet.has(key),
      week,
      day,
    }));
  }
  // Evict: a snapshot describes a row currently on show. Rows that left the
  // list lose their book entry — the frozen copies that matter live on the
  // shop records that consumed them.
  const onList = new Set(rows.filter((r) => r?.id).map((r) => r.id));
  return [...keep.values()].filter((p) => onList.has(p.id)).slice(-500);
};

const basketPrediction = (items = []) => Math.round((Array.isArray(items) ? items : [])
  .reduce((sum, row) => sum + (Number(row?.price) || 0), 0) * 100) / 100;

/**
 * The one purchase-recording shape. Both sanctioned paths — `recordShop`'s
 * checked-rows flow and the `purchaseIngredients` domain command — build the
 * shop record here, so every shop carries the same prediction metadata and
 * evaluation never meets a shop it cannot read.
 *
 * The frozen `predictions` are looked up from the store's prediction book at
 * purchase time — the snapshot of each bought row, exactly as the list showed
 * it — and live on the shop record from then on, so evaluation keeps reading
 * "what we told them to buy" even after the list has moved on.
 *
 * `items` are the writer's final item rows (the writer keeps shaping them);
 * `predictedCost` is the writer's own pre-till basket snapshot when it has
 * one, otherwise the sum of the row prices the household saw.
 */
export const buildShopRecord = ({ state = {}, items = [], store = null, total = null, predictedCost = null, id, day }) => {
  const book = Array.isArray(state.shoppingPredictions) ? state.shoppingPredictions : [];
  const byId = new Map(book.map((p) => [p.id, p]));
  const predictions = (Array.isArray(items) ? items : [])
    .map((row) => byId.get(row?.id) || null)
    .filter(Boolean);
  return {
    id,
    date: String(day || '').slice(0, 10),
    store: store || 'Unnamed shop',
    total: Math.round((Number(total) || 0) * 100) / 100,
    predicted: predictedCost != null && Number.isFinite(Number(predictedCost))
      ? Math.round(Number(predictedCost) * 100) / 100
      : basketPrediction(items),
    items,
    predictions,
  };
};

/**
 * Snapshots usable for evaluation: a displayed quantity that is not a
 * manual row (no fromRecipe → the household's own line, not Forq's advice)
 * and carries a readable amount.
 */
export const evaluablePredictions = (store = []) => (Array.isArray(store) ? store : [])
  .filter((p) => p && p.qty != null && p.qty !== '' && (p.sourceRecipes?.length || p.autoReduction));
