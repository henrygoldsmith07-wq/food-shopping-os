/**
 * Swipe to build the week, and the week's cost at a glance (Herbi and
 * NeatEat patterns, adapted to Forq's honesty rules).
 *
 * The deck is the same ranking the recipe picker uses — favourites first,
 * then taste — filtered to dinners that fit the household's diets. A swipe
 * right fills the next open dinner from today onwards; a swipe left only
 * hides that recipe from this deck. Nothing is planned without a swipe, and
 * a dinner that is already decided is never replaced.
 */
import { filterByDiet } from './goals.js';
import { tasteScore } from './taste.js';

/** Dinners worth offering, best first, minus anything already decided or skipped. */
export function dinnerDeck(recipes = [], {
  favourites = [], tasteProfile = null, diets = [], skipped = [], planned = [],
} = {}) {
  const hidden = new Set([...skipped, ...planned]);
  const favs = new Set(favourites);
  return filterByDiet(recipes.filter((recipe) => recipe?.meal === 'dinner' && !hidden.has(recipe.id)), diets)
    .map((recipe, index) => ({ recipe, index, fav: favs.has(recipe.id), taste: tasteScore(recipe, tasteProfile) }))
    .sort((a, b) => Number(b.fav) - Number(a.fav) || b.taste - a.taste || a.index - b.index)
    .map(({ recipe }) => recipe);
}

/** The week's dates, from today on, whose dinner is still open. Past days are never filled. */
export function openDinnerDates(plan = {}, dates = [], today = '') {
  return dates.filter((date) => date >= today && !(plan?.[date]?.dinner));
}

/** Recipe ids already on the plan for these dates, so the deck does not offer them twice. */
export function plannedRecipeIds(plan = {}, dates = []) {
  const ids = new Set();
  for (const date of dates) {
    for (const id of Object.values(plan?.[date] || {})) if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * The week card's numbers. `cost` and `meals` come from planStats, so this
 * agrees with every other cost in the app; it only adds what the card shows:
 * which days have a dinner, and the average per person per meal.
 */
export function weekCostSummary({ cost = 0, meals = 0 } = {}, people = 1, plan = {}, dates = []) {
  const portions = Math.max(1, Number(people) || 1);
  const nights = dates.map((date) => ({ date, planned: Boolean(plan?.[date]?.dinner) }));
  return {
    cost: Math.max(0, Number(cost) || 0),
    meals: Math.max(0, Number(meals) || 0),
    perServing: meals > 0 ? Math.round((cost / (meals * portions)) * 100) / 100 : 0,
    nights,
    dinnersPlanned: nights.filter((night) => night.planned).length,
  };
}
