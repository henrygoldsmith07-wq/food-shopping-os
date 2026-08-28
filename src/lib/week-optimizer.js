/**
 * Weekly meal optimisation.
 *
 * Unlike a recipe ranker, this evaluates a set of meals together. The small
 * deterministic search is intentional: it is fast enough for the client and
 * makes the trade-offs explainable.
 */
import { sameIngredient } from './aliases.js';
import { pantryCoverage } from './planner.js';
import { cookingFitFor } from './household-preferences.js';
import { groupMealScore } from './member-preferences.js';

const dayKey = (date) => String(date || '').slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${dayKey(b)}T12:00:00`) - new Date(`${dayKey(a)}T12:00:00`)) / 86400000);

const quantityNumber = (value) => {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 1;
};

const ingredientKey = (value) => String(value || '').toLowerCase().replace(/\([^)]*\)/g, '').trim();

const pantryRows = (pantry = []) => pantry.map((item) => ({
  ...item,
  key: ingredientKey(item.name),
  min: Number(item.quantityMin ?? item.quantity ?? quantityNumber(item.qty)),
  max: Number(item.quantityMax ?? item.quantity ?? quantityNumber(item.qty)),
}));

const expiryPressure = (item, date, today) => {
  if (!item?.expiry) return 0;
  const days = daysBetween(today || date, item.expiry);
  if (days < 0) return 0;
  if (days <= 1) return 5;
  if (days <= 3) return 3;
  if (days <= 5) return 1;
  return 0;
};

const matches = (row, ingredient) => sameIngredient(row?.name, ingredient?.name)
  || row?.key === ingredientKey(ingredient?.name);

export const scoreRecipeForWeek = (recipe, context = {}) => {
  const ingredients = recipe?.ingredients || [];
  const pantry = pantryRows(context.pantry || []);
  const owned = ingredients.filter((ingredient) => pantry.some((row) => matches(row, ingredient)));
  const expiring = ingredients.filter((ingredient) => pantry.some((row) => matches(row, ingredient) && expiryPressure(row, context.date, context.today) > 0));
  const coverage = ingredients.length ? owned.length / ingredients.length : 1;
  const people = Math.max(1, Number(context.people) || 1);
  const budget = Number(context.budget);
  const cost = (Number(recipe.costPerServing) || 0) * people;
  const timeLimit = Number(context.availableTime ?? context.maxTime);
  const timeFit = !timeLimit || (Number(recipe.time) || 0) <= timeLimit;
  const disliked = (context.dislikedIngredients || []).some((name) => ingredients.some((ingredient) => sameIngredient(name, ingredient.name)));
  const equipment = context.equipment || [];
  const equipmentFit = !(recipe.tags || []).some((tag) => ['air-fryer', 'slow-cooker'].includes(tag) && !equipment.includes(tag));
  const preference = Number(context.preferences?.[recipe.id] ?? context.taste?.[recipe.id] ?? 0);
  const learnedFit = cookingFitFor(recipe, context.householdPreferences, { weekday: context.weekday, availableMinutes: timeLimit || null });
  const groupFit = groupMealScore(recipe, context.memberPreferenceProfiles || [], { weights: context.memberWeights, recentRecipeIds: context.previousMeals || [] });
  const score = Math.round(
    coverage * 38
    + expiring.length * 10
    + (budget && cost <= budget ? 10 : budget ? Math.max(0, 10 - (cost - budget) * 4) : 5)
    + (timeFit ? 8 : -18)
    + (equipmentFit ? 5 : -20)
    + preference * 4
    + learnedFit.score * 8
    + (groupFit.average === null ? 0 : groupFit.score * 3)
    + (recipe.tags || []).filter((tag) => (context.preferredTags || []).includes(tag)).length * 3
    - (disliked ? 35 : 0),
  );
  return {
    score,
    ownedCount: owned.length,
    ingredientCount: ingredients.length,
    compatibility: Math.round(coverage * 100),
    expiringCount: expiring.length,
    expiringIngredients: expiring.map((ingredient) => ingredient.name),
    missing: ingredients.filter((ingredient) => !owned.some((ownedIngredient) => ownedIngredient === ingredient)),
    estimatedCost: Math.round(cost * 100) / 100,
    time: Number(recipe.time) || 0,
    householdFit: Math.max(0, Math.min(5, Math.round((3 + preference + learnedFit.score) * 10) / 10)),
    cookingFit: learnedFit,
    groupFit,
    hardViolations: [!timeFit && 'time', !equipmentFit && 'equipment', disliked && 'disliked'].filter(Boolean),
  };
};

const ingredientUse = (meals) => {
  const counts = new Map();
  meals.forEach((recipe) => (recipe?.ingredients || []).forEach((ingredient) => {
    const key = ingredientKey(ingredient.name);
    counts.set(key, (counts.get(key) || 0) + quantityNumber(ingredient.qty));
  }));
  return counts;
};

/** Return a transparent explanation and metrics for a complete week. */
export const evaluateWeek = (meals = [], context = {}) => {
  const details = meals.map((recipe, index) => scoreRecipeForWeek(recipe, { ...context, date: context.dates?.[index] || context.today }));
  const uses = ingredientUse(meals);
  const pantry = pantryRows(context.pantry || []);
  let wasteRisk = 0;
  for (const row of pantry) {
    const used = [...uses.entries()].find(([key]) => key === row.key)?.[1] || 0;
    const available = Math.max(row.min, row.max);
    if (used === 0 && expiryPressure(row, context.dates?.[0], context.today) > 0) wasteRisk += 12;
    if (available > 1 && used > 0 && used < available * 0.5) wasteRisk += 3;
  }
  const varietyPenalty = meals.length - new Set(meals.map((recipe) => recipe?.id)).size;
  const cost = details.reduce((sum, item) => sum + item.estimatedCost, 0);
  const budgetPenalty = context.weeklyBudget && cost > context.weeklyBudget ? (cost - context.weeklyBudget) * 5 : 0;
  const score = Math.round(details.reduce((sum, item) => sum + item.score, 0) - wasteRisk - varietyPenalty * 4 - budgetPenalty);
  const ingredients = meals.flatMap((recipe) => recipe?.ingredients || []);
  const owned = ingredients.filter((ingredient, index) => details[Math.min(index, details.length - 1)]?.ownedCount);
  return {
    score,
    meals,
    details,
    estimatedCost: Math.round(cost * 100) / 100,
    pantryCompatibility: ingredients.length ? Math.round((owned.length / ingredients.length) * 100) : 100,
    wasteRisk,
    repeatedMeals: varietyPenalty,
    missingIngredients: [...new Set(details.flatMap((detail) => detail.missing.map((item) => item.name)))],
    explanations: [
      wasteRisk ? `Uses the most urgent pantry food first; ${wasteRisk} points of avoidable waste risk remain.` : 'The week uses pantry food without leaving an obvious expiry problem.',
      varietyPenalty ? `${varietyPenalty} repeat${varietyPenalty === 1 ? '' : 's'} keep the shopping and cooking load realistic.` : 'Every meal is distinct while the ingredient flow still fits.',
    ],
  };
};

export const optimiseWeek = (recipes = [], context = {}) => {
  const dates = context.dates || [];
  const count = dates.length || Number(context.count) || 7;
  const eligible = recipes.filter((recipe) => !scoreRecipeForWeek(recipe, context).hardViolations.length);
  const pool = eligible.length ? eligible : recipes;
  if (!pool.length) return evaluateWeek([], context);
  let best = null;
  const candidates = Math.min(pool.length, Number(context.candidates) || 18);
  const search = (chosen, start) => {
    if (chosen.length === count) {
      const result = evaluateWeek(chosen, { ...context, dates });
      if (!best || result.score > best.score) best = result;
      return;
    }
    for (let i = 0; i < candidates; i += 1) {
      const recipe = pool[(start + i) % pool.length];
      if (chosen.length < pool.length && chosen.some((item) => item.id === recipe.id) && !context.allowRepeats) continue;
      search([...chosen, recipe], start + i + 1);
      if (best && best.score > 1000) return;
    }
  };
  // Limit combinatorics while still considering repeated ingredient flow.
  const shortlist = pool.slice().sort((a, b) => scoreRecipeForWeek(b, context).score - scoreRecipeForWeek(a, context).score).slice(0, Math.min(8, candidates));
  search([], 0);
  if (!best) best = evaluateWeek(Array.from({ length: count }, (_, i) => shortlist[i % shortlist.length]), { ...context, dates });
  return best;
};
