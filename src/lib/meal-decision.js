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
import { dayStamp, daysUntil } from './kitchen-dates.js';

const DEFAULT_WEIGHTS = {
  coverage: 0.42,
  preference: 0.14,
  time: 0.12,
  budget: 0.1,
  waste: 0.12,
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
 * Rank recipes for one evening. Returns [{ recipe, score, confidence,
 * reasons[], explanation, blocked }] sorted best-first. Blocked (allergen /
 * diet / religious) rows sort last with score 0 and reasons saying why.
 */
export const rankMealsForTonight = ({
  recipes = [],
  pantry = [],
  leftovers = [],
  taste = null,
  householdModel = null,
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
  const preferences = fact(model.preferences);
  const effort = fact(model.effortTolerance);
  const wasteLearning = fact(model.wasteProbability);
  const pricing = fact(model.priceSensitivity);
  const weights = {
    ...DEFAULT_WEIGHTS,
    coverage: DEFAULT_WEIGHTS.coverage
      - 0.06 * preferences.level
      - 0.05 * effort.level
      - 0.04 * pricing.level,
    preference: DEFAULT_WEIGHTS.preference + 0.06 * preferences.level,
    time: DEFAULT_WEIGHTS.time + 0.05 * effort.level,
    budget: DEFAULT_WEIGHTS.budget + 0.04 * pricing.level,
    waste: DEFAULT_WEIGHTS.waste + 0.04 * wasteLearning.level,
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
    const timeFit = availableMinutes ? (time <= availableMinutes ? 1 : Math.max(0, 1 - (time - availableMinutes) / 60)) : 1;
    const cost = Number(recipe.costPerServing) || 0;
    const budgetFit = cost <= budgetPerServing ? 1 : Math.max(0.4, 1 - (cost - budgetPerServing) / Math.max(1, budgetPerServing));
    const repeat = recencyPenalty(recipe.id, cooked, today);
    const leftover = leftoverBonus(recipe, leftovers);
    const disliked = (recipe.ingredients || []).some((i) => wasteNames.has(String(i.name || i).toLowerCase()));
    // Waste risk: high coverage + expiring use = low risk (good).
    const wasteRisk = clamp01(1 - (coverage.pct / 100) * 0.6 - Math.min(0.4, expiring.length * 0.12));

    const score = Math.round((
      explanation.score * weights.coverage
      + (0.5 + taste01) * weights.preference
      + timeFit * weights.time
      + budgetFit * weights.budget
      + (1 - wasteRisk) * weights.waste
      + leftover * weights.leftover
      - repeat * 0.8
      - (disliked ? 0.5 : 0)
      - (suitability.warnings?.length ? 0.06 * suitability.warnings.length : 0)
    ) * 1000) / 1000;

    const evidence = (coverage.have || 0) + expiring.length + (taste?.rated ? 1 : 0) + (cooked.length ? 1 : 0)
      + byConfidence(model.preferences) + byConfidence(model.mealAcceptance) + byConfidence(model.wasteProbability);
    const confidence = !pantry.length && !taste?.rated && !householdModel ? 'low'
      : evidence >= 7 ? 'high' : evidence >= 4 ? 'medium' : 'low';

    const reasons = [
      `${coverage.pct}% already in your kitchen`,
      expiring.length ? `Uses ${expiring.map((e) => e.pantryItem.name.toLowerCase()).join(', ')} before it goes off` : null,
      leftover > 0 ? 'Puts saved leftovers to work' : null,
      availableMinutes && time > availableMinutes ? `${time} min is longer than your ${availableMinutes} min window` : `${time || '?'} min to cook`,
      `£${cost.toFixed(2)}/serving`,
      repeat >= 0.18 ? 'Cooked very recently — variety counts against it' : null,
      disliked ? 'Uses something this household disliked before' : null,
    ].filter(Boolean);

    return {
      recipe, score, confidence, reasons, explanation, suitability, blocked: false,
      wasteRisk: Math.round(wasteRisk * 100) / 100,
      learning: {
        used: Boolean(householdModel),
        preferenceConfidence: preferences.confidence,
        effortConfidence: effort.confidence,
        wasteConfidence: wasteLearning.confidence,
        priceConfidence: pricing.confidence,
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
    },
  };
};
