const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const text = (value) => String(value || '').trim().toLowerCase();
const dayOfWeek = (date) => new Date(`${String(date).slice(0, 10)}T12:00:00`).getDay();

export const PREFERENCE_SIGNALS = ['eating', 'cooking', 'cuisine', 'ingredient', 'combination', 'leftover', 'budget', 'portion'];

const emptyProfile = (key) => ({
  key,
  observations: 0,
  eatingScore: 0,
  cookingScore: 0,
  preferenceScore: 0,
  confidence: 'low',
});

const confidenceFor = (observations) => observations >= 8 ? 'high' : observations >= 3 ? 'medium' : 'low';
const add = (map, key, values) => {
  if (!key) return;
  const row = map.get(key) || emptyProfile(key);
  row.observations += 1;
  Object.entries(values).forEach(([field, value]) => { row[field] = (row[field] || 0) + value; });
  map.set(key, row);
};
const finish = (map) => [...map.values()].map((row) => ({
  ...row,
  eatingScore: Math.round((row.eatingScore / row.observations) * 100) / 100,
  cookingScore: Math.round((row.cookingScore / row.observations) * 100) / 100,
  preferenceScore: Math.round((row.preferenceScore / row.observations) * 100) / 100,
  confidence: confidenceFor(row.observations),
})).sort((a, b) => b.preferenceScore - a.preferenceScore);

const ratingValue = (value) => {
  const named = { nope: -1, dislike: -1, okay: 0.2, like: 0.7, love: 1, favourite: 1 }[text(value)];
  if (named !== undefined) return named;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / 5 : 0;
};

/**
 * Learn soft preferences from actual outcomes. `eatingScore` comes from taste
 * feedback or repeat cooking; `cookingScore` comes from time/effort feedback.
 * They deliberately remain separate so a beloved long recipe is not offered on
 * a busy weekday.
 */
export const learnHouseholdPreferences = ({ recipes = [], cooked = [], ratings = {}, cookingTimeHistory = [], feedback = [], waste = [], today } = {}) => {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const cuisines = new Map();
  const ingredients = new Map();
  const combinations = new Map();
  const recipeProfiles = new Map();
  const weekdays = { weekday: { observations: 0, eating: 0, cooking: 0 }, weekend: { observations: 0, eating: 0, cooking: 0 } };
  const timeBuckets = new Map();
  const portionPatterns = [];
  const leftoverPreference = { offered: 0, accepted: 0, eaten: 0 };
  let budgetSensitivity = 0;

  for (const event of [...cooked, ...feedback]) {
    const recipe = byId.get(event.recipeId) || event.recipe;
    if (!recipe) continue;
    const rating = ratingValue(event.rating ?? event.taste ?? ratings[recipe.id]);
    const actual = Number(event.actualMins ?? event.cookingMinutes ?? 0);
    const estimated = Number(event.estimatedMins ?? recipe.time ?? actual);
    const cooking = event.cookingRating !== undefined
      ? ratingValue(event.cookingRating)
      : actual ? clamp(1 - ((actual - estimated) / Math.max(estimated, 1)), -1, 1) : 0;
    const date = event.date || today;
    const period = date !== undefined && [0, 6].includes(dayOfWeek(date)) ? 'weekend' : 'weekday';
    weekdays[period].observations += 1;
    weekdays[period].eating += rating;
    weekdays[period].cooking += cooking;
    const time = Math.round((actual || recipe.time || 0) / 15) * 15;
    if (time) timeBuckets.set(time, (timeBuckets.get(time) || 0) + 1);
    const cuisinesForRecipe = [recipe.cuisine, ...(recipe.cuisines || [])].map(text).filter(Boolean);
    cuisinesForRecipe.forEach((key) => add(cuisines, key, { eatingScore: rating, cookingScore: cooking, preferenceScore: rating * 0.7 + cooking * 0.3 }));
    const names = (recipe.ingredients || []).map((item) => text(item.name || item)).filter(Boolean);
    names.forEach((key) => add(ingredients, key, { eatingScore: rating, cookingScore: cooking, preferenceScore: rating * 0.7 + cooking * 0.3 }));
    [...new Set(names)].forEach((key) => combinations.set(key, (combinations.get(key) || 0) + rating));
    add(recipeProfiles, recipe.id, { eatingScore: rating, cookingScore: cooking, preferenceScore: rating * 0.7 + cooking * 0.3 });
    if (event.portionsEaten || event.portions) portionPatterns.push(Number(event.portionsEaten ?? event.portions));
    if (event.leftoverOffered) leftoverPreference.offered += 1;
    if (event.leftoverAccepted) leftoverPreference.accepted += 1;
    if (event.leftoverEaten) leftoverPreference.eaten += 1;
    if (event.cost !== undefined && event.budget !== undefined) budgetSensitivity += Number(event.cost) > Number(event.budget) ? -1 : 1;
  }

  waste.filter((item) => item.reason === 'disliked').forEach((item) => add(ingredients, text(item.name), { eatingScore: -1, cookingScore: 0, preferenceScore: -1 }));
  const weekday = weekdays.weekday.observations ? { observations: weekdays.weekday.observations, eating: weekdays.weekday.eating / weekdays.weekday.observations, cooking: weekdays.weekday.cooking / weekdays.weekday.observations } : null;
  const weekend = weekdays.weekend.observations ? { observations: weekdays.weekend.observations, eating: weekdays.weekend.eating / weekdays.weekend.observations, cooking: weekdays.weekend.cooking / weekdays.weekend.observations } : null;
  const preferredTime = [...timeBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    cuisines: finish(cuisines),
    ingredients: finish(ingredients),
    recipes: finish(recipeProfiles),
    combinations: [...combinations.entries()].map(([key, score]) => ({ key, score: Math.round(score * 100) / 100 })),
    weekday,
    weekend,
    cookingTime: { preferredMinutes: preferredTime, observations: [...timeBuckets.values()].reduce((a, b) => a + b, 0), confidence: confidenceFor([...timeBuckets.values()].reduce((a, b) => a + b, 0)) },
    portions: { typical: portionPatterns.length ? Math.round((portionPatterns.reduce((a, b) => a + b, 0) / portionPatterns.length) * 10) / 10 : null, observations: portionPatterns.length },
    leftovers: { ...leftoverPreference, acceptanceRate: leftoverPreference.offered ? Math.round((leftoverPreference.accepted / leftoverPreference.offered) * 100) : null },
    budgetSensitivity: budgetSensitivity ? Math.round((budgetSensitivity / Math.max(1, cooked.length)) * 100) / 100 : null,
    generatedAt: today || null,
  };
};

export const cookingFitFor = (recipe, profile, { weekday = false, availableMinutes = null } = {}) => {
  const row = profile?.recipes?.find((item) => item.key === recipe?.id);
  const learnedTime = profile?.cookingTime?.preferredMinutes;
  const limit = availableMinutes || (weekday ? 30 : null);
  const minutes = Number(recipe?.time || 0);
  const eating = row?.eatingScore ?? 0;
  const cooking = row?.cookingScore ?? 0;
  const timeFit = limit ? (minutes <= limit ? 1 : -Math.min(1, (minutes - limit) / Math.max(limit, 1))) : learnedTime ? 1 - Math.min(1, Math.abs(minutes - learnedTime) / Math.max(learnedTime, 1)) : 0.5;
  return {
    eatingScore: eating,
    cookingScore: cooking,
    timeFit: Math.round(timeFit * 100) / 100,
    score: Math.round((eating * 0.48 + cooking * 0.27 + timeFit * 0.25) * 100) / 100,
    explanation: eating > cooking + 0.35 && minutes > 45 ? 'Loved eating, but slower to cook — better for a relaxed day.' : cooking > 0.5 ? 'Fits how this household likes to cook.' : null,
  };
};

export const preferenceSummary = (profile) => {
  if (!profile) return null;
  const cuisine = profile.cuisines?.[0]?.key;
  const ingredient = profile.ingredients?.[0]?.key;
  return {
    headline: cuisine ? `Leaning towards ${cuisine} meals` : 'Learning household tastes',
    detail: ingredient ? `Strongest ingredient signal: ${ingredient}.` : 'More cooking and eating feedback will sharpen recommendations.',
    cookingNote: profile.cookingTime?.preferredMinutes ? `Usually happiest around ${profile.cookingTime.preferredMinutes} minutes of cooking.` : null,
  };
};
