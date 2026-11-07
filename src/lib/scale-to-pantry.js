/**
 * "Scale to what you have": the servings that use the pantry's amount of a
 * recipe's main ingredient — Crouton and Pestle let you scale a recipe by one
 * ingredient; here the amount is the one already in your kitchen, so the
 * offer is to cook the 900 g of chicken you have rather than buy more or
 * leave 400 g to go off.
 *
 * Honest arithmetic only: both amounts must be read on the same scale (grams
 * with grams, ml with ml, eggs with eggs). It rounds servings down, so the
 * suggestion never needs more than you have, and says nothing when the
 * pantry amount can't be measured.
 */

import { parseQuantity } from './measure-parse.js';

const MAX_SERVINGS = 12;

const sameScale = (a, b) => a && b && a.dim === b.dim && (a.dim !== 'count' || a.unit === b.unit || a.unit === 'unit' || b.unit === 'unit');

const fmt = (parsed, amount) => {
  if (parsed.dim === 'mass') return amount >= 1000 ? `${Math.round(amount / 100) / 10} kg` : `${Math.round(amount)} g`;
  if (parsed.dim === 'volume') return amount >= 1000 ? `${Math.round(amount / 100) / 10} l` : `${Math.round(amount)} ml`;
  return `${Math.round(amount * 10) / 10}`;
};

/**
 * The servings suggestion for a recipe, or null.
 *
 * @param {{ servings?: number, ingredients: Array<{ name: string, qty?: string }> }} recipe the recipe as written
 * @param {(ingredient) => { availableQty?: string }} pantryRead
 * @param {{ current?: number }} [options] the servings on screen; no offer when it already matches
 * @returns {{ servings: number, ingredient: string, have: string, uses: string } | null}
 */
export const scaleToPantry = (recipe, pantryRead, { current } = {}) => {
  const base = Number(recipe?.servings) || 1;
  // The main ingredient is the one the recipe uses most of by weight or
  // volume (a count, like eggs, only when nothing is weighed). Scaling to a
  // side ingredient would just mean buying more of the main one.
  let main = null;
  for (const ing of recipe?.ingredients || []) {
    const need = parseQuantity(ing.qty, { ingredient: ing.name });
    if (!need || !(need.amount > 0)) continue;
    const weight = need.dim === 'count' ? 0 : need.amount;
    if (!main || weight > main.weight) main = { ing, need, weight };
  }
  if (!main) return null;
  const read = pantryRead(main.ing) || {};
  // "300 g + 1 pack" is several amounts on different scales, not one you can scale to.
  if (!read.availableQty || /\+/.test(read.availableQty)) return null;
  const have = parseQuantity(read.availableQty, { ingredient: main.ing.name });
  // "2 packs" is a guess at 1 kg from a typical pack size; offering to
  // cook 8 servings from a guess would be the app inventing stock.
  // The same goes for a recipe's own "1 tin": no offer built on a size it assumed.
  if (main.need.count?.source || !have || have.count?.source || !sameScale(main.need, have) || !(have.amount > 0)) return null;
  const best = { ...main, have };
  const perServing = best.need.amount / base;
  const servings = Math.min(MAX_SERVINGS, Math.floor(best.have.amount / perServing + 1e-9));
  if (servings < 1 || servings === current) return null;
  return {
    servings,
    ingredient: best.ing.name,
    have: fmt(best.have, best.have.amount),
    uses: fmt(best.need, perServing * servings),
  };
};
