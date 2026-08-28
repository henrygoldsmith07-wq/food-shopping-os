import { canonicalName } from './aliases.js';
import { planEntries } from './mealplan.js';

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
  const entries = planEntries(state.plan || {}, Object.keys(state.plan || {}).sort());
  const grouped = new Map();
  for (const entry of entries) {
    for (const ingredient of entry.recipe.ingredients || []) {
      const ingredientKey = key(ingredient.name, state.aliasMemory || {});
      if (!grouped.has(ingredientKey)) grouped.set(ingredientKey, []);
      grouped.get(ingredientKey).push({ meal: entry.recipe.name, recipe: entry.recipe.name, date: entry.date, qty: ingredient.qty });
    }
  }
  return items.map((item) => {
    const allocations = item.allocations?.length ? item.allocations : grouped.get(key(item.name, state.aliasMemory || {})) || [];
    return { ...item, allocations, shoppingExplanation: shoppingExplanationFor({ ...item, allocations }, state) };
  });
};
