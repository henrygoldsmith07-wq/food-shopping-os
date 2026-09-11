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
import { recommendationAcceptance, sortLedgerEvents } from './event-ledger.js';
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

/**
 * Recommendation → action → outcome: the full funnel the app is actually
 * judged on. A recommendation only counts as "acted on" when the ledger
 * shows the household cooked that recipe after accepting it; an accepted
 * suggestion never cooked is a shrug, not a win. Outcomes are read from
 * what followed: a MealCooked for the same recipe (good), a MealSkipped
 * for the slot (bad), nothing yet (open).
 *
 * Every row is decayed like the rest of the eval: an acceptance from three
 * months ago is history, this week's is signal.
 */
export const recommendationFunnel = (state = {}, { today = dayStamp() } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  // A leftover eaten is a meal, but it is not the recommendation being
  // cooked — follow-through means the suggested dish itself was made.
  // Attribution is exact where the app can be exact: an acceptance carrying
  // a recommendationId is resolved by a MealCooked carrying the SAME id
  // (the cook session it started), never by an unrelated later cook of the
  // same dish. Only legacy acceptances — recorded before ids existed —
  // fall back to the recipe-and-time heuristic, and say so.
  const cookedWithId = (recommendationId, at) => ledger.some((e) =>
    e.type === 'MealCooked' && !e.leftover && e.recommendationId === recommendationId
    && String(e.at || '') > String(at || ''));
  const cookedRecipeAfter = (recipeId, at) => ledger.some((e) =>
    e.type === 'MealCooked' && !e.leftover && e.recipeId === recipeId && String(e.at || '') > String(at || ''));

  // The one canonical ledger order (see event-ledger.js).
  const rows = sortLedgerEvents(ledger)
    .filter((e) => e.type === 'RecommendationAccepted' || e.type === 'RecommendationRejected'
      || e.type === 'MealCooked' || e.type === 'MealSkipped');
  const accepted = [];
  const rejectedCount = rows.filter((e) => e.type === 'RecommendationRejected').length;
  const actedOnExact = (a) => (a.recommendationId
    ? cookedWithId(a.recommendationId, a.at)
    : Boolean(a.recipeId && cookedRecipeAfter(a.recipeId, a.at)));
  let actedOn = 0;
  let acceptedThenSkipped = 0;
  for (const e of rows) {
    if (e.type === 'RecommendationAccepted') {
      accepted.push(e);
      if (actedOnExact(e)) actedOn += 1;
    } else if (e.type === 'MealSkipped') {
      // The skip resolves the most recent still-open acceptance, if any.
      const openIdx = [...accepted].reverse().findIndex((a) => !actedOnExact(a) && !a.resolved);
      if (openIdx >= 0) accepted[accepted.length - 1 - openIdx].resolved = 'skipped';
    }
  }
  const open = accepted.filter((a) => !a.resolved && !actedOnExact(a)).length;
  acceptedThenSkipped = accepted.filter((a) => a.resolved === 'skipped').length;
  void today;

  const total = accepted.length + rejectedCount;
  return {
    total,
    accepted: accepted.length,
    rejected: rejectedCount,
    actedOn,
    acceptedThenSkipped,
    open,
    acceptanceRate: rateFor(accepted.length, total),
    /** Of the accepted, how many became a real cooked meal. */
    followThrough: rateFor(actedOn, accepted.length),
    assumption: 'Accepted → cooked is matched on the recommendation id the cook session carried; only legacy events without ids fall back to recipe-and-time.',
    confidence: total >= 8 ? 'high' : total >= 3 ? 'medium' : total > 0 ? 'low' : 'none',
    evidence: total,
  };
};

/**
 * Learning stages: how long the household has actually been using Forq.
 *   cold-start   — under 2 weeks of history (defaults do the talking)
 *   early        — 2–8 weeks (learning has something to chew on)
 *   established — past 8 weeks (the model should be earning its keep)
 * Stage windows are inclusive of the day itself, and read from the earliest
 * dated observation in state, never from install guesses.
 */
export const householdLearningStage = (state = {}, { today = dayStamp() } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const shops = Array.isArray(state.shops) ? state.shops : [];
  const allDates = [
    ...cooked.map((r) => r.date),
    ...shops.map((r) => r.date),
    ...ledger.map((r) => r.day || String(r.at || '').slice(0, 10)),
  ].map((date) => String(date || '').slice(0, 10)).filter(Boolean).sort();
  const earliest = allDates[0] || null;
  if (!earliest) return { stage: 'cold-start', daysOfHistory: 0, earliest: null };
  const days = daysBetween(earliest, today);
  const stage = days >= 56 ? 'established' : days >= 14 ? 'early' : 'cold-start';
  return { stage, daysOfHistory: Math.max(0, days), earliest };
};

/**
 * Longitudinal performance by learning stage: did the app do better once it
 * knew the household? Compares recommendation follow-through, plan
 * completion and waste-per-cook across the cold-start, early and
 * established windows, using only the events dated inside each window —
 * the same three numbers the Outcome Dashboard already shows, but split by
 * where the household was in its learning journey. Windows with no events
 * read as null, never zero.
 */
export const evaluateLearningStages = (state = {}, { today = dayStamp() } = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const cooked = Array.isArray(state.cooked) ? state.cooked : [];
  const waste = Array.isArray(state.waste) ? state.waste : [];
  const mealPlanEvents = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const { earliest } = householdLearningStage(state, { today });
  if (!earliest) {
    return {
      ready: false,
      stages: {},
      conclusion: 'No history yet — the cold-start numbers are the defaults, not learning.',
      assumption: 'Stages split on earliest dated observation: cold-start <2 weeks, early 2–8, established 8+.',
    };
  }
  const daysOfHistory = Math.max(0, daysBetween(earliest, today));
  // Window ends: cold-start ends at day 13, early ends at day 55.
  const windows = {
    'cold-start': [earliest, addDays(earliest, Math.min(13, daysOfHistory))],
    'early': [addDays(earliest, 14), addDays(earliest, Math.min(55, daysOfHistory))],
    'established': [addDays(earliest, 56), today],
  };
  const stages = {};
  for (const [name, [start, end]] of Object.entries(windows)) {
    if (daysOfHistory < (name === 'early' ? 14 : name === 'established' ? 56 : 0)) {
      stages[name] = { active: false, cooked: null, wastePerCooked: null, planCompletion: null, followThrough: null };
      continue;
    }
    const rows = {
      cooked: cooked.filter((r) => inPeriod(r, start, end)).length,
      waste: waste.filter((r) => inPeriod(r, start, end)).length,
      skipped: mealPlanEvents.filter((r) => r.status === 'skipped' && inPeriod(r, start, end)).length,
      accepted: ledger.filter((r) => r.type === 'RecommendationAccepted' && inPeriod(r, start, end)).length,
      acceptedActed: ledger.filter((r) => r.type === 'RecommendationAccepted' && inPeriod(r, start, end)
        && cooked.some((c) => c.recipeId === r.recipeId && inPeriod(c, start, end))).length,
      plannedCooked: mealPlanEvents.filter((r) => (r.status === 'cooked' || r.status === 'substituted') && inPeriod(r, start, end)).length,
    };
    stages[name] = {
      active: true,
      cooked: rows.cooked,
      wastePerCooked: rows.cooked ? Math.round((rows.waste / rows.cooked) * 100) / 100 : null,
      planCompletion: rateFor(rows.plannedCooked, rows.plannedCooked + rows.skipped),
      followThrough: rateFor(rows.acceptedActed, rows.accepted),
    };
  }
  const activeNames = Object.entries(stages).filter(([, s]) => s.active).map(([n]) => n);
  const conclusion = activeNames.length < 2
    ? `Only the ${activeNames[0] || 'cold-start'} window has history so far — later stages are still ahead.`
    : `Comparing ${activeNames.join(' → ')}: follow-through ${activeNames.map((n) => `${n} ${stages[n].followThrough ?? '—'}`).join(', ')}.`;
  return {
    ready: activeNames.length >= 2,
    stages,
    conclusion,
    assumption: 'Windows measured from the earliest dated observation; a window with no events reads null, never zero.',
  };
};

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
    version: 2,
    evaluatedAt: today,
    ready: evidenceTotal >= 4,
    predictionError,
    wasteReduction,
    unplannedShops,
    recommendationAcceptance: recommendationAcceptanceMetric,
    recommendationFunnel: recommendationFunnel(state, { today }),
    learningStages: evaluateLearningStages(state, { today }),
    learningStage: householdLearningStage(state, { today }).stage,
    portionAccuracy,
    autopilotUndoRate,
    trend: evaluateHouseholdTrend(state, { today }),
    assumptions,
  };
};
