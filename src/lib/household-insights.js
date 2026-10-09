/**
 * Household insights — the restrained "Forq learned" experience.
 * Concise observation + evidence + confidence + consequence, only with
 * enough evidence. Corrections feed override-learning / taste via store.
 */
import { buildHouseholdModel } from './household-model.js';
import { weekdaySkipRates } from './weekly-autopilot.js';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const gbp = (n) => `£${Number(n).toFixed(2)}`;
export const deriveHouseholdInsights = (state = {}, { recipes = [], today = state.day, max = 3 } = {}) => {
  const out = [];
  try {
    const byDow = weekdaySkipRates(state);
    for (const [dow, r] of Object.entries(byDow)) {
      // `planned` already counts every plan (skipped plans are a subset of it),
      // so it is the natural denominator for "how often is this day skipped" —
      // matching the evidence line below ("X of the last N plans"). Adding
      // skipped again would double-count and make the bar unreachable.
      const planned = r.planned || (r.planned + r.cooked + r.skipped);
      if (planned >= 5 && r.skipped >= 3 && r.skipped / planned >= 0.4) {
        out.push({
          id: `skip-${dow}`, kind: 'skip-day',
          title: `You usually skip planned meals on ${DAY_NAMES[Number(dow)]}.`,
          evidence: `${r.skipped} of the last ${planned} ${DAY_NAMES[Number(dow)]} plans.`,
          consequence: `Keep ${DAY_NAMES[Number(dow)]} flexible next week.`,
          confidence: planned >= 8 ? 'high' : 'medium', evidenceCount: planned,
        });
      }
    }
  } catch { /* no skip signal */ }
  try {
    const model = buildHouseholdModel(state, { recipes, today });
    const effort = model?.effortTolerance?.value;
    if (effort?.typicalMinutes && (model?.effortTolerance?.evidenceCount || 0) >= 3) {
      out.push({
        id: 'fast-cooks', kind: 'time',
        title: `You usually prefer meals around ${effort.typicalMinutes} minutes.`,
        evidence: `${model.effortTolerance.evidenceCount} recorded cooks.`,
        consequence: 'Favour faster meals on busy days.',
        confidence: model.effortTolerance.confidence, evidenceCount: model.effortTolerance.evidenceCount,
      });
    }
    const waste = model?.topWasteRisk?.value;
    if (waste?.name && (model?.topWasteRisk?.evidenceCount || 0) >= 2) {
      out.push({
        id: `waste-${waste.key || waste.name}`, kind: 'waste',
        title: `You repeatedly have ${String(waste.name).toLowerCase()} left over.`,
        evidence: `${waste.count || model.topWasteRisk.evidenceCount} bins recorded.`,
        consequence: 'Buy less of it; the list already adjusts.',
        confidence: model.topWasteRisk.confidence, evidenceCount: model.topWasteRisk.evidenceCount,
      });
    }
  } catch { /* model unavailable */ }
  const dismissed = new Set((state.insightDismissals || []).map((d) => d?.id || d));
  return out.filter((i) => !dismissed.has(i.id)).slice(0, max);
};
export const insightActions = (set) => ({
  dismissInsight: (id) => set((s) => ({ insightDismissals: [...(s.insightDismissals || []), { id, at: s.day }] })),
  keepInsight: (id) => set((s) => ({ insightKept: [...(s.insightKept || []), { id, at: s.day }] })),
});
void gbp;
