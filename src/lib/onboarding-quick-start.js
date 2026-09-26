import { mergeQtys } from './pantry.js';
import { scaleQty } from './portions.js';

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
  const people = Math.max(1, Number(household) || 1);
  const shoppingByIngredient = new Map();
  for (const recipe of meals) {
    const servings = Math.max(1, Number(recipe.servings) || 1);
    const factor = people / servings;
    for (const ingredient of recipe.ingredients || []) {
      const name = String(ingredient?.name || ingredient || '').trim();
      if (!name) continue;
      const key = name.toLowerCase().replace(/\s+/g, ' ');
      const qty = scaleQty(ingredient?.qty || '1', factor);
      const existing = shoppingByIngredient.get(key);
      if (!existing) {
        const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        shoppingByIngredient.set(key, {
          id: `starter-${slug || shoppingByIngredient.size + 1}`,
          name,
          qty,
          fromRecipe: recipe.name,
          sourceRecipes: [recipe.name],
          autoListed: true,
        });
        continue;
      }
      shoppingByIngredient.set(key, {
        ...existing,
        qty: mergeQtys(existing.qty, qty, { ingredient: key }),
        sourceRecipes: existing.sourceRecipes.includes(recipe.name)
          ? existing.sourceRecipes
          : [...existing.sourceRecipes, recipe.name],
      });
    }
  }
  const shoppingList = [...shoppingByIngredient.values()];
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
