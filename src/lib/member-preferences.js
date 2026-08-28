const clamp = (value, min = 0, max = 5) => Math.max(min, Math.min(max, Number(value) || 0));
const normalise = (value) => String(value || '').trim().toLowerCase();
const scoreValue = (value) => {
  const named = { nope: 1, dislike: 1, okay: 3, like: 4, love: 5, favourite: 5 }[normalise(value)];
  return named ?? clamp(value);
};
const confidence = (n) => n >= 6 ? 'high' : n >= 2 ? 'medium' : 'low';

export const memberPreferenceProfiles = ({ members = [], recipes = [], events = [], ratings = {} } = {}) => {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return members.map((member) => {
    const relevant = events.filter((event) => event.memberId === member.id);
    const rows = recipes.map((recipe) => {
      const values = relevant.filter((event) => event.recipeId === recipe.id).map((event) => scoreValue(event.rating ?? event.taste ?? ratings[recipe.id]));
      const explicit = member.recipeRatings?.[recipe.id] ?? member.ratings?.[recipe.id];
      if (explicit !== undefined) values.push(scoreValue(explicit));
      if (!values.length) return null;
      return { recipeId: recipe.id, score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100, observations: values.length, confidence: confidence(values.length) };
    }).filter(Boolean);
    const byCuisine = new Map();
    rows.forEach((row) => {
      const cuisine = normalise(recipeMap.get(row.recipeId)?.cuisine);
      if (cuisine) byCuisine.set(cuisine, [...(byCuisine.get(cuisine) || []), row.score]);
    });
    return {
      memberId: member.id,
      name: member.name || 'Household member',
      diets: member.diets || [],
      allergies: member.allergies || [],
      dislikes: member.dislikes || [],
      recipes: rows,
      cuisines: [...byCuisine.entries()].map(([key, values]) => ({ key, score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100, observations: values.length })).sort((a, b) => b.score - a.score),
    };
  });
};

/** Aggregate a recipe across members; fairness penalises repeatedly ignoring the lowest scorer. */
export const groupMealScore = (recipe, profiles = [], { weights = {}, recentRecipeIds = [] } = {}) => {
  if (!profiles.length) return { score: 0, average: null, minimum: null, memberScores: [], explanation: null };
  const memberScores = profiles.map((profile) => {
    const row = profile.recipes.find((item) => item.recipeId === recipe.id);
    const score = row?.score ?? 3;
    return { memberId: profile.memberId, name: profile.name, score, confidence: row?.confidence || 'low' };
  });
  const totalWeight = memberScores.reduce((sum, row) => sum + (Number(weights[row.memberId]) || 1), 0) || 1;
  const average = memberScores.reduce((sum, row) => sum + row.score * (Number(weights[row.memberId]) || 1), 0) / totalWeight;
  const minimum = Math.min(...memberScores.map((row) => row.score));
  const repetitionPenalty = recentRecipeIds.filter((id) => id === recipe.id).length * 0.35;
  const score = Math.round((average * 0.65 + minimum * 0.35 - repetitionPenalty) * 100) / 100;
  const lowest = memberScores.find((row) => row.score === minimum);
  return {
    score,
    average: Math.round(average * 100) / 100,
    minimum,
    memberScores,
    repetitionPenalty,
    explanation: lowest && minimum < average - 1 ? `Balances the group while avoiding another repeat; ${lowest.name} is less enthusiastic.` : 'A strong shared fit for the household.',
  };
};

export const rankGroupMeals = (recipes = [], profiles = [], options = {}) => recipes.map((recipe) => ({ recipe, group: groupMealScore(recipe, profiles, options) })).sort((a, b) => b.group.score - a.group.score);
