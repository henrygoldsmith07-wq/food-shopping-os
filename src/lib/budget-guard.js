import { planEntries } from './mealplan.js';

const round2 = (n) => Math.round(n * 100) / 100;
const MIN_SAVING = 0.2; // per serving: below this a swap is noise, not a saving

const fitsSlot = (recipe, slot) => {
  const breakfast = (recipe.tags || []).includes('breakfast');
  return slot === 'breakfast' ? breakfast : !breakfast;
};

/**
 * Week budget guard. Compares what the planned week costs (the same
 * costPerServing × portions planStats quotes) with the weekly budget, and when
 * it is over, proposes the fewest swaps that bring it back under: each is a
 * cheaper recipe for the same kind of slot that keeps at least 80% of the
 * protein. Recipes already in the week are not suggested again, a slot is
 * swapped once, and the biggest saving goes first. If no set of swaps closes
 * the gap, `closes` is false and the card says how far the swaps get you.
 */
export const budgetGuard = ({
  plan = {}, dates = [], people = 1, budget = 0, recipes = [], maxSwaps = 3,
} = {}) => {
  const limit = Number(budget) || 0;
  const portions = Math.max(1, Number(people) || 1);
  const entries = planEntries(plan, dates);
  const cost = round2(entries.reduce((s, e) => s + (Number(e.recipe.costPerServing) || 0) * portions, 0));
  if (!(limit > 0) || !entries.length) return { cost, budget: limit, over: 0, swaps: [], saving: 0, closes: false, active: false };
  const over = round2(cost - limit);
  if (over <= 0) return { cost, budget: limit, over, swaps: [], saving: 0, closes: false, active: false };
  const inWeek = new Set(entries.map((e) => e.recipeId));
  const used = new Set();
  const options = [];
  for (const entry of entries) {
    const from = entry.recipe;
    const price = Number(from.costPerServing) || 0;
    let best = null;
    for (const r of recipes) {
      if (!r?.id || inWeek.has(r.id) || !fitsSlot(r, entry.slot)) continue;
      const cheaper = price - (Number(r.costPerServing) || 0);
      if (cheaper < MIN_SAVING || !(Number(r.costPerServing) > 0)) continue;
      if ((Number(r.protein) || 0) < (Number(from.protein) || 0) * 0.8) continue;
      if (!best || cheaper > best.cheaper) best = { r, cheaper };
    }
    if (best) {
      options.push({
        date: entry.date, slot: entry.slot, from, to: best.r, saving: round2(best.cheaper * portions),
      });
    }
  }
  options.sort((a, b) => b.saving - a.saving);
  const swaps = [];
  let saving = 0;
  for (const o of options) {
    if (swaps.length >= maxSwaps || saving >= over) break;
    if (used.has(o.to.id)) continue;
    used.add(o.to.id);
    swaps.push(o);
    saving = round2(saving + o.saving);
  }
  return { cost, budget: limit, over, swaps, saving, closes: saving >= over, active: true };
};
