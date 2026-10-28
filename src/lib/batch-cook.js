/**
 * Batch-cook day: two different planned dinners that share real ingredients can
 * be prepped in one session — chop the shared veg once, use one oven, wash up
 * once. Pure: no I/O, no invented data (times come from the recipes' own prep).
 */
const STAPLES = new Set(['salt', 'pepper', 'water', 'oil', 'olive oil', 'sugar', 'butter', 'flour', 'stock', 'ice']);

export const ingredientKey = (name = '') => {
  const k = String(name).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return k.endsWith('es') && /(tomat|potat)oes$/.test(k) ? k.slice(0, -2) : k.replace(/s$/, '');
};

const keysOf = (recipe) => {
  const map = new Map();
  for (const ing of recipe?.ingredients || []) {
    const key = ingredientKey(ing?.name);
    if (key && !STAPLES.has(key) && !map.has(key)) map.set(key, ing.name);
  }
  return map;
};

/** Recipes in the plan for `dates` (cooked meals only), first date each appears. */
export function plannedRecipes(plan = {}, dates = [], byId = new Map(), slots = ['dinner', 'lunch']) {
  const seen = new Map();
  for (const date of dates) {
    for (const slot of slots) {
      const recipe = byId.get(plan?.[date]?.[slot]);
      if (recipe && !seen.has(recipe.id)) seen.set(recipe.id, { recipe, date, slot });
    }
  }
  return [...seen.values()];
}

/**
 * Pairs of different recipes sharing ≥2 non-staple ingredients, best first.
 * minutesSaved is the shorter prep time: shared prep is done once, not twice.
 */
export function batchCookPairs(plan, dates, byId, { limit = 3, minShared = 2 } = {}) {
  const items = plannedRecipes(plan, dates, byId);
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const ka = keysOf(a.recipe);
      const kb = keysOf(b.recipe);
      const shared = [...ka.keys()].filter((k) => kb.has(k)).map((k) => ka.get(k));
      if (shared.length < minShared) continue;
      const prepA = Number(a.recipe.prep) || 0;
      const prepB = Number(b.recipe.prep) || 0;
      const minutesSaved = Math.min(prepA, prepB);
      pairs.push({
        id: `${a.recipe.id}+${b.recipe.id}`,
        recipes: [a, b],
        shared,
        minutesSaved,
        steps: [
          `Prep once for both: ${shared.join(', ')}`,
          `Cook ${a.recipe.name} (${a.date}) and ${b.recipe.name} (${b.date}) in the same session`,
          'Cool, portion and label the second dish for the fridge or freezer',
        ],
      });
    }
  }
  return pairs
    .sort((x, y) => y.shared.length - x.shared.length || y.minutesSaved - x.minutesSaved || x.id.localeCompare(y.id))
    .slice(0, limit);
}
