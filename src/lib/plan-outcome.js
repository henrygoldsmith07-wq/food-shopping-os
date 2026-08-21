/**
 * Plan vs reality tracking — honest, household-editable, learning-friendly.
 *
 * Tracks:
 *  - meals planned
 *  - meals actually cooked (or substituted)
 *  - skipped meals with reasons
 *  - substitutions (cooked a different meal)
 *  - leftovers used vs planned
 *  - takeaway / unplanned meal if recorded
 *
 * Reasons include:
 *  no time · missing ingredients · changed preference · leftovers available · plan too complex
 *  plus the existing youth-safe set.
 */

import { planEntries } from './mealplan.js';

export const PLAN_REASONS = [
  { id: 'no-time', label: 'No time' },
  { id: 'missing-ingredients', label: 'Missing ingredients' },
  { id: 'changed-preference', label: 'Changed preference' },
  { id: 'leftovers-available', label: 'Leftovers available' },
  { id: 'plan-too-complex', label: 'Plan too complex' },
  { id: 'not-in-the-mood', label: 'Not in the mood' },
  { id: 'plans-changed', label: 'Plans changed' },
  { id: 'ate-something-else', label: 'Ate something else' },
  { id: 'takeaway', label: 'Takeaway / ate out' },
  { id: 'cooked-a-different-meal', label: 'Cooked a different meal' },
  { id: 'other', label: 'Something else' },
];

const REASON_BY_ID = new Map(PLAN_REASONS.map((r) => [r.id, r.label]));
export const reasonLabel = (id) => REASON_BY_ID.get(id) || id || 'Something else';

const eventKey = (date, slot) => `${date}|${slot}`;

/**
 * Build plan vs reality for a date range.
 * @param {object} plan - state.plan
 * @param {string[]} dates - range
 * @param {Array} events - state.mealPlanEvents
 * @param {Array} cooked - state.cooked
 * @param {Array} pantry - state.pantry (to detect leftovers used)
 */
export const planOutcome = (plan = {}, dates = [], events = [], cooked = [], pantry = []) => {
  const latest = new Map();
  for (const e of [...events].sort((a, b) => Number(a.at || 0) - Number(b.at || 0))) {
    if (e?.date && e?.slot) latest.set(eventKey(e.date, e.slot), e);
  }
  const entries = planEntries(plan, dates);
  const rows = entries.map((entry) => {
    const event = latest.get(eventKey(entry.date, entry.slot));
    const status = event?.status || 'pending';
    const isLeftoverUsed = (() => {
      if (!pantry) return false;
      const leftovers = pantry.filter((p) => p.cat === 'Leftovers' && p.recipeId === entry.recipeId);
      return leftovers.length > 0;
    })();
    return {
      ...entry,
      status,
      reason: event?.reason || null,
      reasonLabel: event?.reason ? reasonLabel(event.reason) : null,
      actualRecipeId: event?.actualRecipeId || (status === 'cooked' ? entry.recipeId : null),
      substituted: status === 'substituted',
      leftoverUsed: status === 'cooked' && isLeftoverUsed,
      unplanned: false,
      at: event?.at || null,
      completed: status === 'cooked' || status === 'substituted',
    };
  });

  // Detect takeaway / unplanned meals: cooked events with no matching plan slot
  const plannedKeys = new Set(entries.map((e) => `${e.date}|${e.recipeId}`));
  const unplannedCooked = (cooked || []).filter((c) => !plannedKeys.has(`${c.date}|${c.recipeId}`));
  const unplannedRows = unplannedCooked.map((c) => ({
    date: c.date,
    slot: 'unplanned',
    recipeId: c.recipeId,
    status: 'unplanned',
    reason: c.reason || 'takeaway',
    reasonLabel: reasonLabel(c.reason || 'takeaway'),
    unplanned: true,
    takeaway: true,
  }));

  const completed = rows.filter((r) => r.completed).length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  const substituted = rows.filter((r) => r.status === 'substituted').length;
  const leftoversUsed = rows.filter((r) => r.leftoverUsed).length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const adherence = rows.length ? Math.round((completed / rows.length) * 100) : null;

  const reasons = {};
  for (const r of rows.filter((row) => row.status === 'skipped')) {
    const key = r.reason || 'other';
    reasons[key] = (reasons[key] || 0) + 1;
  }

  // Learning signals for next plan: top skip reasons, substitution frequency, takeaway frequency
  const learning = {
    topSkipReason: Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    topSkipLabel: Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] ? reasonLabel(Object.entries(reasons).sort((a, b) => b[1] - a[1])[0][0]) : null,
    substitutionRate: rows.length ? Math.round((substituted / rows.length) * 100) : 0,
    takeawayCount: unplannedRows.length,
    suggestion: (() => {
      if (!rows.length) return 'No planned meals to learn from yet.';
      if (reasons['leftovers-available'] >= 1) return 'Leftovers covered meals — schedule them explicitly so the list buys less.';
      if (reasons['no-time'] >= 2) return 'Several “no time” skips — plan quicker meals or batch-cook next week.';
      if (reasons['missing-ingredients'] >= 2) return 'Missing ingredients caused skips — check pantry before planning.';
      if (reasons['plan-too-complex'] >= 2) return '“Plan too complex” — fewer distinct dishes or simpler recipes next week.';
      if (substituted >= 2) return 'Several substitutions — align planned meals with household preferences.';
      return 'Adherence is tracked; next plan can prefer quicker, pantry-ready dishes.';
    })(),
  };

  return {
    rows,
    unplannedRows,
    planned: rows.length,
    completed,
    skipped,
    substituted,
    leftoversUsed,
    takeaway: unplannedRows.length,
    pending,
    adherence,
    reasons,
    learning,
    allRows: [...rows, ...unplannedRows],
  };
};

export const recordPlanEvent = ({ date, slot, status, reason, actualRecipeId, plannedRecipeId, at = Date.now() }) => ({
  id: `mpe${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  date,
  slot,
  plannedRecipeId: plannedRecipeId || null,
  actualRecipeId: actualRecipeId || null,
  status,
  reason: status === 'skipped' ? (reason || 'other') : null,
  at,
});
