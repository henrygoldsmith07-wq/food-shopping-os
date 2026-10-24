import { normalize, pantryCoverage } from './recommend.js';

/**
 * "Use it up": rank diet-safe recipes by how many use-soon pantry items
 * they consume. The rows are already vetted by `useSoonIngredients` (past
 * their date or inside the window), so no date is re-checked here — this
 * only matches ingredient names, with the same substring rule as the rest
 * of the app.
 *
 * Lives apart from `recommend.js` on purpose: the Home tonight-card needs
 * that module in the first paint, but these matches only ever render inside
 * the lazily-loaded Plan tab — so they travel with it, not with the week
 * screen. See the performance-budget notes in docs/ARCHITECTURE.md.
 *
 * Returns [{ recipe, used, coverage }] sorted by most use-soon items
 * consumed, then the soonest-expiring item saved (already-past first), then pantry coverage, then shortest cook. The caller decides
 * how many to show.
 */
export const getUseItUpMatches = (recipes = [], { useSoonRows = [], pantry = [], max = 3 } = {}) => {
  const daysByName = new Map();
  for (const row of useSoonRows) {
    if (row?.item?.name) daysByName.set(row.item.name, Number.isFinite(row.daysLeft) ? row.daysLeft : 999);
  }
  const soonItems = useSoonRows.map((row) => row?.item).filter((item) => item && item.name);
  if (!soonItems.length || !recipes.length) return [];
  const pantryNames = (pantry.length ? pantry : soonItems).map((item) => item.name);
  const matchesItem = (ingredientName, item) => {
    const wanted = normalize(ingredientName);
    const stocked = normalize(item.name);
    if (!wanted || !stocked) return false;
    return stocked === wanted
      || (Math.min(stocked.length, wanted.length) >= 4 && (stocked.includes(wanted) || wanted.includes(stocked)));
  };
  return recipes
    .map((recipe) => {
      const seen = new Set();
      const used = [];
      for (const ing of recipe.ingredients || []) {
        const hit = soonItems.find((item) => !seen.has(normalize(item.name)) && matchesItem(ing.name, item));
        if (hit) {
          seen.add(normalize(hit.name));
          used.push(hit.name);
        }
      }
      if (!used.length) return null;
      const urgency = Math.min(...used.map((name) => daysByName.get(name) ?? 999));
      return { recipe, used, urgency, coverage: pantryCoverage(recipe, pantryNames) };
    })
    .filter(Boolean)
    .sort((a, b) => b.used.length - a.used.length
      || a.urgency - b.urgency
      || b.coverage.pct - a.coverage.pct
      || (Number(a.recipe.time) || 999) - (Number(b.recipe.time) || 999))
    .slice(0, Math.max(0, max));
};

/** Backwards-compatible alias: existing callers import this name. */
export const useItUpMatches = getUseItUpMatches;
