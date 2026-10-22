const normalise = (value) => String(value || '').toLowerCase().trim();
const ingredientName = (ingredient) => normalise(typeof ingredient === 'string' ? ingredient : ingredient?.name);

export const RECIPE_TAGS = [
  'quick', 'budget', 'healthy', 'light', 'high-protein', 'high-fibre', 'low-carb',
  'family', 'one-pot', 'batch', 'meal-prep', 'freezer', 'reheatable', 'air-fryer',
  'slow-cooker', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'breakfast',
  'lunch', 'dinner', 'snack', 'comfort', 'date-night', 'spicy', 'kid-friendly',
  'gluten-free', 'dairy-free', 'low-carb', 'family', 'batch', 'budget', 'healthy',
];

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const finite = (v, fallback) => (Number.isFinite(num(v)) ? num(v) : fallback);
const atMost = (v, max) => Number.isFinite(num(v)) && num(v) <= max;
const atLeast = (v, min) => Number.isFinite(num(v)) && num(v) >= min;

export const enrichRecipeTags = (recipe) => ({
  ...recipe,
  tags: [...new Set([
    ...(recipe.tags || []),
    ...(atMost(recipe.kcal, 450) ? ['light'] : []),
    ...(atMost(recipe.time, 20) ? ['quick'] : []),
    ...(atLeast(recipe.protein, 30) ? ['high-protein'] : []),
    ...(atLeast(recipe.fibre, 8) ? ['high-fibre'] : []),
    ...(recipe.meal ? [recipe.meal] : []),
  ])],
});

export const searchAndSortRecipes = (recipes = [], { query = '', sort = 'relevance' } = {}) => {
  const term = query.trim().toLowerCase();
  const filtered = recipes.map(enrichRecipeTags).filter((recipe) => {
    if (!term) return true;
    const haystack = [recipe.name, recipe.cuisine, recipe.meal, ...(recipe.tags || []), ...(recipe.ingredients || []).map(ingredientName)].map(normalise).join(' ');
    const terms = term.split(/\s+/).filter(Boolean);
    return terms.every((token) => haystack.includes(token));
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'time') return (Number(a.time) || Infinity) - (Number(b.time) || Infinity) || a.name.localeCompare(b.name);
    if (sort === 'calories') return (Number(a.kcal) || Infinity) - (Number(b.kcal) || Infinity) || a.name.localeCompare(b.name);
    if (sort === 'protein') return (Number(b.protein) || 0) - (Number(a.protein) || 0) || a.name.localeCompare(b.name);
    if (sort === 'cost') return (finite(a.costPerServing, Infinity) - finite(b.costPerServing, Infinity) || 0) || a.name.localeCompare(b.name);

    if (sort === 'health') return (finite(b.healthScore, -Infinity) === finite(a.healthScore, -Infinity) ? 0 : finite(b.healthScore, -Infinity) > finite(a.healthScore, -Infinity) ? 1 : -1) || a.name.localeCompare(b.name);
    return (term ? Number(b.name.toLowerCase().startsWith(term)) - Number(a.name.toLowerCase().startsWith(term)) : 0) || a.name.localeCompare(b.name);
  });
};
