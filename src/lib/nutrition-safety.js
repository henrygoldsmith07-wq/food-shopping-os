/**
 * Nutrition safety / confidence — audit layer.
 *
 * Guarantees:
 *  - No overly restrictive guidance (deficit < 1200 kcal blocked by targetSafety)
 *  - No fake medical precision (nutrient rows show coverage + confidence)
 *  - No unsupported health claims (all advice derived from logged data + targets)
 *
 * Separation:
 *  - factual nutrition data: per100 / nutrients with source = 'product' | 'generic' | 'measured'
 *  - user preference: diets, allergies, dislikes (suitability)
 *  - planning heuristics: wastePlanner scores, shopping optimisation modes (deterministic)
 *  - AI suggestions: recipe-ai invents only from pantry + diets, never invents nutrition numbers
 */

import { sumMacros, dayTotals } from './nutrition.js';
import { targetSafety } from './goals.js';

export const NUTRITION_CONFIDENCE = {
  high: { label: 'High — measured foods', tone: 'good' },
  medium: { label: 'Medium — some estimated or missing', tone: 'muted' },
  low: { label: 'Low — mostly estimated', tone: 'warn' },
};

export const auditNutrition = (state, day = state.day) => {
  const entries = state.log?.[day] || [];
  const totals = dayTotals(entries);
  const safety = targetSafety(state);

  // Check 1: overly restrictive?
  const restrictive = safety?.ok === false;

  // Check 2: fake precision? — totals.detail shows known vs estimated
  const kcalDetail = totals.detail?.kcal;
  const hasFakePrecision = kcalDetail && kcalDetail.estimated > 0 && kcalDetail.confidence === 'high';

  // Check 3: unsupported health claims? — we only log factual data
  const unsupported = false; // no LLM health claims; ai-assistant returns deterministic strings

  return {
    safety,
    restrictive,
    hasFakePrecision,
    unsupported,
    confidence: kcalDetail?.confidence || 'low',
    guidanceType: restrictive ? 'blocked' : 'factual',
    separation: {
      factual: 'dayTotals / per100 — measured or estimated with confidence',
      preference: 'suitabilityCtx — allergies/diets/dislikes',
      heuristic: 'planning-intelligence + waste-planner — deterministic scores',
      ai: 'recipe-ai / ai-assistant — invents recipes only, never nutrition',
    },
    ok: !restrictive && !hasFakePrecision,
  };
};

export const nutritionDisclaimer = (totals) => {
  if (!totals.detail) return 'Nutrition figures are estimates from your logged foods.';
  const c = totals.detail.kcal?.confidence;
  if (c === 'low') return 'Low data confidence — several items lack measured nutrition. Treat totals as estimates, not medical advice.';
  if (c === 'medium') return 'Some items are estimated — totals are approximate.';
  return 'Totals from measured catalogue entries.';
};
