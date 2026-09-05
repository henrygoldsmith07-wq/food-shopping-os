/**
 * Predict ingredients that are likely to go unused.
 *
 * This is intentionally a thin read model over the existing waste planner. It
 * does not invent a consumption probability: every prediction carries the
 * concrete signal that caused it (expiry pressure, a known pack remainder, or
 * repeated household waste). Unknown quantities stay out of the prediction
 * rather than becoming false precision.
 */

import { byId } from '../data/recipes.js';
import { canonicalName } from './aliases.js';
import { daysBetween } from './waste-requirements.js';
import { scoreWastePlan } from './waste-planner.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => DATE_RE.test(String(value || ''));
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clean = (value) => String(value || '').trim();

const recipeFor = (id, recipesById) => recipesById.get(id) || byId(id);

const plannedMeals = (plan = {}, dates = [], recipes = []) => {
  const recipesById = new Map((Array.isArray(recipes) ? recipes : []).map((recipe) => [recipe.id, recipe]));
  const meals = [];
  const mealDates = [];
  for (const date of Array.isArray(dates) ? dates : []) {
    for (const value of Object.values(plan?.[date] || {})) {
      const id = typeof value === 'string' ? value : value?.id;
      const recipe = recipeFor(id, recipesById);
      if (!recipe) continue;
      meals.push(recipe);
      mealDates.push(date);
    }
  }
  return { meals, dates: mealDates };
};

const predictionKey = (row) => `${row.key || canonicalName(row.name)}|${row.dim || 'unknown'}`;

const sourceSignals = (row) => {
  const signals = [];
  if (row.date && validDate(row.date)) signals.push('expiry date');
  if (row.learned) signals.push('repeated waste history');
  if (/pack|bag|tin|carton|loaf|whole ingredient|one-off/i.test(row.reason || '')) signals.push('known pack or whole-item size');
  if (/no planned meal|used once|one planned use|absent from the plan/i.test(row.reason || '')) signals.push('planned-use coverage');
  return [...new Set(signals)];
};

const quantityLabel = (amount, dim, unit) => {
  if (dim === 'mass') return `${round(amount)} g`;
  if (dim === 'volume') return `${round(amount)} ml`;
  const value = round(amount);
  const noun = unit || 'unit';
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
};

const rank = (row) => (row.likelihood === 'high' ? 0 : 1);

const actionFor = (row) => {
  if (row.daysLeft !== null && row.daysLeft <= row.horizonDays) {
    return `Plan a meal using ${row.name} before ${row.date}.`;
  }
  if (row.learned) return `Use ${row.name} in another meal or choose a smaller pack next time.`;
  return `Use ${row.name} again later in the plan or choose a smaller pack.`;
};

const mergePrediction = (current, row, today, horizonDays) => {
  const date = validDate(row.date) ? row.date : null;
  const daysLeft = date && validDate(today) ? daysBetween(today, date) : null;
  const signals = sourceSignals(row);
  if (!current) {
    return {
      key: row.key || canonicalName(row.name),
      name: row.name,
      amount: Number(row.amount) || 0,
      dim: row.dim || null,
      unit: row.unit || null,
      qty: row.qty || quantityLabel(row.amount, row.dim, row.unit),
      likelihood: row.severity === 'high' || row.learned ? 'high' : 'watch',
      confidence: date ? 'observed' : row.learned ? 'learned' : 'estimated',
      learned: Boolean(row.learned),
      severity: row.severity || 'watch',
      date,
      daysLeft,
      horizonDays,
      recipes: [...(row.recipes || [])],
      reasons: [row.reason].filter(Boolean),
      signals,
      source: signals[0] || 'plan arithmetic',
    };
  }

  current.amount = round(current.amount + (Number(row.amount) || 0));
  current.qty = quantityLabel(current.amount, current.dim, current.unit);
  current.likelihood = current.likelihood === 'high' || row.severity === 'high' || row.learned ? 'high' : 'watch';
  current.severity = current.likelihood === 'high' ? 'high' : current.severity;
  current.learned = current.learned || Boolean(row.learned);
  current.confidence = current.confidence === 'observed' || date
    ? 'observed'
    : current.confidence === 'learned' || row.learned ? 'learned' : 'estimated';
  if (date && (!current.date || date < current.date)) {
    current.date = date;
    current.daysLeft = daysLeft;
  }
  current.recipes = [...new Set([...current.recipes, ...(row.recipes || [])])];
  current.reasons = [...new Set([...current.reasons, row.reason].filter(Boolean))];
  current.signals = [...new Set([...current.signals, ...signals])];
  current.source = current.signals[0] || current.source;
  return current;
};

/**
 * Return explainable risk bands for the current pantry and meal plan.
 *
 * `dates` corresponds to the supplied `meals` when `meals` is provided. When
 * only `plan` is supplied, recipes and dates are resolved from the plan. A
 * dated pantry item is considered only through `expiryHorizon`; an undated
 * item is never called likely to spoil just because it exists.
 */
export const predictUnusedIngredients = ({
  pantry = [],
  meals = null,
  plan = {},
  dates = [],
  recipes = [],
  today = '',
  wasteHistory = [],
  wasteProfile = null,
  packageSizes = {},
  learnedAliases = {},
  expiryHorizon = 7,
} = {}) => {
  const resolved = Array.isArray(meals)
    ? { meals, dates: Array.isArray(dates) && dates.length === meals.length ? dates : [] }
    : plannedMeals(plan, dates, recipes);
  const scored = scoreWastePlan(resolved.meals, {
    pantry,
    dates: resolved.dates,
    today,
    wasteHistory,
    wasteProfile,
    packageSizes,
    learnedAliases,
    expiryHorizon,
  });

  const grouped = new Map();
  for (const row of scored.expectedUnusedIngredients || []) {
    // A malformed date is not evidence of a future waste event. Pack-size
    // predictions have no date and remain valid; dated predictions do not.
    if (row.date && !validDate(row.date)) continue;
    const key = predictionKey(row);
    grouped.set(key, mergePrediction(grouped.get(key), row, today, expiryHorizon));
  }

  const items = [...grouped.values()]
    .map((row) => ({ ...row, action: actionFor(row) }))
    .sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name));
  const highRisk = items.filter((row) => row.likelihood === 'high').length;
  const summary = items.length
    ? `${highRisk ? `${highRisk} high-risk ` : ''}${items.length} ingredient${items.length === 1 ? '' : 's'} may go unused if the plan stays unchanged.`
    : 'No ingredient is currently predicted to go unused from the evidence recorded.';

  return {
    items,
    predictions: items,
    count: items.length,
    highRisk,
    hasPredictions: items.length > 0,
    planMeals: resolved.meals.length,
    horizonDays: expiryHorizon,
    score: items.length ? scored.score : null,
    summary,
    evidence: {
      pantryItems: Array.isArray(pantry) ? pantry.length : 0,
      plannedMeals: resolved.meals.length,
      knownPackRemainders: items.filter((row) => row.signals.includes('known pack or whole-item size')).length,
      expiryRisks: items.filter((row) => row.signals.includes('expiry date')).length,
      learnedRisks: items.filter((row) => row.learned).length,
    },
  };
};

export const predictWaste = predictUnusedIngredients;
