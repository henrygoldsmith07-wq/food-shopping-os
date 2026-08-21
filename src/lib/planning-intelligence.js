import { dayStamp, daysUntil, freshnessOf } from './kitchen.js';
import { planEntries } from './mealplan.js';

export const SKIP_REASONS = [
  { id: 'no-time', label: 'Not enough time' },
  { id: 'ingredients-missing', label: 'Ingredients missing' },
  { id: 'changed-preference', label: 'Changed preference' },
  { id: 'leftovers-available', label: 'Leftovers available' },
  { id: 'plan-too-complex', label: 'Plan too complex' },
  { id: 'not-in-the-mood', label: 'Not in the mood' },
  { id: 'plans-changed', label: 'Plans changed' },
  { id: 'ate-something-else', label: 'Ate something else' },
  { id: 'takeaway', label: 'Takeaway / ate out' },
  { id: 'cooked-a-different-meal', label: 'Cooked a different meal' },
  { id: 'other', label: 'Something else' },
];

const reasonById = new Map(SKIP_REASONS.map((reason) => [reason.id, reason.label]));

export const skipReasonLabel = (reason) => reasonById.get(reason) || 'Something else';

const datedFreshness = (item, today) => {
  const daysLeft = item?.expiry ? daysUntil(item.expiry, today) : null;
  if (daysLeft !== null) {
    return {
      kind: daysLeft < 0 ? 'past' : daysLeft <= 3 ? 'soon' : 'dated',
      daysLeft,
      source: 'use-by date',
      label: daysLeft < 0 ? `Past its recorded date by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}.`
        : daysLeft === 0 ? 'Use today.'
          : `Use within ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    };
  }
  const freshness = freshnessOf(item, today);
  return { ...freshness, daysLeft: null, source: 'kitchen rule of thumb' };
};

export const perishabilityOf = (item, today = dayStamp()) => ({
  item,
  ...datedFreshness(item, today),
});

/** Non-leftover pantry rows that deserve a place in the next plan. */
export const useSoonIngredients = (pantry = [], { today = dayStamp(), within = 3 } = {}) => pantry
  .filter((item) => item?.cat !== 'Leftovers')
  .map((item) => perishabilityOf(item, today))
  .filter((row) => row.kind === 'past' || row.kind === 'soon' || (row.daysLeft !== null && row.daysLeft <= within))
  .sort((a, b) => {
    const aDays = a.daysLeft ?? 999;
    const bDays = b.daysLeft ?? 999;
    return aDays - bDays || String(a.item.name || '').localeCompare(String(b.item.name || ''));
  });

export const leftoverAwareness = (pantry = [], { today = dayStamp(), horizon = 7 } = {}) => pantry
  .filter((item) => item?.cat === 'Leftovers' && Number(item.portions) > 0)
  .map((item) => ({
    item,
    daysLeft: item.expiry ? daysUntil(item.expiry, today) : null,
    urgent: item.expiry ? daysUntil(item.expiry, today) <= horizon : false,
    status: item.expiry && daysUntil(item.expiry, today) < 0
      ? 'past'
      : item.expiry && daysUntil(item.expiry, today) <= horizon
        ? 'use-soon'
        : 'available',
  }))
  .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

export const perishabilitySummary = (pantry = [], { today = dayStamp() } = {}) => {
  const rows = pantry.map((item) => perishabilityOf(item, today));
  return {
    total: rows.length,
    soon: rows.filter((row) => row.kind === 'soon' || row.kind === 'dated' && row.daysLeft <= 3).length,
    past: rows.filter((row) => row.kind === 'past').length,
    unknown: rows.filter((row) => row.kind === 'unknown').length,
    items: rows,
  };
};

const eventKey = (date, slot) => `${date}|${slot}`;

/** Compare planned slots with the latest recorded outcome for each slot. */
export const mealPlanAdherence = (plan = {}, dates = [], events = [], cooked = []) => {
  const latest = new Map();
  for (const event of [...events].sort((a, b) => Number(a.at || 0) - Number(b.at || 0))) {
    if (event?.date && event?.slot) latest.set(eventKey(event.date, event.slot), event);
  }
  const cookedCounts = new Map();
  for (const entry of cooked || []) {
    const key = `${entry.date}|${entry.recipeId}`;
    cookedCounts.set(key, (cookedCounts.get(key) || 0) + 1);
  }
  const rows = planEntries(plan, dates).map((entry) => {
    const event = latest.get(eventKey(entry.date, entry.slot));
    const cookedKey = `${entry.date}|${entry.recipeId}`;
    const fallbackCooked = !event && (cookedCounts.get(cookedKey) || 0) > 0;
    if (fallbackCooked) cookedCounts.set(cookedKey, cookedCounts.get(cookedKey) - 1);
    const status = event?.status || (fallbackCooked ? 'cooked' : 'pending');
    return {
      ...entry,
      status,
      reason: event?.reason || null,
      event: event || null,
      completed: status === 'cooked' || status === 'substituted',
    };
  });
  const skipped = rows.filter((row) => row.status === 'skipped');
  const completed = rows.filter((row) => row.completed);
  const reasons = {};
  for (const row of skipped) reasons[row.reason || 'other'] = (reasons[row.reason || 'other'] || 0) + 1;
  return {
    rows,
    planned: rows.length,
    completed: completed.length,
    skipped: skipped.length,
    pending: rows.filter((row) => row.status === 'pending').length,
    rate: rows.length ? Math.round((completed.length / rows.length) * 100) : null,
    skippedReasons: reasons,
  };
};

/** Surface repeated dishes across the current plan and recent cooking history. */
export const repeatFatigue = (plan = {}, dates = [], cooked = [], { today, window = 21, threshold = 3 } = {}) => {
  const counts = new Map();
  for (const entry of planEntries(plan, dates)) {
    const row = counts.get(entry.recipeId) || { recipe: entry.recipe, count: 0, planned: 0, cooked: 0 };
    row.count += 1;
    row.planned += 1;
    counts.set(entry.recipeId, row);
  }
  for (const entry of cooked || []) {
    if (today && daysUntil(entry.date, today) > 0) continue;
    if (today && daysUntil(entry.date, today) < -window) continue;
    const row = counts.get(entry.recipeId) || { recipe: entry.recipe || null, count: 0, planned: 0, cooked: 0 };
    row.count += 1;
    row.cooked += 1;
    counts.set(entry.recipeId, row);
  }
  const fatigued = [...counts.values()]
    .filter((row) => row.count >= threshold)
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ ...row, level: row.count >= threshold + 2 ? 'high' : 'watch' }));
  return { threshold, window, fatigued, hasFatigue: fatigued.length > 0 };
};

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/** Learn the user's real cooking time without changing the recipe's estimate. */
export const cookingTimeLearning = (history = [], recipes = []) => {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const grouped = new Map();
  for (const row of history || []) {
    const actual = Number(row.actualMins);
    if (!row.recipeId || !Number.isFinite(actual) || actual <= 0) continue;
    const values = grouped.get(row.recipeId) || [];
    values.push(actual);
    grouped.set(row.recipeId, values);
  }
  const recipesLearned = [...grouped.entries()].map(([recipeId, values]) => {
    const recipe = byId.get(recipeId);
    const avg = Math.round(average(values) * 10) / 10;
    const estimate = Number(recipe?.time) || Number(history.find((row) => row.recipeId === recipeId)?.estimatedMins) || null;
    return {
      recipeId,
      name: recipe?.name || recipeId,
      samples: values.length,
      averageMins: avg,
      estimateMins: estimate,
      deltaMins: estimate == null ? null : Math.round((avg - estimate) * 10) / 10,
    };
  }).sort((a, b) => b.samples - a.samples || b.averageMins - a.averageMins);
  const values = (history || []).map((row) => Number(row.actualMins)).filter((value) => Number.isFinite(value) && value > 0);
  return {
    samples: values.length,
    averageMins: values.length ? Math.round(average(values) * 10) / 10 : null,
    recipes: recipesLearned,
  };
};

/** A soft profile learned from explicit ratings, cooking choices and household dislikes. */
export const householdPreferenceProfile = ({ recipes = [], cooked = [], ratings = {}, favourites = [], members = [] } = {}) => {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const cuisineScores = {};
  const tagScores = {};
  const recipeCounts = {};
  const add = (recipe, weight) => {
    if (!recipe || !weight) return;
    recipeCounts[recipe.id] = (recipeCounts[recipe.id] || 0) + weight;
    if (recipe.cuisine) cuisineScores[recipe.cuisine] = (cuisineScores[recipe.cuisine] || 0) + weight;
    for (const tag of recipe.tags || []) tagScores[tag] = (tagScores[tag] || 0) + weight;
  };
  for (const id of favourites) add(byId.get(id), 1);
  for (const [id, verdict] of Object.entries(ratings)) add(byId.get(id), verdict === 'love' ? 3 : verdict === 'like' ? 1 : verdict === 'nope' ? -3 : 0);
  for (const entry of cooked) add(byId.get(entry.recipeId), 0.5);
  const ranked = (scores) => Object.entries(scores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const dislikes = [...new Set(members.flatMap((member) => member.dislikes || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
  return {
    cuisines: cuisineScores,
    tags: tagScores,
    recipeCounts,
    topCuisines: ranked(cuisineScores),
    topTags: ranked(tagScores),
    dislikes,
    evidenceCount: Object.keys(ratings).length + cooked.length,
    learnedFromCooking: cooked.length,
  };
};
