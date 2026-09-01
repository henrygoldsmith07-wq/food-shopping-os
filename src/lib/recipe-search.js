export const RECIPE_TAGS = [
  'quick', 'budget', 'healthy', 'light', 'high-protein', 'high-fibre', 'low-carb',
  'family', 'one-pot', 'batch', 'meal-prep', 'freezer', 'reheatable', 'air-fryer',
  'slow-cooker', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'breakfast',
  'lunch', 'dinner', 'snack', 'comfort', 'date-night', 'spicy', 'kid-friendly',
  'gluten-free', 'dairy-free', 'low-carb', 'family', 'batch', 'budget', 'healthy',
];

export const enrichRecipeTags = (recipe) => ({
  ...recipe,
  tags: [...new Set([
    ...(recipe.tags || []),
    ...(recipe.kcal <= 450 ? ['light'] : []),
    ...(recipe.time <= 20 ? ['quick'] : []),
    ...(recipe.protein >= 30 ? ['high-protein'] : []),
    ...(recipe.fibre >= 8 ? ['high-fibre'] : []),
    ...(recipe.meal ? [recipe.meal] : []),
  ])],
});

export const searchAndSortRecipes = (recipes = [], { query = '', sort = 'relevance' } = {}) => {
  const term = query.trim().toLowerCase();
  const filtered = recipes.map(enrichRecipeTags).filter((recipe) => {
    if (!term) return true;
    const haystack = [recipe.name, recipe.cuisine, recipe.meal, ...(recipe.tags || []), ...(recipe.ingredients || []).map((i) => i.name)].join(' ').toLowerCase();
    return haystack.includes(term);
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'time') return a.time - b.time || a.name.localeCompare(b.name);
    if (sort === 'calories') return a.kcal - b.kcal || a.name.localeCompare(b.name);
    if (sort === 'protein') return b.protein - a.protein || a.name.localeCompare(b.name);
    if (sort === 'cost') return a.costPerServing - b.costPerServing || a.name.localeCompare(b.name);
    if (sort === 'health') return b.healthScore - a.healthScore || a.name.localeCompare(b.name);
    return (term ? Number(b.name.toLowerCase().startsWith(term)) - Number(a.name.toLowerCase().startsWith(term)) : 0) || a.name.localeCompare(b.name);
  });
};
