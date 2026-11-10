import { addDays } from './kitchen-dates.js';

/** Days cooked food stays good in the fridge; lunch must fall inside it. */
export const COOK_TWICE_SAFE_DAYS = 3;

/**
 * Cook once, eat twice: a planned dinner whose recipe makes at least two
 * rounds of portions for the household can cover the next day's lunch too.
 * Offered only when the lunch slot is free, the dish is not already planned
 * again inside the fridge window, and its default batch can feed both meals
 * (recipe.servings >= 2 x people). Recipe capacity is not confirmed leftovers:
 * shopping counts both slots, subtracting only recorded leftover portions.
 */
export const cookTwiceOffers = ({ plan = {}, recipes = [], people = 1, day = '', within = 5, limit = 3 } = {}) => {
  if (!day) return [];
  const eaters = Math.max(1, Math.round(Number(people) || 1));
  const byId = new Map((recipes || []).map((r) => [r?.id, r]));
  const out = [];
  for (let i = 0; i <= within && out.length < limit; i += 1) {
    const date = addDays(day, i);
    const recipe = byId.get(plan?.[date]?.dinner);
    if (!recipe || (Number(recipe.servings) || 0) < eaters * 2) continue;
    const lunchDate = addDays(date, 1);
    if (plan?.[lunchDate]?.lunch) continue;
    let repeated = false;
    for (let k = -COOK_TWICE_SAFE_DAYS; k <= COOK_TWICE_SAFE_DAYS; k += 1) {
      const d = addDays(date, k);
      for (const [slot, id] of Object.entries(plan?.[d] || {})) {
        if (id === recipe.id && !(d === date && slot === 'dinner')) repeated = true;
      }
    }
    if (repeated || out.some((o) => o.recipe.id === recipe.id)) continue;
    out.push({ recipe, cookDate: date, lunchDate, extraPortions: Number(recipe.servings) - eaters, daysAway: i });
  }
  return out;
};
