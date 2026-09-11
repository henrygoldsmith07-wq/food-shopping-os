/**
 * Quantity-aware pantry coverage — the honest answer to "does the pantry
 * cover this recipe?".
 *
 * Split out of week-recovery.js so the engine repairs while this module
 * measures. Coverage here is NOT name-presence:
 *
 *   1. Matching rows are found through the SAME ingredient matcher the rest
 *      of the app reads (`sameIngredient`), so learned aliases count — a
 *      row named "tinned tomatoes" covers a line asking for "Tomatoes"
 *      without anyone editing either.
 *   2. Every matching row with a usable quantity is AGGREGATED through the
 *      shared measurement engine (`mergeQtys`), so two half-bags of rice
 *      cover a 700 g ask and "1 kg" + "200 g" sit on one scale. Rows with
 *      no readable quantity contribute presence, not pretend grams.
 *   3. The aggregated amount is compared against what the recipe asks
 *      (`qtySuffices`). 200 g of rice does not cover 500 g, and a
 *      substitution decision built on name presence alone would send the
 *      household shopping mid-cook.
 *
 * When nothing parses onto a common scale the answer falls back to
 * name-level truth — an admitted gap, never an invented number.
 */

import { dayStamp } from './kitchen-dates.js';
import { sameIngredient } from './aliases.js';
import { mergeQtys, qtySuffices, readQty } from './pantry.js';
import { pantryAvailability } from './kitchen.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** A quantity the measurement engine can actually put on a scale. */
const comparableQty = (qty, ingredient) => {
  if (!qty) return null;
  return readQty(qty, { ingredient }) || null;
};

/**
 * Coverage of a recipe against the pantry — quantity-aware, aggregated
 * across every matching row.
 *
 * `pantry` may be rows (objects with name/qty) or plain names; the plain
 * form keeps old callers and tests working. Missing rows carry `shortOf`
 * (the quantity the recipe wanted) when the gap was a quantity, so a
 * repair can say "you have rice, just not 500 g of it".
 */
export const pantryCoverageOf = (recipe, pantryNames, { pantry = null, today = dayStamp(), learnedAliases = {} } = {}) => {
  const ingredients = recipe?.ingredients || [];
  const rows = Array.isArray(pantry) ? pantry : null;
  const have = [];
  const missing = [];
  for (const ingredient of ingredients) {
    const name = norm(ingredient?.name || ingredient);
    let covered = pantryNames.has ? pantryNames.has(name) : pantryNames.includes(name);
    let shortOf = null;
    if (covered && rows) {
      // Rows that are the same ingredient — aliases learned from receipts
      // and corrections included — and worth counting for quantity.
      const matches = rows.filter((row) => {
        if (!sameIngredient(row?.name, ingredient?.name || name, learnedAliases)) return false;
        return pantryAvailability(row, today) !== 'unknown';
      });
      const need = ingredient?.qty || null;
      if (matches.length && need) {
        const canonical = norm(ingredient.name || name);
        // Sum everything the household holds of this thing onto one scale.
        const available = matches.reduce(
          (total, row) => mergeQtys(total, row?.qty || '', { ingredient: canonical }),
          '',
        );
        const aggregateUsable = Boolean(available) && !available.includes(' + ');
        const verdict = aggregateUsable
          ? qtySuffices(available, need, { ingredient: canonical })
          : null;
        if (aggregateUsable && verdict === true) {
          covered = true;
        } else if (aggregateUsable && verdict === false) {
          covered = false;
          shortOf = need;
        } else {
          // The aggregate will not compare (vague rows, mixed scales): fall
          // back per row. Any single row provably enough covers the line;
          // rows with no comparable quantity keep name-level truth — the
          // app cannot claim a shortage without numbers to compare.
          const singleHit = matches.some((row) => {
            const parsed = comparableQty(row?.qty, canonical);
            return parsed && qtySuffices(row.qty, need, { ingredient: canonical }) === true;
          });
          const hasVagueRow = matches.some((row) => !comparableQty(row?.qty, canonical));
          covered = singleHit || hasVagueRow;
          if (!covered) shortOf = need;
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
