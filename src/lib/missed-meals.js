/**
 * Silent misses, without the weight of the plan-vs-reality machinery.
 *
 * A planned slot dated before today that has no outcome event — not cooked,
 * not skipped, not swapped — is now definitionally never cooked. The waste
 * log needs to see that, or the "never cooked" bucket can never see it.
 *
 * This lives apart from `plan-outcome.js` for one reason: hydration calls it.
 * `plan-outcome.js` renders outcomes through `mealplan.js`, which resolves
 * recipes through the 2,200-row recipe book — and the boot path must not pull
 * the recipe book in just to decide whether a saved install has silent
 * misses. So this module works on the plan object alone
 * (`{ 'YYYY-MM-DD': { slot: recipeId } }` plus outcome events) and imports
 * nothing but the plan vocabulary (`data/plan.js` — pure constants, no
 * catalogue, no recipe book). Same rule, narrower footprint.
 *
 * Pure: plan + events in, unresolved past slots out — nothing here reads the
 * recipe book.
 */

import { isPlanSpecial } from '../data/plan.js';

const eventKey = (date, slot) => `${date}|${slot}`;

/**
 * Planned slots whose date passed with no recorded outcome at all.
 *
 * The household can cook, skip or swap a planned meal — all three write an
 * event. A slot that simply passed without any of those is the silent miss:
 * nobody told the waste log. Pure: plan + events in, unresolved past slots
 * out.
 */
export const missedMealSlots = (plan = {}, { before, events = [] } = {}) => {
  if (!before) return [];
  const resolved = new Set(events
    .filter((event) => event?.date && event?.slot)
    .map((event) => eventKey(event.date, event.slot)));
  const missed = [];
  for (const [date, day] of Object.entries(plan)) {
    if (!day || typeof day !== 'object' || date >= before) continue;
    for (const [slot, recipeId] of Object.entries(day)) {
      // A leftover-night or eating-out marker is a decision, not a dish that
      // went uncooked — it needs no outcome event and is never a miss.
      if (!recipeId || isPlanSpecial(recipeId) || resolved.has(eventKey(date, slot))) continue;
      missed.push({ date, slot, recipeId });
    }
  }
  return missed;
};

/**
 * Mark silent misses so the waste log can see them.
 *
 * Runs when the app rolls over to a new day: any planned slot dated before
 * today that still has no outcome event is now definitionally never cooked.
 *
 * Two deliberate choices about identity, both about never counting one fact
 * twice. The stamp's id is derived from the meal it describes, so capturing
 * the same slot twice — a second device, another day's rollover — produces
 * the *same* id and the merge keeps one fact, not two. And stamps carry the
 * rollover day as their recorded time, so hydrating the same install twice
 * produces the same state: hydration is deterministic, and an export/import
 * round trip is byte-identical.
 */
export const captureMissedMeals = (state = {}) => {
  const events = Array.isArray(state.mealPlanEvents) ? state.mealPlanEvents : [];
  const missed = missedMealSlots(state.plan || {}, {
    before: state.day,
    events,
  });
  if (!missed.length) return state;
  const stamps = missed.map(({ date, slot, recipeId }) => ({
    id: `mpe_${date}_${slot}_${recipeId}`.replace(/[^a-zA-Z0-9_-]/g, ''),
    date,
    slot,
    plannedRecipeId: recipeId,
    actualRecipeId: null,
    status: 'skipped',
    reason: 'missed',
    missed: true,
    // Provenance: this stamp is Forq's inference, not the household's word —
    // the loop's confirmation card exists precisely so the household can
    // correct it (see loop-inference.js). Labelled, never presented as fact.
    source: 'inferred',
    at: state.day,
  }));
  return { ...state, mealPlanEvents: [...events, ...stamps].slice(-500) };
};
