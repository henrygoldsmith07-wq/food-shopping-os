/**
 * "Check before you shop": list rows the pantry cannot settle on its own.
 *
 * The list already subtracts stock the app is sure about. What it cannot do
 * is decide for a row whose pantry evidence is soft: an amount that cannot be
 * weighed against the recipe ("1 bag" of rice against 300 g), stock last
 * confirmed weeks ago, or a jar marked running low. Those rows stay on the
 * list — buying too little is worse than buying twice — but they are exactly
 * the ones a ten-second look in the cupboard would settle.
 *
 * This module finds them and says why, so the Shop tab can ask once, before
 * the trip, and remember the answer: "Got enough" confirms the pantry row and
 * takes the item off the list; "Buy it" keeps it and stops asking.
 */

import { sameIngredient } from './aliases.js';
import { pantryAvailability } from './kitchen.js';
import { sufficientFor } from './measure.js';

/** At most this many checks are shown — a long quiz before a shop is a chore. */
export const SHOP_CHECK_LIMIT = 6;

const clean = (value) => String(value ?? '').trim();

const daysBetween = (from, to) => {
  const a = Date.parse(String(from || '').slice(0, 10));
  const b = Date.parse(String(to || '').slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
};

/** Why one pantry row does not settle the need, in words, or null when it does. */
const doubtFor = (pantryRow, need, { today, ingredient }) => {
  const truth = pantryAvailability(pantryRow, today);
  if (truth === 'unknown') return null; // no evidence at all: the row simply needs buying
  if (truth === 'running_low') return { kind: 'low', text: `${pantryRow.name} is marked running low` };
  if (truth === 'probably_available') {
    const seen = pantryRow.lastConfirmedAt || pantryRow.confidenceUpdatedAt || pantryRow.purchaseDate || pantryRow.addedAt;
    const age = daysBetween(seen, today);
    return {
      kind: 'stale',
      text: age && age > 0
        ? `Last checked ${age} day${age === 1 ? '' : 's'} ago`
        : `${pantryRow.name} is probably still there`,
    };
  }
  // Confirmed stock. If its amount compares with the need, the list already
  // did the maths (and bought only the shortfall), so there is nothing to ask.
  const qty = clean(pantryRow.qty);
  if (!qty || !clean(need)) return null;
  if (sufficientFor(qty, need, { ingredient }) !== null) return null;
  return { kind: 'amount', text: `Pantry has ${qty}; the plan needs ${clean(need)}` };
};

/**
 * Unticked list rows whose pantry evidence is soft, each with the pantry rows
 * involved and a plain reason. Rows already answered ("Buy it") are skipped.
 *
 * @param {Array<object>} list     the shopping list
 * @param {Array<object>} pantry   pantry rows
 * @param {{ today?: string, learnedAliases?: object, limit?: number }} [options]
 */
export const shopChecks = (list = [], pantry = [], { today = '', learnedAliases = {}, limit = SHOP_CHECK_LIMIT } = {}) => {
  const rows = Array.isArray(list) ? list : [];
  const stock = (Array.isArray(pantry) ? pantry : []).filter((row) => row && row.cat !== 'Leftovers' && clean(row.name));
  const checks = [];
  for (const item of rows) {
    if (!item || item.checked || item.shopCheck === 'buy' || !clean(item.name)) continue;
    const need = clean(item.requiredQty) || clean(item.qty);
    const matches = stock.filter((row) => sameIngredient(row.name, item.name, learnedAliases));
    if (!matches.length) continue;
    const doubts = matches
      .map((row) => ({ row, doubt: doubtFor(row, need, { today, ingredient: item.name }) }))
      .filter((entry) => entry.doubt);
    if (!doubts.length) continue;
    checks.push({
      itemId: item.id,
      name: item.name,
      qty: clean(item.qty),
      need,
      pantryIds: doubts.map((entry) => entry.row.id).filter(Boolean),
      pantryQty: doubts.map((entry) => clean(entry.row.qty)).filter(Boolean).join(' + '),
      kind: doubts[0].doubt.kind,
      reason: doubts[0].doubt.text,
    });
  }
  // Amount mismatches first (most likely to save a purchase), then low, then stale.
  const order = { amount: 0, low: 1, stale: 2 };
  checks.sort((a, b) => order[a.kind] - order[b.kind]);
  return Number.isFinite(limit) ? checks.slice(0, Math.max(0, limit)) : checks;
};

/**
 * The state change for one answer. Pure, so the store action and the tests
 * share it.
 *  - 'have': the item comes off the list and each pantry row involved is
 *    confirmed today (definite), so next week's list trusts it.
 *  - 'buy':  the item stays, marked so the question is not asked again; a
 *    pantry row marked running low stays low.
 */
export const applyShopCheck = (state, itemId, answer) => {
  const list = Array.isArray(state?.shoppingList) ? state.shoppingList : [];
  const item = list.find((row) => row.id === itemId);
  if (!item || !['have', 'buy'].includes(answer)) return null;
  if (answer === 'buy') {
    return { shoppingList: list.map((row) => (row.id === itemId ? { ...row, shopCheck: 'buy' } : row)) };
  }
  const check = shopChecks([item], state.pantry, {
    today: state.day, learnedAliases: state.aliasMemory || {}, limit: Infinity,
  })[0];
  const confirm = new Set(check?.pantryIds || []);
  const pantry = (state.pantry || []).map((row) => (confirm.has(row.id)
    ? {
      ...row,
      confidence: 'definite',
      low: false,
      lastConfirmedAt: state.day,
      confidenceUpdatedAt: state.day,
      confirmationSource: 'shop-check',
    }
    : row));
  return {
    pantry,
    shoppingList: list.filter((row) => row.id !== itemId),
    confirmedPantryIds: [...confirm],
  };
};
