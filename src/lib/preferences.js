/**
 * Applying who you are to what the app offers you.
 *
 * Compatibility layer: the real decision now lives in food-suitability.js.
 * These exports keep the previous API so existing call sites and tests continue
 * to work while every surface migrates to evaluateFoodSuitability.
 *
 * - **Blocked** — an allergen or an observed religious rule. The recipe is
 *   removed. It doesn't get ranked down, it doesn't appear greyed out with a
 *   warning you might tap through; it isn't offered.
 * - **Flagged** — an intolerance. The amount is the point and only you know
 *   your threshold, so the recipe stays and says what's in it.
 */

import {
  allergenBy, intoleranceBy, religiousBy, skillBy, timeBudgetBy,
} from '../data/preferences.js';
import {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  suitabilityReach,
  suitabilitySummary,
  suitabilityContextFrom,
} from './food-suitability.js';

const textOf = (recipe) => [
  recipe?.name,
  ...(recipe?.ingredients || []).map((i) => (typeof i === 'string' ? i : i.name)),
].filter(Boolean).join(' ');

const hits = (recipe, ids, table) => {
  const text = textOf(recipe);
  return ids
    .map((id) => table[id])
    .filter((rule) => rule && rule.match.test(text))
    .map((rule) => ({ id: rule.id, label: rule.label }));
};

/** Which of your allergens this recipe's ingredients name. */
export const allergenHits = (recipe, allergies = []) => hits(recipe, allergies, allergenBy);

/** Which of your intolerances it names — a flag, not a block. */
export const intoleranceHits = (recipe, intolerances = []) => hits(recipe, intolerances, intoleranceBy);

/** Which observed rule it breaks. */
export const religiousHits = (recipe, diets = []) => hits(recipe, diets, religiousBy);

/**
 * The hard lines: allergens and religious rules together. A recipe with any of
 * these is not shown, so this is the one function the filters must agree on.
 * (Diet-pattern excludes are handled by the central engine / goals.js.)
 */
export const blockedBy = (recipe, prefs = {}) => [
  ...allergenHits(recipe, prefs.allergies),
  ...religiousHits(recipe, prefs.religious),
];

export const isBlocked = (recipe, prefs = {}) => {
  // Use the central engine so diet patterns that live on the same prefs bag
  // are also respected when callers pass them through.
  const fit = evaluateFoodSuitability(recipe, suitabilityContextFrom(prefs));
  // Preserve historical behaviour for pure allergy/religious callers:
  // if the bag only has allergy/religious fields, blockers from diet are empty.
  return blockedBy(recipe, prefs).length > 0 || fit.blockers.some((b) => b.kind === 'allergy' || b.kind === 'religious');
};

/** Everything worth saying about a recipe and your preferences, in one pass. */
export const recipeFit = (recipe, prefs = {}) => {
  const fit = evaluateFoodSuitability(recipe, suitabilityContextFrom(prefs));
  const skill = skillBy[prefs.skill];
  const budget = timeBudgetBy[prefs.timeBudget];
  const steps = recipe?.steps?.length || 0;
  const minutes = Number(recipe?.time) || 0;
  return {
    blocked: blockedBy(recipe, prefs),
    flagged: intoleranceHits(recipe, prefs.intolerances),
    tooLong: Boolean(budget && Number.isFinite(budget.minutes) && minutes > budget.minutes),
    tooFiddly: Boolean(skill && Number.isFinite(skill.maxSteps) && steps > skill.maxSteps),
    favouriteCuisine: Boolean(recipe?.cuisine && (prefs.cuisines || []).includes(recipe.cuisine)),
    // Full structured result for new callers
    suitability: fit,
  };
};

/** Recipes you could actually be offered. Blocked ones never come back. */
export const allowedByPrefs = (recipes = [], prefs = {}) =>
  filterBySuitability(recipes, suitabilityContextFrom({
    ...prefs,
    // Historical allowedByPrefs only applied allergy + religious.
    // Diet patterns continue to be applied via goals.filterByDiet / the engine
    // when the full context is supplied by deriveApp.
    diets: prefs.diets || [],
  })).filter((r) => blockedBy(r, prefs).length === 0);

/**
 * Rank what's left: your cuisines first, then what fits the time and skill you
 * said you had, with flagged recipes last but still present.
 */
export const rankByPrefs = (recipes = [], prefs = {}) =>
  rankBySuitability(recipes, suitabilityContextFrom(prefs));

/**
 * How much of the recipe book your rules leave you. Worth showing: a set of
 * preferences that hides 95% of the book is something you'd want to know.
 */
export const reach = (recipes = [], prefs = {}) => suitabilityReach(recipes, suitabilityContextFrom(prefs));

/** The preference set in a sentence, for headers. */
export const prefsSummary = (prefs = {}) => suitabilitySummary(suitabilityContextFrom(prefs));

// Re-export the central API so new code can import from either module.
export {
  evaluateFoodSuitability,
  filterBySuitability,
  rankBySuitability,
  suitabilityContextFrom,
  suitabilityReach,
  suitabilitySummary,
} from './food-suitability.js';
