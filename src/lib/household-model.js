/**
 * Unified Household Model — the single place Forq learns how a household eats.
 *
 * Replaces scattered fragments (taste, household-preferences,
 * planning-intelligence, waste-learning, consumption-predictions,
 * skip-preferences) with one coherent model where EVERY learned fact carries:
 *   { value, confidence: 'high'|'medium'|'low'|'none', evidenceCount, source, updatedAt }
 *
 * Sources are evidence names callers can audit: 'taste-ratings', 'cooked',
 * 'meal-events', 'waste', 'receipts', 'pantry', 'plan', 'member-profile'.
 * Nothing is invented: 0 evidence → confidence 'none' and value null.
 */

import { buildTasteProfile } from './taste.js';
import { learnHouseholdPreferences } from './household-preferences.js';
import { wasteLearningProfile } from './waste-learning.js';
import { consumptionRateFor } from './consumption-predictions.js';
import { mealPlanAdherence, repeatFatigue, cookingTimeLearning } from './planning-intelligence.js';
import { dayStamp, weekDates } from './kitchen-dates.js';

export const MODEL_SOURCES = [
  'taste-ratings',
  'cooked',
  'meal-events',
  'waste',
  'receipts',
  'pantry',
  'plan',
  'member-profile',
  'shopping',
];

export const confidenceForCount = (count = 0) => {
  const n = Number(count) || 0;
  if (n <= 0) return 'none';
  if (n < 3) return 'low';
  if (n < 8) return 'medium';
  return 'high';
};

export const makeFact = (value, { confidence, evidenceCount = 0, source = 'cooked', updatedAt = null } = {}) => ({
  value,
  confidence: confidence || confidenceForCount(evidenceCount),
  evidenceCount: Number(evidenceCount) || 0,
  source,
  updatedAt: updatedAt || dayStamp(),
});

const emptyFact = (source = 'cooked') => makeFact(null, { evidenceCount: 0, source });

const text = (v) => String(v || '').trim().toLowerCase();

/** Weekday (Mon–Fri) vs weekend behaviour from cooked + plan events. */
const weekdayBehaviourFrom = (cooked = [], mealPlanEvents = [], today = dayStamp()) => {
  const buckets = { weekday: 0, weekend: 0 };
  const byDay = {};
  const all = [
    ...cooked.map((c) => c.date).filter(Boolean),
    ...mealPlanEvents.filter((e) => e.status === 'cooked').map((e) => e.date).filter(Boolean),
  ];
  for (const date of all) {
    const dow = new Date(`${String(date).slice(0, 10)}T12:00:00`).getDay();
    const weekend = dow === 0 || dow === 6;
    if (weekend) buckets.weekend += 1;
    else buckets.weekday += 1;
    const key = String(date).slice(0, 10);
    byDay[key] = (byDay[key] || 0) + 1;
  }
  const total = buckets.weekday + buckets.weekend;
  void today;
  return { buckets, total, byDay };
};

/** Shopping cadence from recorded shops: median interval + trips. */
const shoppingCadenceFrom = (shops = []) => {
  const dates = [...new Set((shops || []).map((s) => String(s.date || '').slice(0, 10)).filter(Boolean))].sort();
  if (dates.length < 2) return { medianIntervalDays: null, trips: dates.length, dates };
  const intervals = dates.slice(1).map((d, i) =>
    Math.round((new Date(`${d}T12:00:00`) - new Date(`${dates[i]}T12:00:00`)) / 86400000));
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { medianIntervalDays: median, trips: dates.length, dates, intervals };
};

/**
 * Build the unified model from app state. Pure + offline. `recipes` defaults
 * to [] so the model degrades gracefully when the catalogue is unavailable.
 */
export const buildHouseholdModel = (state = {}, { recipes = [], today = dayStamp() } = {}) => {
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const waste = Array.isArray(state.waste) ? state.waste : [];
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const members = Array.isArray(state.members) ? state.members : [];
  const mealPlanEvents = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const tasteRatings = state.tasteRatings || {};
  const favourites = Array.isArray(state.favourites) ? state.favourites : [];
  const cookingTimeHistory = Array.isArray(state.cookingTimeHistory) ? state.cookingTimeHistory : [];
  const preferenceEvents = Array.isArray(state.preferenceEvents) ? state.preferenceEvents : [];
  const at = today;

  // --- appetite: household size + learned portions -------------------------
  const householdSize = Math.max(1, Number(state.household) || members.length || 1);
  const learnedPrefs = learnHouseholdPreferences({
    recipes, cooked, ratings: tasteRatings, cookingTimeHistory, feedback: preferenceEvents, waste, today,
  });
  const typicalPortions = learnedPrefs.portions?.typical ?? householdSize;
  const portionEvidence = learnedPrefs.portions?.observations || 0;

  // --- preferences / dislikes ----------------------------------------------
  const taste = buildTasteProfile(recipes, tasteRatings, favourites, cooked);
  const likedCuisines = (taste.topCuisines || []).slice(0, 5);
  const likedTags = (taste.topTags || []).slice(0, 8);
  const dislikedIds = Object.entries(tasteRatings).filter(([, v]) => v === 'nope').map(([id]) => id);
  const memberDislikes = members.flatMap((m) => (m.dislikes || []).map(text)).filter(Boolean);
  const wasteDislikes = waste.filter((w) => w.reason === 'disliked').map((w) => text(w.name)).filter(Boolean);

  // --- dietary constraints (hard lines from profiles + household) -----------
  const memberDiets = [...new Set(members.flatMap((m) => m.diets || []))];
  const diets = [...new Set([...(state.diets || []), ...memberDiets])];
  const allergies = [...new Set([...(state.allergies || []), ...members.flatMap((m) => m.allergies || [])])];
  const intolerances = [...new Set([...(state.intolerances || []), ...members.flatMap((m) => m.intolerances || [])])];
  const religious = [...new Set([...(state.religious || []), ...members.flatMap((m) => m.religious || [])])];

  // --- meal acceptance + portion accuracy -----------------------------------
  let adherence = null;
  try {
    const dates = weekDates(today);
    adherence = mealPlanAdherence(state.plan || {}, dates, mealPlanEvents, cooked);
  } catch { adherence = null; }
  const acceptanceRate = adherence && adherence.planned
    ? Math.round(((adherence.completed ?? adherence.cooked ?? 0) / Math.max(1, adherence.planned)) * 100) / 100
    : null;
  const acceptanceEvidence = (adherence?.planned || 0) + (adherence?.completed ?? adherence?.cooked ?? 0);
  let fatigue = [];
  try {
    const dates = weekDates(today);
    const raw = repeatFatigue(state.plan || {}, dates, cooked, { today }) || {};
    const list = Array.isArray(raw) ? raw : raw.fatigued || [];
    fatigue = list;
  } catch { fatigue = []; }
  const portionErrors = waste.filter((w) => w.reason === 'cooked-too-much').length;
  const portionSamples = cooked.length + portionErrors;

  // --- effort tolerance ------------------------------------------------------
  let cooking = { samples: 0, averageMins: null };
  try { cooking = cookingTimeLearning(cookingTimeHistory) || cooking; } catch { /* keep default */ }
  const timeBudget = state.timeBudget || 'normal';
  const budgetMinutes = timeBudget === 'quick' ? 20 : timeBudget === 'relaxed' ? 60 : 35;
  const effortTolerance = cooking.samples
    ? Math.round(((cooking.averageMins || budgetMinutes) + budgetMinutes) / 2)
    : budgetMinutes;

  // --- weekday behaviour -------------------------------------------------------
  const behaviour = weekdayBehaviourFrom(cooked, mealPlanEvents, today);

  // --- ingredient consumption + waste probability -------------------------------
  const wasteProfile = (() => {
    try { return wasteLearningProfile({ purchases: shops, waste, today }); } catch { return []; }
  })();
  const wasteByIngredient = {};
  for (const row of wasteProfile) {
    wasteByIngredient[row.key] = makeFact(row.wasteRate, {
      evidenceCount: row.wasteEvents + row.purchases, source: 'waste', updatedAt: row.lastWasteDate || at,
    });
  }
  const topWaste = wasteProfile.slice(0, 8).map((r) => r.key);
  // Consumption rates only for ingredients the household actually buys.
  const ingredientConsumption = {};
  for (const row of wasteProfile.slice(0, 24)) {
    try {
      const rate = consumptionRateFor(row.name, shops);
      if (rate.unitsPerDay) {
        ingredientConsumption[row.key] = makeFact(rate.unitsPerDay, {
          evidenceCount: rate.purchases, source: 'receipts', updatedAt: rate.lastPurchase?.date || at,
        });
      }
    } catch { /* one bad row must not break the model */ }
  }

  // --- shopping cadence + price sensitivity --------------------------------------
  const cadence = shoppingCadenceFrom(shops);
  const offersUsed = (state.offers || []).filter((o) => o.used || o.appliedCount > 0).length;
  const couponsUsed = (state.coupons || []).filter((c) => c.used).length;
  const priceEvidence = shops.length + offersUsed + couponsUsed;
  const priceSensitivity = offersUsed + couponsUsed > 0 ? 'deal-aware'
    : shops.length >= 4 ? 'steady' : null;

  // --- substitutions learned from alias memory + waste -----------------------------
  const aliasMemory = state.aliasMemory || {};
  const substitutions = Object.entries(aliasMemory).slice(0, 50).map(([from, to]) => ({
    from, to, confidence: 'medium', evidenceCount: 1, source: 'pantry', updatedAt: at,
  }));

  return {
    version: 1,
    updatedAt: at,
    appetite: makeFact(
      { householdSize, typicalPortions, portionsOverride: state.portionsOverride || 'auto' },
      { evidenceCount: portionEvidence + members.length, source: members.length ? 'member-profile' : 'cooked', updatedAt: at },
    ),
    preferences: makeFact(
      { cuisines: likedCuisines, tags: likedTags, learned: learnedPrefs },
      { evidenceCount: taste.rated + cooked.length, source: 'taste-ratings', updatedAt: at },
    ),
    dislikes: makeFact(
      { recipes: dislikedIds, ingredients: [...new Set([...memberDislikes, ...wasteDislikes])] },
      { evidenceCount: dislikedIds.length + memberDislikes.length + wasteDislikes.length, source: 'taste-ratings', updatedAt: at },
    ),
    dietaryConstraints: makeFact(
      { diets, allergies, intolerances, religious },
      {
        evidenceCount: diets.length + allergies.length + intolerances.length + religious.length + members.length,
        source: 'member-profile',
        updatedAt: at,
      },
    ),
    mealAcceptance: makeFact(
      acceptanceRate === null ? null : { rate: acceptanceRate, planned: adherence.planned, cooked: adherence.completed ?? adherence.cooked ?? 0, skipped: adherence.skipped },
      { evidenceCount: acceptanceEvidence, source: 'meal-events', updatedAt: at },
    ),
    portionAccuracy: makeFact(
      portionSamples ? { overcookWasteEvents: portionErrors, samples: portionSamples } : null,
      { evidenceCount: portionSamples, source: 'waste', updatedAt: at },
    ),
    effortTolerance: makeFact(
      { typicalMinutes: effortTolerance, timeBudget, observedAverage: cooking.averageMins, samples: cooking.samples },
      { evidenceCount: cooking.samples, source: 'cooked', updatedAt: at },
    ),
    weekdayBehaviour: makeFact(
      behaviour.total ? behaviour : null,
      { evidenceCount: behaviour.total, source: 'meal-events', updatedAt: at },
    ),
    ingredientConsumption: makeFact(
      ingredientConsumption,
      { evidenceCount: Object.keys(ingredientConsumption).length, source: 'receipts', updatedAt: at },
    ),
    wasteProbability: makeFact(
      wasteByIngredient,
      { evidenceCount: waste.length, source: 'waste', updatedAt: at },
    ),
    topWasteRisk: makeFact(topWaste, { evidenceCount: waste.length, source: 'waste', updatedAt: at }),
    repeatFatigue: makeFact(fatigue.slice(0, 12), { evidenceCount: cooked.length, source: 'cooked', updatedAt: at }),
    shoppingCadence: makeFact(
      cadence.trips ? cadence : null,
      { evidenceCount: cadence.trips, source: 'receipts', updatedAt: at },
    ),
    priceSensitivity: priceSensitivity === null ? emptyFact('shopping')
      : makeFact(
        { level: priceSensitivity, offersUsed, couponsUsed, trips: shops.length },
        { evidenceCount: priceEvidence, source: 'shopping', updatedAt: at },
      ),
    substitutions: makeFact(substitutions, { evidenceCount: substitutions.length, source: 'pantry', updatedAt: at }),
  };
};

export const householdModelReady = (model) =>
  Boolean(model && (model.preferences?.evidenceCount > 0 || model.mealAcceptance?.evidenceCount > 0));

/** One-line honest summary for Learn/Home. Never invents a fact. */
export const householdModelSummary = (model) => {
  if (!model) return 'No household learning yet — plan, cook and log to teach Forq.';
  const bits = [];
  const pref = model.preferences?.value;
  if (pref?.cuisines?.length && model.preferences?.evidenceCount > 0) bits.push(`leans ${pref.cuisines.slice(0, 2).join(' and ')}`);
  if (model.mealAcceptance?.value?.rate !== null && model.mealAcceptance?.value && model.mealAcceptance?.evidenceCount > 0) {
    bits.push(`${Math.round(model.mealAcceptance.value.rate * 100)}% of planned meals get cooked`);
  }
  if (model.effortTolerance?.value?.typicalMinutes && model.effortTolerance?.evidenceCount > 0) {
    bits.push(`happiest around ${model.effortTolerance.value.typicalMinutes} min cooks`);
  }
  if (!bits.length) return 'Not enough history yet — every suggestion says what evidence it used.';
  return `Household ${bits.join(' · ')} (${model.preferences?.confidence || 'low'} confidence).`;
};
