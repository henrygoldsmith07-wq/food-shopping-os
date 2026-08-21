const VERDICT_WEIGHT = { nope: -3, like: 1, love: 3 };

const ranked = (scores) => Object.entries(scores)
  .filter(([, score]) => score > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([name]) => name);

export const buildTasteProfile = (recipes = [], ratings = {}, favourites = [], cooked = []) => {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const cuisines = {};
  const tags = {};
  const merged = { ...Object.fromEntries(favourites.map((id) => [id, 'like'])), ...ratings };

  Object.entries(merged).forEach(([id, verdict]) => {
    const recipe = byId.get(id);
    const weight = VERDICT_WEIGHT[verdict] || 0;
    if (!recipe || !weight) return;
    if (recipe.cuisine) cuisines[recipe.cuisine] = (cuisines[recipe.cuisine] || 0) + weight;
    (recipe.tags || []).forEach((tag) => {
      tags[tag] = (tags[tag] || 0) + weight;
    });
  });

  // Cooking is a softer signal than an explicit rating, but repeated choices
  // are still useful household preference evidence. It nudges cuisines and
  // tags without turning one cooked meal into a verdict.
  for (const entry of cooked || []) {
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    if (recipe.cuisine) cuisines[recipe.cuisine] = (cuisines[recipe.cuisine] || 0) + 0.5;
    (recipe.tags || []).forEach((tag) => {
      tags[tag] = (tags[tag] || 0) + 0.25;
    });
  }

  return {
    ratings: merged,
    rated: Object.keys(merged).length,
    cuisines,
    tags,
    topCuisines: ranked(cuisines),
    topTags: ranked(tags),
    cookedMeals: cooked?.length || 0,
    learnedFromCooking: (cooked?.length || 0) > 0,
  };
};

export const tasteScore = (recipe, profile) => {
  if (!profile?.rated) return 0;
  const direct = VERDICT_WEIGHT[profile.ratings?.[recipe.id]] || 0;
  return direct * 6
    + (profile.cuisines?.[recipe.cuisine] || 0) * 2
    + (recipe.tags || []).reduce((score, tag) => score + (profile.tags?.[tag] || 0), 0);
};

export const buildTasteDeck = (recipes = [], ratings = {}, limit = 24) =>
  recipes.filter((recipe) => !ratings[recipe.id]).slice(0, limit);
