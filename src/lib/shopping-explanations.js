import { canonicalName } from './aliases.js';
import { leftoverCoverageForPlan } from './mealplan.js';
import { householdPortionsFor, scaleQty } from './portions.js';

const clean = (value) => String(value || '').trim();
const key = (value, aliases = {}) => canonicalName(value, aliases) || clean(value).toLowerCase();

export const shoppingExplanationFor = (item, state = {}) => {
  if (!item) return null;
  const aliases = state.aliasMemory || {};
  const allocations = item.allocations || [];
  const reasons = allocations.length
    ? allocations.map((row) => `${row.meal || row.recipe || 'Planned meal'}${row.date ? ` (${row.date})` : ''}: ${row.qty || 'needed'}`)
    : item.mealDependency
      ? [`Needed for ${item.mealDependency}`]
      : item.staple
        ? ['Predicted household staple restock']
        : item.manuallyRequested || item.manual
          ? ['Added by you']
          : ['Shopping list item'];
  return {
    name: item.name,
    qty: item.qty || '',
    reasons,
    mealCount: allocations.length,
    text: reasons.join(' · '),
    confidence: allocations.length ? 'planned' : item.staple ? 'predicted' : 'manual',
    key: key(item.name, aliases),
  };
};

export const addShoppingExplanations = (items = [], state = {}) => {
  const dates = Object.keys(state.plan || {}).sort().filter((date) => !state.day || date >= state.day);
  const entries = leftoverCoverageForPlan(state.plan || {}, dates, state.pantry || [], {
    people: householdPortionsFor(state).portions,
  });
  const grouped = new Map();
  for (const entry of entries) {
    if (entry.freshPortions <= 0) continue;
    const factor = entry.freshPortions / (entry.recipe.servings || 1);
    for (const ingredient of entry.recipe.ingredients || []) {
      const ingredientKey = key(ingredient.name, state.aliasMemory || {});
      if (!grouped.has(ingredientKey)) grouped.set(ingredientKey, []);
      grouped.get(ingredientKey).push({ meal: entry.recipe.name, recipe: entry.recipe.name, date: entry.date, qty: scaleQty(ingredient.qty, factor) });
    }
  }
  return items.map((item) => {
    // The current plan is authoritative for plan-derived rows. Their stored
    // allocations can outlive a removed dinner and make the list explain a
    // purchase using a meal that is no longer planned.
    const currentPlanAllocations = grouped.get(key(item.name, state.aliasMemory || {}));
    const planDerived = item.autoListed || item.fromRecipe || item.sourceRecipes?.length;
    const allocations = planDerived
      ? currentPlanAllocations || []
      : item.allocations?.length ? item.allocations : currentPlanAllocations || [];
    return { ...item, allocations, shoppingExplanation: shoppingExplanationFor({ ...item, allocations }, state) };
  });
};
