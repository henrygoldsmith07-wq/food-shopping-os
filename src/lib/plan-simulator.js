/** Explainable what-if planning for difficult household trade-offs. */
import { rankPlans } from './optimiser.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export const DEFAULT_SIMULATION = {
  weeklyBudget: null,
  maxTimeMins: null,
  strictEquipment: false,
  weights: {},
};

const diffMetric = (before, after) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].map((key) => ({
    key,
    before: before?.[key] ?? null,
    after: after?.[key] ?? null,
    delta: before?.[key] == null || after?.[key] == null ? null : after[key] - before[key],
  }));
};

export const explainTradeoffs = (result) => {
  if (!result) return [];
  const metrics = result.metrics || {};
  const reasons = [...(result.reasons || [])];
  if (metrics.pantryCoverage != null && metrics.pantryCoverage < 0.5) reasons.push('Requires a larger shop because less than half of the ingredients are already on hand.');
  if (metrics.timeFit != null && metrics.timeFit < 100) reasons.push('Some meals exceed the available cooking time.');
  if (metrics.equipmentFit != null && metrics.equipmentFit < 1) reasons.push('At least one meal needs equipment outside the selected kitchen profile.');
  return [...new Set(reasons)].slice(0, 6);
};

export const simulatePlan = (candidates, context = {}) => {
  const options = { ...DEFAULT_SIMULATION, ...context };
  const result = rankPlans(candidates, options);
  const best = result.best;
  return {
    ...result,
    options,
    summary: best ? `Plan score ${best.score}/100 across ${best.meals.length} meals.` : 'No plan could be scored.',
    tradeoffs: explainTradeoffs(best),
    dimensions: best ? Object.entries(best.metrics).map(([key, value]) => ({ key, value: value == null ? null : clamp(value * (['pantryCoverage', 'expiryCoverage', 'equipmentFit'].includes(key) ? 100 : 1)) })) : [],
  };
};

export const compareSimulations = (candidates, baseContext = {}, nextContext = {}) => {
  const base = simulatePlan(candidates, baseContext);
  const next = simulatePlan(candidates, { ...baseContext, ...nextContext });
  return {
    base,
    next,
    scoreDelta: (next.best?.score ?? 0) - (base.best?.score ?? 0),
    metricChanges: diffMetric(base.best?.metrics, next.best?.metrics),
    changedWinner: base.best?.candidateIndex !== next.best?.candidateIndex,
  };
};

export const robustScenario = (candidates, context = {}) => {
  const scenarios = [
    context,
    { ...context, weeklyBudget: context.weeklyBudget == null ? null : context.weeklyBudget * 0.85 },
    { ...context, maxTimeMins: context.maxTimeMins == null ? null : context.maxTimeMins * 0.75 },
  ].map((scenario) => simulatePlan(candidates, scenario));
  const viable = scenarios.filter((scenario) => scenario.best && scenario.best.score >= 0);
  if (!viable.length) return { best: null, scenarios };
  const winner = [...viable].sort((a, b) => (b.best.score + (b.best.metrics.variety || 0) * 0.05) - (a.best.score + (a.best.metrics.variety || 0) * 0.05))[0];
  return { best: winner.best, scenarios, confidence: Math.round(viable.reduce((sum, scenario) => sum + scenario.best.score, 0) / viable.length) };
};

export const sensitivityAnalysis = (candidates, context = {}) => {
  const dimensions = ['weeklyBudget', 'maxTimeMins', 'strictEquipment'];
  return dimensions.map((key) => {
    const value = context[key];
    const alternatives = key === 'strictEquipment' ? [!value] : [value == null ? 30 : Math.max(1, value * 0.75), value == null ? 60 : value * 1.25];
    return {
      key,
      scenarios: alternatives.map((alternative) => ({ value: alternative, ...compareSimulations(candidates, context, { [key]: alternative }) })),
    };
  });
};
