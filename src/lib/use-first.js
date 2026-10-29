import { daysUntil } from './kitchen-dates.js';
import { pantryConfidence } from './kitchen.js';
import { expiringIngredients } from './recommend.js';

/**
 * "Use first": the few pantry items that go off soonest, each with the one
 * recipe that uses it up with the least else to buy. Nothing is invented: an
 * item no recipe in the book uses still shows (with recipe null), and rows
 * whose stock we are unsure of are skipped, like the rest of the expiry cards.
 * Tie-break for the recipe: more of the item's expiring neighbours used, then
 * the shortest ingredient list.
 */
export const useFirstItems = ({ pantry = [], recipes = [], day = '', within = 4, max = 3 } = {}) => {
  if (!day) return [];
  const rows = (pantry || [])
    .filter((p) => p && p.name && p.expiry && pantryConfidence(p) !== 'unknown')
    .map((item) => ({ item, daysLeft: daysUntil(item.expiry, day) }))
    .filter((r) => Number.isFinite(r.daysLeft) && r.daysLeft <= within && r.daysLeft >= -1)
    .sort((a, b) => a.daysLeft - b.daysLeft || String(a.item.name).localeCompare(String(b.item.name)))
    .slice(0, max);
  return rows.map(({ item, daysLeft }) => {
    let best = null;
    for (const recipe of recipes || []) {
      const hits = expiringIngredients(recipe, pantry.filter((p) => p && p.expiry), day, within);
      if (!hits.some((h) => h.pantryItem === item || h.pantryItem?.id === item.id)) continue;
      const score = [hits.length, -(recipe.ingredients?.length || 0)];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
        best = { recipe, score, alsoUses: hits.filter((h) => h.pantryItem !== item).map((h) => h.pantryItem.name) };
      }
    }
    return { item, daysLeft, recipe: best?.recipe || null, alsoUses: best?.alsoUses || [] };
  });
};

export const useFirstWhen = (n) => (n < 0 ? 'overdue' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
