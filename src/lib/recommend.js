/**
 * Pantry-aware recommendations.
 *
 * Every recommendation explains itself with numbers the user can verify:
 * pantry coverage, expiring items used, time vs their dead windows, cost per
 * person, and portions that turn one cook into two lunches.
 *
 * The score is a plain weighted product so it stays interpretable:
 *   score ≈ pantry × expiry × time-fit × cost × leftoverValue × taste × budget
 * All factors are 0.7–1.6; no one factor dominates and a zero never hides a dish.
 */

import { daysUntil, dayStamp, pantryConfidence } from './kitchen.js';
import { tasteScore } from './taste.js';
import { seasonScore } from '../data/seasons.js';

const normalize = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

const ingredientMatchesPantry = (ingredientName, pantryNames) => {
  const wanted = normalize(ingredientName);
  if (!wanted) return false;
  return pantryNames.some((raw) => {
    const stocked = normalize(raw);
    return stocked === wanted || (Math.min(stocked.length, wanted.length) >= 4 && (stocked.includes(wanted) || wanted.includes(stocked)));
  });
};

export const pantryCoverage = (recipe, pantryNames = []) => {
  if (!pantryNames.length || !recipe.ingredients?.length) return { have: 0, total: recipe.ingredients.length, pct: 0, missing: recipe.ingredients };
  const normalizedPantry = pantryNames.map(normalize);
  const have = [];
  const missing = [];
  for (const ing of recipe.ingredients) {
    if (ingredientMatchesPantry(ing.name, normalizedPantry)) have.push(ing);
    else missing.push(ing);
  }
  const total = recipe.ingredients.length;
  return { have: have.length, total, pct: total ? Math.round((have.length / total) * 100) : 0, missing, haveList: have };
};

export const expiringIngredients = (recipe, pantry = [], today = dayStamp(), within = 3) => {
  const expiring = pantry.filter((p) => pantryConfidence(p) !== 'unknown' && p.expiry && daysUntil(p.expiry, today) <= within && daysUntil(p.expiry, today) >= -1);
  if (!expiring.length) return [];
  const names = expiring.map((p) => normalize(p.name));
  // dedupe by normalized name: one chilli row covers every "chilli" ingredient line
  const seen = new Set();
  const out = [];
  for (const ing of recipe.ingredients || []) {
    const wanted = normalize(ing.name);
    const hit = expiring.find((p) => {
      const stocked = normalize(p.name);
      return stocked === wanted || (Math.min(stocked.length, wanted.length) >= 4 && (stocked.includes(wanted) || wanted.includes(stocked)));
    });
    if (hit) {
      const key = normalize(hit.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ingredient: ing.name, pantryItem: hit, daysLeft: daysUntil(hit.expiry, today) });
    }
    void names;
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
};

export const costPerPerson = (recipe, people = 2) => {
  const base = Number(recipe.costPerServing) || 0;
  // costPerServing already per person; people only matters for total display
  void people;
  return Math.round(base * 100) / 100;
};

export const totalTime = (recipe) => Number(recipe.time) || 0;

export const leftoverYield = (recipe) => {
  // How many lunch portions this cook creates beyond the dinner itself
  const serves = Number(recipe.servings) || 1;
  const canBatch = recipe.tags?.some((t) => ['batch', 'freezer', 'one-pot', 'meal-prep'].includes(t));
  if (serves >= 6) return { portions: 2, note: 'Creates two lunch portions' };
  if (serves >= 4 || canBatch) return { portions: 1, note: 'Creates one lunch portion' };
  return { portions: 0, note: null };
};

/**
 * Does this recipe fit the given day's schedule?
 * availability: Map<YYYY-MM-DD, { busy?: boolean, maxMinutes?: number, date, dayName }>
 * Falls back to weekDays busy set and a default 45 min on busy days.
 */
export const fitsSchedule = (recipe, date, availability = {}) => {
  const day = availability[date];
  if (!day) return { fits: true, reason: null };
  if (day.busy) return { fits: totalTime(recipe) <= 25, reason: day.busy ? `Busy ${day.dayName || date} — only 25 min dishes fit` : null };
  if (typeof day.maxMinutes === 'number' && totalTime(recipe) > day.maxMinutes) {
    return { fits: false, reason: `${totalTime(recipe)} min does not fit ${day.dayName || date}'s ${day.maxMinutes} min window` };
  }
  return { fits: true, reason: `fits ${day.dayName || date}'s schedule` };
};

export const scheduleFit = (recipe, date, availability) => {
  const { fits } = fitsSchedule(recipe, date, availability);
  if (!fits) return 0.7;
  // Short dishes are slightly favoured when days are tight, but never dominate
  const time = totalTime(recipe);
  if (time <= 20) return 1.15;
  if (time <= 30) return 1.05;
  return 1;
};

/**
 * Full explanation the UI renders verbatim — no paraphrasing a number the
 * engine didn't actually compute.
 */
export const explainRecommendation = (recipe, ctx = {}) => {
  const {
    pantry = [],
    pantryNames = pantry.map((p) => p.name),
    today = dayStamp(),
    date = today,
    availability = {},
    people = 2,
    month = Number(String(today).slice(5, 7)) || new Date().getMonth() + 1,
  } = ctx;

  const coverage = pantryCoverage(recipe, pantryNames);
  const expiring = expiringIngredients(recipe, pantry, today, 3);
  const timeMins = totalTime(recipe);
  const schedule = fitsSchedule(recipe, date, availability);
  const cost = costPerPerson(recipe, people);
  const leftover = leftoverYield(recipe);
  const seasonal = seasonScore(recipe, month);
  const taste = ctx.taste ? tasteScore(recipe, ctx.taste) : 0;

  // Factors for the score, each bounded so the product stays legible
  const pantryFactor = 0.85 + (coverage.pct / 100) * 0.45; // 0.85–1.30
  const expiryFactor = expiring.length ? 1 + Math.min(0.35, expiring.length * 0.12) : 1;
  const timeFactor = schedule.fits ? scheduleFit(recipe, date, availability) : 0.7;
  // Cost is inverted: cheap is favoured, expensive penalised, but never zeroed
  const budget = ctx.budget ?? 4;
  const costFactor = cost <= budget ? 1 + Math.max(0, (budget - cost) / budget) * 0.15 : 0.9;
  const leftoverFactor = leftover.portions ? 1 + leftover.portions * 0.08 : 1;
  const tasteFactor = taste > 0 ? 1 + Math.min(0.2, taste * 0.04) : 1;
  const seasonalFactor = seasonal ? 1 + Math.min(0.15, seasonal * 0.05) : 1;

  const factors = {
    pantry: Math.round(pantryFactor * 100) / 100,
    expiry: Math.round(expiryFactor * 100) / 100,
    timeFit: Math.round(timeFactor * 100) / 100,
    cost: Math.round(costFactor * 100) / 100,
    leftover: Math.round(leftoverFactor * 100) / 100,
    taste: Math.round(tasteFactor * 100) / 100,
    seasonal: Math.round(seasonalFactor * 100) / 100,
  };
  const score = pantryFactor * expiryFactor * timeFactor * costFactor * leftoverFactor * tasteFactor * seasonalFactor;

  const lines = [
    `${coverage.pct}% already in your kitchen`,
    expiring.length ? `Uses ${expiring.map((e) => `${e.pantryItem.name.toLowerCase()}${e.daysLeft <= 1 ? ' expiring tomorrow' : ` expiring in ${e.daysLeft}d`}`).join(', ')}` : null,
    `${timeMins} minutes — ${schedule.fits ? `fits ${availability[date]?.dayName || 'today'}'s schedule` : `too long for ${availability[date]?.dayName || date}`}`,
    `£${cost.toFixed(2)}/person`,
    leftover.note,
  ].filter(Boolean);

  return {
    coverage,
    expiring,
    timeMins,
    schedule,
    cost,
    leftover,
    seasonal,
    taste,
    factors,
    score: Math.round(score * 1000) / 1000,
    lines,
  };
};

export const scoreRecipe = (recipe, ctx = {}) => explainRecommendation(recipe, ctx).score;

/**
 * Rank a list of recipes for one slot/date, highest score first.
 * Returns [{ recipe, explanation }] sorted; the caller decides how many to show.
 */
export const rankRecipesForSlot = (recipes = [], ctx = {}) => {
  const rows = recipes.map((recipe) => ({ recipe, explanation: explainRecommendation(recipe, ctx) }));
  rows.sort((a, b) => b.explanation.score - a.explanation.score);
  return rows;
};

/**
 * Convenience: the single best recipe for the slot, or null.
 */
export const bestForSlot = (recipes = [], ctx = {}) => rankRecipesForSlot(recipes, ctx)[0] || null;
