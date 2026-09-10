/**
 * Quantity-aware pantry coverage — the honest answer to "does the pantry
 * cover this recipe?".
 *
 * Split out of week-recovery.js so the engine repairs while this module
 * measures. Coverage here is NOT name-presence: an ingredient line counts
 * as covered only when a pantry row both matches its name AND (when both
 * sides parse to a comparable quantity) actually holds enough of it.
 * "200 g rice" in the pantry does not cover a recipe asking for "500 g
 * rice", and a substitution decision built on name presence alone would
 * send the household shopping mid-cook.
 *
 * When either side has no readable quantity the answer falls back to
 * name-level truth — an admitted gap, never an invented number.
 */

import { dayStamp } from './kitchen-dates.js';
import { pantryTruthForNeed } from './kitchen.js';
import { parseQuantity } from './measure.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** The quantity a recipe asks of one ingredient line, parsed honestly. */
const needOf = (ingredient) => {
  const qty = ingredient && typeof ingredient === 'object' ? ingredient.qty : null;
  if (!qty) return null;
  try { return parseQuantity(qty, { ingredient: norm(ingredient.name || '') }); } catch { return null; }
};

/**
 * Coverage of a recipe against the pantry — quantity-aware, not name-only.
 *
 * `pantry` may be rows (objects with name/qty) or plain names; the plain
 * form keeps old callers and tests working. Missing rows carry `shortOf`
 * (the quantity the recipe wanted) when the gap was a quantity, so a
 * repair can say "you have rice, just not 500 g of it".
 */
export const pantryCoverageOf = (recipe, pantryNames, { pantry = null, today = dayStamp() } = {}) => {
  const ingredients = recipe?.ingredients || [];
  const rows = Array.isArray(pantry) ? pantry : null;
  const have = [];
  const missing = [];
  for (const ingredient of ingredients) {
    const name = norm(ingredient?.name || ingredient);
    const coveredByName = pantryNames.has ? pantryNames.has(name) : pantryNames.includes(name);
    let covered = coveredByName;
    let shortOf = null;
    if (coveredByName && rows) {
      // Quantity check: the pantry rows that match this line by name.
      const matches = rows.filter((p) => {
        const stocked = norm(p?.name);
        return stocked === name || (Math.min(stocked.length, name.length) >= 4 && (stocked.includes(name) || name.includes(stocked)));
      });
      const need = needOf(ingredient);
      if (matches.length && need) {
        // Enough when any matching row is sufficient for what's asked.
        let verdict = null;
        for (const row of matches) {
          const truth = pantryTruthForNeed(row, ingredient.qty, { today });
          if (truth === 'confirmed_sufficient') { verdict = true; break; }
          if (truth === 'confirmed_insufficient') verdict = false;
        }
        if (verdict === false) {
          covered = false;
          shortOf = ingredient.qty;
        }
      }
    }
    if (covered) have.push(ingredient);
    else missing.push(shortOf ? { ...ingredient, shortOf } : ingredient);
  }
  if (!ingredients.length) return { have: 0, total: 0, pct: 0, missing: [] };
  return {
    have: have.length,
    total: ingredients.length,
    pct: Math.round((have.length / ingredients.length) * 100),
    missing,
  };
};
