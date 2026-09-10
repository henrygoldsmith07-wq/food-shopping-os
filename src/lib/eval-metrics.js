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

const addDays = (stamp, days) => new Date(new Date(`${stamp}T12:00:00`).getTime() + days * 86400000)
  .toISOString().slice(0, 10);

const inPeriod = (row, start, end) => {
  const date = String(row?.date || row?.day || '').slice(0, 10);
  return Boolean(date) && date >= start && date <= end;
};

const rateFor = (count, total) => (total ? Math.round((count / total) * 100) / 100 : null);

/** Longitudinal comparison: the first month a household used Forq vs the latest. */
export const evaluateHouseholdTrend = (state = {}, { today = dayStamp() } = {}) => {
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const waste = Array.isArray(state.waste) ? state.waste : [];
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const mealPlanEvents = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const latestStart = addDays(today, -28);
  const baselineEnd = addDays(today, -29);
  const allDates = [
    ...cooked.map((r) => r.date),
    ...waste.map((r) => r.date),
    ...shops.map((r) => r.date),
    ...mealPlanEvents.map((r) => r.date),
    ...ledger.map((r) => r.day || r.at),
  ].map((date) => String(date || '').slice(0, 10)).filter(Boolean).sort();
  const earliest = allDates[0] || null;
  const baselineStart = earliest || baselineEnd;
  const ready = Boolean(earliest && earliest <= baselineEnd);

  const period = (start, end) => {
    const rows = {
      cooked: cooked.filter((r) => inPeriod(r, start, end)).length,
      waste: waste.filter((r) => inPeriod(r, start, end)).length,
      shops: shops.filter((r) => inPeriod(r, start, end)).length,
      skipped: mealPlanEvents.filter((r) => r.status === 'skipped' && inPeriod(r, start, end)).length,
      accepted: ledger.filter((r) => r.type === 'RecommendationAccepted' && inPeriod(r, start, end)).length,
      rejected: ledger.filter((r) => r.type === 'RecommendationRejected' && inPeriod(r, start, end)).length,
    };
    return {
      ...rows,
      acceptanceRate: rateFor(rows.accepted, rows.accepted + rows.rejected),
      planCompletion: rateFor(rows.cooked, rows.cooked + rows.skipped),
      wastePerCooked: rows.cooked ? Math.round((rows.waste / rows.cooked) * 100) / 100 : null,
    };
  };

  const baseline = period(baselineStart, baselineEnd);
  const latest = period(latestStart, today);
  const delta = (a, b) => (a != null && b != null ? Math.round((b - a) * 100) / 100 : null);
  const changes = {
    planCompletion: delta(baseline.planCompletion, latest.planCompletion),
    wastePerCooked: delta(baseline.wastePerCooked, latest.wastePerCooked),
    acceptanceRate: delta(baseline.acceptanceRate, latest.acceptanceRate),
    shops: delta(baseline.shops, latest.shops),
  };
  const bits = [];
  if (changes.planCompletion != null && changes.planCompletion !== 0) {
    bits.push(`plan completion ${changes.planCompletion > 0 ? 'up' : 'down'} ${Math.abs(changes.planCompletion * 100).toFixed(0)} points`);
  }
  if (changes.wastePerCooked != null && changes.wastePerCooked !== 0) {
    bits.push(`waste per cook ${changes.wastePerCooked > 0 ? 'up' : 'down'} ${Math.abs(changes.wastePerCooked).toFixed(2)}`);
  }
  if (changes.acceptanceRate != null && changes.acceptanceRate !== 0) {
    bits.push(`acceptance ${changes.acceptanceRate > 0 ? 'up' : 'down'} ${Math.abs(changes.acceptanceRate * 100).toFixed(0)} points`);
  }
  const totalEvidence = baseline.cooked + baseline.waste + baseline.shops + baseline.skipped
    + latest.cooked + latest.waste + latest.shops + latest.skipped;
  return {
    ready,
    value: ready ? { changes, conclusion: null } : null,
    confidence: ready ? (totalEvidence >= 12 ? 'high' : totalEvidence >= 4 ? 'medium' : 'low') : 'none',
    evidence: totalEvidence,
    assumption: 'First month of use compared with the latest four weeks.',
    earliest,
    windowDays: 56,
    baseline,
    latest,
    changes,
    conclusion: ready
      ? (bits.length ? `Last month vs first: ${bits.join(' · ')}.` : 'Last month matches the first month — no learned drift yet.')
      : 'Not enough history for a first-month vs latest-month comparison yet.',
  };
};

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
    trend: evaluateHouseholdTrend(state, { today }),
    assumptions,
  };
};
