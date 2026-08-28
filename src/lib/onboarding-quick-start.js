export const QUICK_START_DEFAULTS = {
  household: 1,
  weeklyBudget: 0,
  shoppingDay: 'Saturday',
  typicalCookingMinutes: 30,
  shops: [],
  favouriteMeals: [],
  dislikedFoods: [],
};

const nextDay = (date, offset) => {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + offset);
  return result.toISOString().slice(0, 10);
};

/** Turn the small set of onboarding answers into an immediately useful start. */
export const firstSessionPlan = ({ day, recipes = [], pickedRecipeIds = [], household = 1, budget = 0 } = {}) => {
  const picked = pickedRecipeIds.map((id) => recipes.find((recipe) => recipe.id === id)).filter(Boolean);
  const meals = picked.length ? picked : recipes.filter((recipe) => recipe.meal === 'dinner').slice(0, 3);
  const plan = Object.fromEntries(meals.map((recipe, index) => [nextDay(day, index), { dinner: recipe.id }]));
  const shoppingList = [...new Map(meals.flatMap((recipe) => (recipe.ingredients || []).map((ingredient) => [
    String(ingredient.name || ingredient).toLowerCase(),
    { name: ingredient.name || ingredient, qty: ingredient.qty || '1', fromRecipe: recipe.name, autoListed: true },
  ])).map(([key, item]) => [key, item])).values()];
  return {
    plan,
    shoppingList,
    summary: meals.length
      ? `${meals.length} meals planned and a shopping list ready for ${household} person${household === 1 ? '' : 's'}.`
      : 'Your first plan is ready when you choose a meal.',
    budget: Number(budget) || 0,
    evidence: ['your household size', 'your dietary choices', 'your first meal picks'],
  };
};
