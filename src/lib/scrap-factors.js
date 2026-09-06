/**
 * Learning from leftover outcomes: which ingredients consistently end up as
 * binned leftovers.
 *
 * The waste ledger records dish scraps as rows with the `Leftovers` category
 * (`Fajitas (leftovers)`), but until now that evidence never reached the
 * shopping list — only directly binned ingredients did. Here each leftover
 * discard is attributed to the recipe it came from, and each recorded cook of
 * that recipe is the denominator, so an ingredient that repeatedly rides in a
 * dish whose leftovers get binned learns a scrap rate. Staples dilute
 * naturally: oil is in every cook, so its rate stays low even when a dish is
 * binned.
 *
 * The rule is deliberately conservative — at least two recorded cooks and two
 * leftover discards, and at least half of the cooks ending in the bin — so
 * one abandoned curry never reprices the whole plan.
 */

import { canonicalName } from './aliases.js';
import { scaleQty } from './portions.js';
import { LEFTOVER_CAT } from './mealplan.js';
import { daysBetween } from './waste-requirements.js';

const LEFTOVER_SUFFIX = /\s*\(leftovers\)\s*$/i;
/** A leftover discard older than this no longer says anything about this week. */
const LOOKBACK_DAYS = 60;
/** Minimum evidence before the list follows the learning. */
const MIN_COOKS = 2;
const MIN_DISCARDS = 2;
/** At least this share of cooks must end binned before quantities shrink. */
const MIN_RATE = 0.5;
/** Mass/volume rows shrink by this much once the rate is high; counts drop a single unit. */
const MASS_CUT = 0.25;
const MASS_CUT_RATE = 0.75;

const recipeKey = (name) => String(name || '').replace(LEFTOVER_SUFFIX, '').trim().toLowerCase();

/**
 * Ingredient → scrap evidence for this household.
 * `waste` rows with the leftovers category attribute to their recipe's
 * ingredients; `cooked` events attribute to the same ingredients, giving the
 * rate a denominator. Returns a Map keyed like the shopping list's canonical
 * names: key → { discards, cooks, rate, recipeName, lastDate }.
 */
export const scrapIngredientRates = (
  waste = [],
  cooked = [],
  recipes = [],
  { learnedAliases = {}, today = null } = {},
) => {
  const pool = (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => (recipe?.name ? { recipe, key: recipeKey(recipe.name) } : null))
    .filter(Boolean);
  const byName = new Map(pool.map(({ key, recipe }) => [key, recipe]));
  const byId = new Map(pool.map(({ recipe }) => [recipe.id, recipe]));

  const stats = new Map(); // ingredient key → { discards, cooks, name, recipeName, lastDate }
  const touch = (key, name, recipeName, field, date) => {
    if (!key) return;
    const row = stats.get(key) || { key, name, recipeName, discards: 0, cooks: 0, lastDate: null };
    row[field] += 1;
    if (date && (!row.lastDate || date > row.lastDate)) row.lastDate = date;
    stats.set(key, row);
  };
  const forRecipe = (recipe, field, date) => {
    for (const ingredient of recipe?.ingredients || []) {
      const name = String(ingredient?.name || '').trim();
      if (!name) continue;
      touch(canonicalName(name, learnedAliases) || name.toLowerCase(), name, recipe.name, field, date);
    }
  };

  const withinWindow = (date) => {
    if (!today || !date) return true;
    const age = daysBetween(String(date).slice(0, 10), today);
    return age >= 0 && age <= LOOKBACK_DAYS;
  };

  // Leftover discards are dish scraps: attribute each to its recipe.
  for (const row of Array.isArray(waste) ? waste : []) {
    const name = String(row?.name || '');
    if (row?.cat !== LEFTOVER_CAT && !LEFTOVER_SUFFIX.test(name)) continue;
    const recipe = byName.get(recipeKey(name));
    if (!recipe) continue;
    if (!withinWindow(row?.date)) continue;
    forRecipe(recipe, 'discards', row?.date);
  }

  // Recorded cooks are the denominator.
  for (const event of Array.isArray(cooked) ? cooked : []) {
    const recipe = byId.get(event?.recipeId);
    if (!recipe) continue;
    if (!withinWindow(event?.date)) continue;
    forRecipe(recipe, 'cooks', event?.date);
  }

  const rates = new Map();
  for (const row of stats.values()) {
    if (row.cooks < MIN_COOKS || row.discards < MIN_DISCARDS) continue;
    const rate = row.discards / row.cooks;
    if (rate < MIN_RATE) continue;
    rates.set(row.key, { ...row, rate: Math.round(rate * 100) / 100 });
  }
  return rates;
};

/**
 * Buy less of a scrap-heavy ingredient. Count rows drop one unit (the same
 * honest step binned ingredients get); mass/volume rows shrink by a quarter
 * only when the rate is high. Returns the adjusted row, or null when the
 * evidence does not justify a change.
 */
export const scrapAdjustedQty = (item, rate) => {
  if (!item?.qty || !(rate >= MIN_RATE)) return null;
  const text = String(item.qty).trim();
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (m) {
    const unit = (m[2] || '').trim();
    const isCount = !/^(?:g|gr|grams?|kg|ml|l|litres?|liters?|cl|fl\s*oz|oz\.?|lbs?|lb)\.?$/i.test(unit);
    if (isCount) {
      const n = Number(m[1].replace(',', '.'));
      if (Number.isInteger(n) && n >= 2) return { qty: unit ? `${n - 1} ${unit}` : String(n - 1) };
      return null;
    }
    if (rate >= MASS_CUT_RATE) return { qty: scaleQty(text, 1 - MASS_CUT) };
    return null;
  }
  return null;
};
