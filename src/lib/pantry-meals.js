import { addDays } from './kitchen-dates.js';
import { ingredientStock, pantryCoverage } from './recommend.js';
import { pantryConfidence } from './kitchen.js';

/**
 * "Cook from the cupboard": dinners you can make from stock you already
 * confirmed, needing at most one extra ingredient. Each suggestion gets the
 * earliest open dinner night in the next week; a night goes to one suggestion
 * and recipes already on the plan are skipped. Pantry rows of unknown
 * confidence are not counted, so nothing is promised that was only a guess.
 */
export const pantryMealSuggestions = ({
  recipes = [], pantry = [], plan = {}, day = '', max = 3, maxMissing = 1, minHave = 3,
} = {}) => {
  if (!day || !recipes.length) return [];
  const stock = ingredientStock(pantry).filter((p) => p?.name && pantryConfidence(p) !== 'unknown');
  if (!stock.length) return [];
  const names = stock.map((p) => p.name);
  const planned = new Set();
  for (const slots of Object.values(plan || {})) for (const id of Object.values(slots || {})) if (id) planned.add(id);
  const ranked = recipes
    .filter((r) => r?.id && !planned.has(r.id) && (r.ingredients || []).length)
    .map((recipe) => ({ recipe, cov: pantryCoverage(recipe, names) }))
    .filter(({ cov }) => cov.missing.length <= maxMissing && cov.have >= minHave)
    .sort((a, b) => a.cov.missing.length - b.cov.missing.length || b.cov.have - a.cov.have);
  const taken = new Set();
  const out = [];
  for (const { recipe, cov } of ranked) {
    let date = null;
    for (let i = 0; i <= 6; i += 1) {
      const d = addDays(day, i);
      if (!plan?.[d]?.dinner && !taken.has(d)) { date = d; break; }
    }
    if (!date) break;
    taken.add(date);
    out.push({
      recipe, date, tonight: date === day, have: cov.have, total: cov.total,
      missing: cov.missing.map((m) => m.name),
    });
    if (out.length >= max) break;
  }
  return out;
};
