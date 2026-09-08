/**
 * Household evaluation — one honest scorecard for learning quality.
 *
 * Covers: prediction error, waste reduction, unplanned shops,
 * recommendation acceptance, portion accuracy, Autopilot undo rate.
 * Every metric carries { value, confidence, evidence, assumption }.
 * Empty households return { ready: false } with nulls, never zeros dressed up.
 */

import { predictionLearningProfile } from './prediction-feedback.js';
import { householdWasteMetrics } from './waste-metrics.js';
import { recommendationAcceptance } from './event-ledger.js';
import { dayStamp } from './kitchen-dates.js';

const metric = (value, { confidence = 'none', evidence = 0, assumption = '' } = {}) => ({
  value, confidence, evidence, assumption,
});

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

/** Shops with no plan coverage that week count as unplanned. */
const unplannedShopsFrom = (shops = [], plan = {}) => {
  const plannedDates = new Set(Object.keys(plan || {}));
  let unplanned = 0;
  for (const shop of shops || []) {
    const date = String(shop.date || '').slice(0, 10);
    if (!date) continue;
    // A shop is "planned" when its week contains at least one planned meal.
    const weekHasPlan = [...plannedDates].some((d) => Math.abs(daysBetween(d, date)) <= 3);
    if (!weekHasPlan) unplanned += 1;
  }
  return unplanned;
};

export const evaluateHousehold = (state = {}, { today = dayStamp() } = {}) => {
  void today;
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const waste = Array.isArray(state.waste) ? state.waste : [];
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const corrections = Array.isArray(state.predictionCorrections) ? state.predictionCorrections : [];
  const outcomes = Array.isArray(state.autopilotOutcomes) ? state.autopilotOutcomes : [];
  const plan = state.plan || {};
  const assumptions = [];

  // --- prediction error (MAE over corrected predictions) ----------------------
  let predictionError = metric(null, { assumption: 'No corrected predictions yet.' });
  try {
    const profile = predictionLearningProfile(corrections);
    const rows = Array.isArray(profile) ? profile : profile?.byType || [];
    const total = rows.reduce((s, r) => s + (r.samples || r.count || 0), 0);
    const mae = rows.length
      ? rows.reduce((s, r) => s + (Number(r.mae ?? r.meanAbsError ?? 0) || 0) * (r.samples || r.count || 0), 0) / Math.max(1, total)
      : null;
    predictionError = metric(
      mae === null || !Number.isFinite(mae) ? null : Math.round(mae * 100) / 100,
      {
        confidence: total >= 20 ? 'high' : total >= 8 ? 'medium' : total > 0 ? 'low' : 'none',
        evidence: total,
        assumption: 'Mean absolute error across user-corrected predictions.',
      },
    );
  } catch { assumptions.push('Prediction profile unavailable.'); }

  // --- waste reduction (this month vs last, from waste-metrics) -----------------
  let wasteReduction = metric(null, { assumption: 'No waste history yet.' });
  try {
    const m = householdWasteMetrics({ waste, shops, today });
    const prevented = Number(m?.estimatedWastePrevented) || 0;
    wasteReduction = metric(Math.round(prevented * 100) / 100, {
      confidence: m?.confidence || ((waste || []).length >= 4 ? 'observed' : 'early estimate'),
      evidence: (waste || []).length,
      assumption: m?.assumption || 'Month-to-date vs prior month.',
    });
  } catch { assumptions.push('Waste metrics unavailable.'); }

  // --- unplanned shops -------------------------------------------------------------
  const unplanned = unplannedShopsFrom(shops, plan);
  const unplannedShops = metric(shops.length ? unplanned : null, {
    confidence: shops.length >= 8 ? 'high' : shops.length >= 3 ? 'medium' : shops.length ? 'low' : 'none',
    evidence: shops.length,
    assumption: 'A shop is unplanned when no planned meal sits within ±3 days.',
  });

  // --- recommendation acceptance (ledger first, fallback to outcomes) ---------------
  let acceptance = recommendationAcceptance(state);
  if (!acceptance.total && outcomes.length) {
    const accepted = outcomes.filter((o) => o.completed).length;
    acceptance = {
      accepted, rejected: outcomes.length - accepted, total: outcomes.length,
      rate: Math.round((accepted / Math.max(1, outcomes.length)) * 100) / 100,
      confidence: outcomes.length >= 8 ? 'high' : outcomes.length >= 3 ? 'medium' : 'low',
    };
  }
  const recommendationAcceptanceMetric = metric(acceptance.total ? acceptance.rate : null, {
    confidence: acceptance.confidence || 'none',
    evidence: acceptance.total,
    assumption: 'Accepted ÷ (accepted + rejected) recommendations.',
  });

  // --- portion accuracy (overcook waste vs cooks) --------------------------------------
  const overcook = waste.filter((w) => w.reason === 'cooked-too-much').length;
  const portionSamples = cooked.length + overcook;
  const portionAccuracy = metric(portionSamples ? Math.round(((cooked.length / portionSamples)) * 100) / 100 : null, {
    confidence: portionSamples >= 12 ? 'high' : portionSamples >= 5 ? 'medium' : portionSamples ? 'low' : 'none',
    evidence: portionSamples,
    assumption: 'Cooks without a cooked-too-much waste event ÷ all cooks.',
  });

  // --- autopilot undo rate ---------------------------------------------------------------
  const undone = outcomes.filter((o) => o.undone).length;
  const autopilotUndoRate = metric(outcomes.length ? Math.round((undone / outcomes.length) * 100) / 100 : null, {
    confidence: outcomes.length >= 12 ? 'high' : outcomes.length >= 4 ? 'medium' : outcomes.length ? 'low' : 'none',
    evidence: outcomes.length,
    assumption: 'Undone autopilot actions ÷ all autopilot outcomes.',
  });

  const evidenceTotal = corrections.length + waste.length + shops.length + outcomes.length + cooked.length;
  return {
    version: 1,
    evaluatedAt: today,
    ready: evidenceTotal >= 4,
    predictionError,
    wasteReduction,
    unplannedShops,
    recommendationAcceptance: recommendationAcceptanceMetric,
    portionAccuracy,
    autopilotUndoRate,
    assumptions,
  };
};
