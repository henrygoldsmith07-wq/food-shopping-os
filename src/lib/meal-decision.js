/**
 * Meal Decision Engine — the ONE place that answers “What should we eat tonight?”.
 *
 * Combines, in one interpretable score:
 *   pantry coverage · expiry urgency · leftovers · preferences/taste ·
 *   time/effort fit · budget · nutrition balance · repetition fatigue ·
 *   dietary safety · waste risk.
 *
 * All callers (Home tonight-card, Plan generator, Autopilot) must go through
 * `decideTonight` / `rankMealsForTonight` instead of calling recommend.js,
 * optimiser.js or week-optimizer.js directly. Those modules remain as the
 * scoring primitives; this is the policy that weighs them.
 *
 * Pure + offline. Never invents a recipe — empty catalogue → { pick: null }.
 */

import { explainRecommendation, pantryCoverage, expiringIngredients } from './recommend.js';
import { evaluateFoodSuitability } from './food-suitability.js';
import { tasteScore } from './taste.js';
import { dayStamp, daysUntil, addDays, weekStart } from './kitchen-dates.js';

const DEFAULT_WEIGHTS = {
  coverage: 0.42,
  preference: 0.14,
  time: 0.12,
  budget: 0.1,
  waste: 0.12,
  nutrition: 0.06,
  leftover: 0.6,
};

const confidences = new Set(['none', 'low', 'medium', 'high']);
const confidencesToNumber = { none: 0, low: 0.25, medium: 0.55, high: 1 };
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const fact = (value) => {
  const next = (value && typeof value === 'object') ? value : {};
  const valid = confidences.has(next.confidence) ? next.confidence : 'none';
  return {
    ...next,
    confidence: valid,
    evidenceCount: Number(next.evidenceCount) || 0,
    level: confidencesToNumber[valid],
  };
};
const byConfidence = (value, fallback = 0) => fact(value).level;

/** How recently was this recipe cooked? 0 = long ago, 1 = yesterday. */
const recencyPenalty = (recipeId, cooked = [], today = dayStamp()) => {
  const dates = cooked.filter((c) => c.recipeId === recipeId).map((c) => c.date).sort();
  if (!dates.length) return 0;
  const last = dates[dates.length - 1];
  const days = Math.round((new Date(`${today}T12:00:00`) - new Date(`${last}T12:00:00`)) / 86400000);
  if (!Number.isFinite(days)) return 0;
  if (days <= 1) return 0.35;
  if (days <= 3) return 0.18;
  if (days <= 7) return 0.08;
  return 0;
};

const leftoverBonus = (recipe, leftovers = []) => {
  if (!leftovers.length) return 0;
  const names = new Set(leftovers.map((l) => String(l.name || '').toLowerCase()));
  const hits = (recipe.ingredients || []).filter((i) => {
    const n = String(i.name || i).toLowerCase();
    return [...names].some((l) => l && (l.includes(n) || n.includes(l)));
  }).length;
  return Math.min(0.25, hits * 0.08);
};

/**
 * What the budget actually did, week by week: recorded spend against the
 * budget, and — where the week's plan named priced recipes — what the plan
 * implied the spend should be. The last four Monday-first weeks; a week
 * with no shops and no plan contributes nothing. This replaces the old
 * "one big trip" proxy, which punished a single well-planned stock-up and
 * never saw a month of small overspends.
 */
export const weeklyBudgetReality = (state = {}, { today = dayStamp(), recipes = [] } = {}) => {
  const empty = { weeks: 0, overBudgetWeeks: 0, meanVariance: null, meanPlannedVariance: null, rows: [] };
  const weeklyBudget = Number(state.weeklyBudget) || 0;
  if (!weeklyBudget) return empty;
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const plan = state.plan || {};
  const recipesById = recipes instanceof Map
    ? recipes
    : new Map((Array.isArray(recipes) ? recipes : []).filter((r) => r?.id).map((r) => [r.id, r]));
  const portions = Math.max(1, Math.round(Number(state.household) || Number(state.portions) || 1));
  const rows = [];
  for (let i = 3; i >= 0; i -= 1) {
    const start = weekStart(addDays(today, -7 * i));
    const end = addDays(start, 7);
    const actual = shops
      .filter((s) => { const d = String(s?.date || '').slice(0, 10); return d >= start && d < end; })
      .reduce((sum, s) => sum + (Number(s?.total) || 0), 0);
    const planned = Object.entries(plan)
      .filter(([d]) => d >= start && d < end)
      .reduce((sum, [, day]) => sum + Object.values(day).reduce((n, recipeId) => {
        const recipe = recipesById.get(recipeId);
        return n + (recipe ? (Number(recipe.costPerServing) || 0) * portions : 0);
      }, 0), 0);
    if (actual <= 0 && planned <= 0) continue; // an empty week is not evidence
    rows.push({
      start,
      actual: Math.round(actual * 100) / 100,
      planned: Math.round(planned * 100) / 100,
      budget: weeklyBudget,
      variance: Math.round((actual - weeklyBudget) * 100) / 100,
      plannedVariance: planned > 0 ? Math.round((actual - planned) * 100) / 100 : null,
    });
  }
  if (!rows.length) return empty;
  return {
    weeks: rows.length,
    overBudgetWeeks: rows.filter((row) => row.actual > weeklyBudget).length,
    meanVariance: Math.round((rows.reduce((s, r) => s + r.variance, 0) / rows.length) * 100) / 100,
    meanPlannedVariance: rows.some((r) => r.plannedVariance != null)
      ? Math.round((rows.reduce((s, r) => s + (r.plannedVariance ?? 0), 0) / rows.filter((r) => r.plannedVariance != null).length) * 100) / 100
      : null,
    rows,
  };
};

/**
 * Learn how THIS household actually responds to recommendations, from the
 * ledger alone — the one timeline of what really happened. Every signal is
 * dated, so the profile decays: last month's rejection matters less than
 * last night's. Nothing here touches state; it is a pure reading.
 *
 *   acceptance  — recommended recipes the household cooked (vs rejected)
 *   skipRate    — planned meals that became skips, by reason
 *   substitutions — cooked-off-plan swaps away from what was suggested
 *   wasteBias   — wasted ingredients pulling riskier picks down
 *   budgetDiscipline — over-budget weeks pulling budget weight up
 *   timeAccuracy — actual cooking minutes vs estimates steering time weight
 */
export const learnMealDecisionProfile = (state = {}, { today = dayStamp(), recipesById = {} } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const cookingTimeHistory = Array.isArray(state.cookingTimeHistory) ? state.cookingTimeHistory : [];
  const shops = Array.isArray(state.shops) ? state.shops : [];

  // Half-life decay: a signal loses half its weight every 28 days.
  const ageDays = (at) => {
    if (!at) return 0;
    const t = new Date(`${String(today)}T12:00:00`);
    const s = new Date(String(at));
    if (Number.isNaN(s.getTime())) return 0;
    return Math.max(0, Math.round((t - s) / 86400000));
  };
  const weightAt = (at) => Math.pow(0.5, ageDays(at) / 28);

  const accepted = {};
  const rejected = {};
  const cookedCount = {};
  const skippedWithReason = {};
  let acceptedWeight = 0;
  let rejectedWeight = 0;
  let substitutionWeight = 0;
  let responseTotalRaw = 0;
  let cookedSignalCount = 0;

  for (const e of ledger) {
    const w = weightAt(e.at);
    if (e.type === 'RecommendationAccepted' && e.recipeId) {
      accepted[e.recipeId] = (accepted[e.recipeId] || 0) + w;
      acceptedWeight += w;
      responseTotalRaw += 1;
    } else if (e.type === 'RecommendationRejected' && e.recipeId) {
      rejected[e.recipeId] = (rejected[e.recipeId] || 0) + w;
      rejectedWeight += w;
      responseTotalRaw += 1;
    } else if (e.type === 'MealCooked' && e.recipeId) {
      cookedCount[e.recipeId] = (cookedCount[e.recipeId] || 0) + 1;
      cookedSignalCount += 1;
      if (e.substituted) substitutionWeight += w;
    } else if (e.type === 'MealSkipped' && e.reason) {
      skippedWithReason[e.reason] = (skippedWithReason[e.reason] || 0) + w;
    }
  }

  // Acceptance of what we suggested — the headline learning signal.
  const responseTotal = acceptedWeight + rejectedWeight;
  const acceptanceRate = responseTotal > 0 ? acceptedWeight / responseTotal : null;

  // Waste: disliked/overcooked ingredients the household threw away recently.
  const waste = Array.isArray(state.waste) ? state.waste : [];
  const wasteByIngredient = {};
  for (const row of waste) {
    const key = String(row?.name || '').trim().toLowerCase();
    if (!key) continue;
    // waste rows carry a date, not an ISO stamp — approximate the same decay.
    const w = weightAt(row.date ? `${row.date}T12:00:00.000Z` : null);
    wasteByIngredient[key] = (wasteByIngredient[key] || 0) + w;
  }
  const wasteWeightTotal = Object.values(wasteByIngredient).reduce((s, v) => s + v, 0);

  // Budget discipline — the real thing, not a proxy. A big single shop
  // says nothing; what matters is how whole WEEKS actually went: recorded
  // spend per week against the budget, and against what the plan implied
  // where the plan had recipes with prices. Deterministic, honest, and
  // empty weeks never count as evidence.
  const budget = weeklyBudgetReality(state, { today, recipes: recipesById });
  const overBudgetWeeks = budget.overBudgetWeeks;

  // Time accuracy: how far actual minutes sit from estimates, decayed.
  let timeDelta = 0;
  let timeSamples = 0;
  for (const row of cookingTimeHistory) {
    const actual = Number(row?.actualMins);
    const est = Number(row?.estimatedMins);
    if (!Number.isFinite(actual) || !Number.isFinite(est) || actual <= 0 || est <= 0) continue;
    const w = weightAt(row.date ? `${row.date}T12:00:00.000Z` : null);
    timeDelta += w * (actual - est) / Math.max(1, est);
    timeSamples += w;
  }
  const timeBias = timeSamples > 0 ? timeDelta / timeSamples : null; // + = cooking takes longer than recipes say

  const evidence = responseTotalRaw + cookedSignalCount + waste.length + cookingTimeHistory.length;
  const confidence = evidence >= 12 ? 'high' : evidence >= 5 ? 'medium' : evidence > 0 ? 'low' : 'none';

  return {
    acceptanceRate,
    acceptedByRecipe: accepted,
    rejectedByRecipe: rejected,
    cookedCount,
    skippedWithReason,
    substitutionWeight,
    wasteByIngredient,
    wasteWeightTotal,
    budget,
    overBudgetWeeks,
    timeBias,
    timeSamples,
    evidence: Math.round(evidence * 100) / 100,
    confidence,
    /** Per-recipe affinity in [-1, 1]: accepted/cooked up, rejected down. */
    affinityFor(recipeId) {
      const a = accepted[recipeId] || 0;
      const r = rejected[recipeId] || 0;
      const c = Math.min(3, cookedCount[recipeId] || 0);
      const total = a + r + c;
      if (total <= 0) return 0;
      return Math.max(-1, Math.min(1, (a + c * 0.6 - r * 1.2) / total));
    },
  };
};

/**
 * Rank recipes for one evening. Returns [{ recipe, score, confidence,
 * reasons[], explanation, blocked }] sorted best-first. Blocked (allergen /
 * diet / religious) rows sort last with score 0 and reasons saying why.
 *
 * Learning arrives two ways: the household model (what the household likes,
 * tolerates and wastes) and the decision profile (how it responded to past
 * suggestions). Both adjust the weights; hard dietary lines never move.
 */
export const rankMealsForTonight = ({
  recipes = [],
  pantry = [],
  leftovers = [],
  taste = null,
  householdModel = null,
  decisionProfile = null,
  diets = [],
  allergies = [],
  intolerances = [],
  religious = [],
  members = [],
  cooked = [],
  waste = [],
  date = dayStamp(),
  today = dayStamp(),
  availableMinutes = null,
  people = 2,
  budgetPerServing = 4,
  month = null,
  maxResults = 12,
} = {}) => {
  const pantryNames = pantry.map((p) => p.name);
  const wasteNames = new Set((waste || []).filter((w) => w.reason === 'disliked').map((w) => String(w.name || '').toLowerCase()));
  const m = month || Number(String(today).slice(5, 7)) || new Date().getMonth() + 1;
  const model = householdModel || {};
  const profile = decisionProfile || null;
  const preferences = fact(model.preferences);
  const effort = fact(model.effortTolerance);
  const wasteLearning = fact(model.wasteProbability);
  const pricing = fact(model.priceSensitivity);

  // Weight adjustment starts from the model's confidence levels…
  let coverageDelta = -0.06 * preferences.level - 0.05 * effort.level - 0.04 * pricing.level;
  let preferenceDelta = 0.06 * preferences.level;
  let timeDelta = 0.05 * effort.level;
  let budgetDelta = 0.04 * pricing.level;
  let wasteDelta = 0.04 * wasteLearning.level;

  // …then the decision profile bends them by what actually happened.
  if (profile) {
    const learnable = profile.confidence === 'high' ? 1 : profile.confidence === 'medium' ? 0.6 : profile.confidence === 'low' ? 0.3 : 0;
    if (learnable) {
      // Accepted suggestions say we can lean on learned taste harder.
      if (profile.acceptanceRate != null) preferenceDelta += learnable * 0.05 * (profile.acceptanceRate - 0.5) * 2;
      // Frequent substitutions say our pantry reasoning misses — trust coverage more, taste less.
      if (profile.substitutionWeight > 0.5) { coverageDelta += learnable * 0.03; preferenceDelta -= learnable * 0.02; }
      // Skipping for time reasons says the time fit matters more here.
      if ((profile.skippedWithReason['no-time'] || 0) > 0.5) timeDelta += learnable * 0.04;
      // Over-budget weeks push budget weight up.
      if (profile.overBudgetWeeks >= 2) budgetDelta += learnable * 0.04;
      // Cooking takes longer than the book says → trust the time fit harder.
      if (profile.timeBias != null && profile.timeBias > 0.2) timeDelta += learnable * 0.03;
      // Waste keeps showing up → weigh waste risk more.
      if (profile.wasteWeightTotal >= 2) wasteDelta += learnable * 0.03;
    }
  }

  const weights = {
    ...DEFAULT_WEIGHTS,
    coverage: DEFAULT_WEIGHTS.coverage + coverageDelta,
    preference: DEFAULT_WEIGHTS.preference + preferenceDelta,
    time: DEFAULT_WEIGHTS.time + timeDelta,
    budget: DEFAULT_WEIGHTS.budget + budgetDelta,
    waste: DEFAULT_WEIGHTS.waste + wasteDelta,
  };

  const rows = (recipes || []).map((recipe) => {
    const suitability = (() => {
      try {
        return evaluateFoodSuitability(recipe, {
          diets, allergies, intolerances, religious, members, today,
          availableMinutes, skill: null,
        });
      } catch { return { allowed: true, blockers: [], warnings: [] }; }
    })();
    if (!suitability.allowed) {
      return {
        recipe, score: 0, confidence: 'high',
        blocked: true,
        blockers: suitability.blockers || [],
        reasons: [`Not suitable: ${(suitability.blockers || []).join('; ') || 'dietary rule'}`],
        explanation: null,
      };
    }
    const explanation = explainRecommendation(recipe, {
      pantry, pantryNames, today, date, availability: {}, people, month: m, taste, budget: budgetPerServing,
    });
    const coverage = pantryCoverage(recipe, pantryNames);
    const expiring = expiringIngredients(recipe, pantry, today, 3);
    const tasteRaw = taste ? tasteScore(recipe, taste) : 0;
    const taste01 = clamp01((tasteRaw + 3) / 12);
    const time = Number(recipe.time) || 0;
    // When the household's own cooking runs long, score against the
    // estimate it actually experiences, not the one in the book.
    const effectiveTime = profile?.timeBias != null && profile.timeBias > 0
      ? Math.round(time * (1 + Math.min(1, profile.timeBias)))
      : time;
    const timeFit = availableMinutes ? (effectiveTime <= availableMinutes ? 1 : Math.max(0, 1 - (effectiveTime - availableMinutes) / 60)) : 1;
    const cost = Number(recipe.costPerServing) || 0;
    const budgetFit = cost <= budgetPerServing ? 1 : Math.max(0.4, 1 - (cost - budgetPerServing) / Math.max(1, budgetPerServing));
    const repeat = recencyPenalty(recipe.id, cooked, today);
    const leftover = leftoverBonus(recipe, leftovers);
    const disliked = (recipe.ingredients || []).some((i) => wasteNames.has(String(i.name || i).toLowerCase()));
    // Waste risk: high coverage + expiring use = low risk (good).
    const wasteRisk = clamp01(1 - (coverage.pct / 100) * 0.6 - Math.min(0.4, expiring.length * 0.12));
    // Nutrition balance — an explicit, honest factor: kcal per serving
    // against a 600 kcal dinner norm. Light meals score up, heavy ones
    // down, both bounded so no single dish is buried by one number.
    const kcal = Number(recipe.kcal) || 0;
    const nutritionBalance = kcal
      ? clamp01(1 - Math.abs(kcal - 600) / 600)
      : 0.5; // unknown nutrition is neutral, never punished or rewarded
    // Household-specific affinity: did they accept, cook or reject this
    // exact recipe before?
    const affinity = profile ? profile.affinityFor(recipe.id) : 0;

    const score = Math.round((
      explanation.score * weights.coverage
      + (0.5 + taste01 + 0.12 * affinity) * weights.preference
      + timeFit * weights.time
      + budgetFit * weights.budget
      + (1 - wasteRisk) * weights.waste
      + nutritionBalance * weights.nutrition
      + leftover * weights.leftover
      - repeat * 0.8
      - (disliked ? 0.5 : 0)
      - (affinity < 0 ? Math.min(0.4, -affinity * 0.3) : 0)
      - (suitability.warnings?.length ? 0.06 * suitability.warnings.length : 0)
    ) * 1000) / 1000;

    const evidence = (coverage.have || 0) + expiring.length + (taste?.rated ? 1 : 0) + (cooked.length ? 1 : 0)
      + byConfidence(model.preferences) + byConfidence(model.mealAcceptance) + byConfidence(model.wasteProbability)
      + (profile?.evidence >= 5 ? 1 : 0);
    const confidence = !pantry.length && !taste?.rated && !householdModel && !profile ? 'low'
      : evidence >= 7 ? 'high' : evidence >= 4 ? 'medium' : 'low';

    const reasons = [
      `${coverage.pct}% already in your kitchen`,
      expiring.length ? `Uses ${expiring.map((e) => e.pantryItem.name.toLowerCase()).join(', ')} before it goes off` : null,
      leftover > 0 ? 'Puts saved leftovers to work' : null,
      availableMinutes && effectiveTime > availableMinutes ? `${effectiveTime} min is longer than your ${availableMinutes} min window` : `${time || '?'} min to cook`,
      `£${cost.toFixed(2)}/serving`,
      kcal ? `${kcal} kcal/serving` : null,
      repeat >= 0.18 ? 'Cooked very recently — variety counts against it' : null,
      disliked ? 'Uses something this household disliked before' : null,
      affinity > 0.3 ? 'You took this suggestion before' : null,
      affinity < -0.3 ? 'Rejected when suggested before' : null,
    ].filter(Boolean);

    return {
      recipe, score, confidence, reasons, explanation, suitability, blocked: false,
      wasteRisk: Math.round(wasteRisk * 100) / 100,
      learning: {
        used: Boolean(householdModel || profile),
        preferenceConfidence: preferences.confidence,
        effortConfidence: effort.confidence,
        wasteConfidence: wasteLearning.confidence,
        priceConfidence: pricing.confidence,
        decisionConfidence: profile?.confidence || 'none',
        weights,
      },
    };
  });

  rows.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return b.score - a.score;
  });
  return maxResults ? rows.slice(0, maxResults) : rows;
};

/**
 * The single answer to “What should we eat tonight?”.
 * Returns { pick, ranked, confidence, reasons, alternatives }.
 */
export const decideTonight = (options = {}) => {
  const ranked = rankMealsForTonight(options);
  const viable = ranked.filter((r) => !r.blocked);
  const pick = viable[0] || null;
  return {
    pick,
    ranked,
    confidence: pick?.confidence || 'none',
    reasons: pick?.reasons || (ranked.length ? ['No suitable recipe in the current book — try relaxing time or budget.'] : ['Recipe book is empty.']),
    alternatives: viable.slice(1, 4).map((r) => r.recipe),
    blockedCount: ranked.length - viable.length,
    learning: pick?.learning || {
      used: false,
      preferenceConfidence: 'none',
      effortConfidence: 'none',
      wasteConfidence: 'none',
      priceConfidence: 'none',
      decisionConfidence: 'none',
    },
  };
};
