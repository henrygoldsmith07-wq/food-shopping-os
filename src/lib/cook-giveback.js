/**
 * "I didn't use that" after cooking.
 *
 * Cooking spends the recipe's amounts from the pantry, but the recipe is a
 * guess about the kitchen: half the spinach went in, the tin stayed shut, the
 * chicken was swapped for tofu. Left alone the pantry would claim less stock
 * than the shelf holds, so Forq would buy it again. This module hands one
 * ingredient's deduction back — pure functions over the pantry and the cook's
 * own `used` rows, so the pantry stays correct without a second deduction path.
 *
 * A `used` row is the row as it stood BEFORE the cook (so its `qty` is the
 * stock that was there) plus `usedQty` when only part of it was spent.
 */

import { parseQuantity } from './measure-parse.js';
import { addQuantities, formatQuantity } from './measure-ops.js';
import { canonicalName } from './aliases.js';

const money = (n) => Math.round(n * 100) / 100;

/** What the cook took from this row, in words ("½ bag", or the whole row). */
export const usedAmountLabel = (row = {}) => row.usedQty || row.qty || 'all of it';

/** Can this used row be handed back (not already, and the cook recorded it)? */
export const canGiveBack = (row) => Boolean(row && row.id && !row.givenBack);

/**
 * The pantry with one used row restored.
 *  - the row is gone (used whole): it comes back as it was before the cook;
 *  - the row is still there with `usedQty`: that amount is added back, and its
 *    cost grows with it, so a half-used pack is whole again;
 *  - the row is still there, one unit was taken: it goes back to its old
 *    quantity.
 * Returns { pantry, restored } where restored is false when nothing could be
 * given back honestly (units that do not add up are left alone, never guessed).
 */
export const giveBackUsedRow = (pantry = [], row = {}) => {
  if (!canGiveBack(row)) return { pantry, restored: false };
  const { usedQty, givenBack, ...original } = row;
  const at = pantry.findIndex((item) => item.id === row.id);
  if (at < 0) return { pantry: [...pantry, original], restored: true };

  const current = pantry[at];
  if (!usedQty) {
    return { pantry: pantry.map((item, i) => (i === at ? { ...current, qty: original.qty, ...(original.cost !== undefined ? { cost: original.cost } : {}) } : item)), restored: true };
  }
  const ingredient = canonicalName(current.name);
  const have = parseQuantity(current.qty, { ingredient });
  const back = parseQuantity(usedQty, { ingredient });
  const total = have && back ? addQuantities(have, back, { ingredient }) : null;
  if (!total) return { pantry, restored: false };
  const cost = Number(current.cost);
  const before = Number(original.cost);
  const next = {
    ...current,
    qty: formatQuantity(total),
    ...(Number.isFinite(cost) && have.amount > 0 && Number.isFinite(before) ? { cost: money(Math.max(cost, cost * (total.amount / have.amount))) } : {}),
  };
  return { pantry: pantry.map((item, i) => (i === at ? next : item)), restored: true };
};

/** The cook's event with one used row marked handed back, and a fresh explanation. */
export const markGivenBack = (event = {}, index) => {
  const used = (event.used || []).map((row, i) => (i === index ? { ...row, givenBack: true } : row));
  const back = used.filter((row) => row.givenBack).length;
  return {
    ...event,
    used,
    explanation: back
      ? `${back} ingredient${back === 1 ? '' : 's'} put back — you told us ${back === 1 ? 'it was' : 'they were'} not used.`
      : event.explanation,
  };
};
