/**
 * Intelligence loop — the explicit DATA → OBSERVATION → SIGNAL → PREDICTION
 * → RECOMMENDATION → ACTION → OUTCOME → CORRECTION → BETTER MODEL pipeline.
 *
 * Nothing here invents a fact. Each stage is a thin deterministic wrapper over
 * the learner that already owns it, so the loop is one readable place without
 * becoming a second implementation:
 *
 *   observations  ← cooked, waste, shops, pantryEvents, mealPlanEvents, ledger
 *   signals       ← household-model facts + household-preferences + waste profile
 *   predictions   ← waste-prediction + consumption + meal-decision profile
 *   recommendations ← meal-decision / week-optimizer / shopping-optimisation
 *   actions       ← plan applied, list checked, meal cooked
 *   outcomes      ← plan-outcome, household-outcomes, savings
 *   corrections   ← prediction-feedback, override-learning, skip-preferences
 *
 * Prefer deterministic logic throughout; AI (when used) operates over the
 * structured context this module assembles, never over raw household text.
 */

import { buildHouseholdModel } from './household-model.js';
import { learnHouseholdPreferences } from './household-preferences.js';
import { wasteLearningProfile } from './waste-learning.js';
import { mealPlanAdherence, repeatFatigue, cookingTimeLearning } from './planning-intelligence.js';
import { predictUnusedIngredients } from './waste-prediction.js';
import { weekDates } from './kitchen-dates.js';

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * What happened — the raw evidence, never inferred.
 */
export const collectObservations = (state = {}) => ({
  cooked: arr(state.cooked),
  waste: arr(state.waste),
  shops: arr(state.shops),
  pantryEvents: arr(state.pantryEvents),
  mealPlanEvents: arr(state.mealPlanEvents),
  ledger: arr(state.householdLedger),
  tasteRatings: state.tasteRatings || {},
  favourites: arr(state.favourites),
  cookingTimeHistory: arr(state.cookingTimeHistory),
  preferenceEvents: arr(state.preferenceEvents),
  autopilotOutcomes: arr(state.autopilotOutcomes),
  predictionCorrections: arr(state.predictionCorrections),
  quantityOverrides: arr(state.quantityOverrides),
});

/**
 * Patterns detected from observations. Every signal carries confidence +
 * evidenceCount via the household model; weak evidence stays weak.
 */
export const detectSignals = (state = {}, { recipes = [], today = state.day } = {}) => {
  let model = null;
  try {
    model = buildHouseholdModel(state, { recipes, today });
  } catch {
    model = null;
  }
  let preferences = null;
  try {
    preferences = learnHouseholdPreferences({
      recipes,
      cooked: arr(state.cooked),
      ratings: state.tasteRatings || {},
      cookingTimeHistory: arr(state.cookingTimeHistory),
      feedback: arr(state.preferenceEvents),
      waste: arr(state.waste),
      today,
    });
  } catch {
    preferences = null;
  }
  return { model, preferences };
};

/**
 * What is likely to happen — waste + adherence + fatigue, all evidence-gated.
 */
export const predictOutcomes = (state = {}, { recipes = [], today = state.day } = {}) => {
  const dates = weekDates(today);
  let wastePrediction = null;
  try {
    const wasteProfile = wasteLearningProfile(arr(state.waste), { learnedAliases: state.aliasMemory });
    wastePrediction = predictUnusedIngredients({
      pantry: arr(state.pantry),
      plan: state.plan || {},
      dates,
      recipes,
      today,
      wasteProfile,
      learnedAliases: state.aliasMemory || {},
    });
  } catch {
    wastePrediction = null;
  }
  let adherence = null;
  let fatigue = null;
  let cookingTime = null;
  try {
    adherence = mealPlanAdherence(state.plan || {}, dates, arr(state.mealPlanEvents), arr(state.cooked));
  } catch { adherence = null; }
  try {
    fatigue = repeatFatigue(state.plan || {}, dates, arr(state.cooked), { today });
  } catch { fatigue = null; }
  try {
    cookingTime = cookingTimeLearning(arr(state.cookingTimeHistory), recipes);
  } catch { cookingTime = null; }
  return { wastePrediction, adherence, fatigue, cookingTime };
};

/**
 * One entry point for the loop: observations → signals → predictions.
 * Recommendations themselves stay with the domain engines (meal-decision,
 * weekly-autopilot, shop-decision) so scoring is never duplicated.
 */
export const intelligenceLoop = (state = {}, { recipes = [], today = state.day } = {}) => {
  const observations = collectObservations(state);
  const signals = detectSignals(state, { recipes, today });
  const predictions = predictOutcomes(state, { recipes, today });
  const evidenceCount =
    observations.cooked.length + observations.waste.length + observations.shops.length;
  return {
    observations,
    signals,
    predictions,
    evidenceCount,
    ready: evidenceCount > 0 && Boolean(signals.model),
    stages: ['observation', 'signal', 'prediction', 'recommendation', 'action', 'outcome', 'correction'],
  };
};
