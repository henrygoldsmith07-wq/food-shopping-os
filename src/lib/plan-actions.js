/**
 * The meal plan, and what happens to it when the week does not go to plan.
 *
 * A slot that was not cooked is recorded as an outcome rather than quietly
 * cleared, because "we ordered a takeaway on Thursday" is the useful fact —
 * it is what makes next week's plan smaller and more honest. Leftovers go into
 * the pantry as portions so they can be eaten rather than forgotten.
 *
 * Every meaningful action here also appends one event to the household ledger
 * (see event-ledger.js), so Plan → Shop → Eat stays replayable end to end.
 */

import { applyEntries, clearDates, LEFTOVER_CAT, leftoverEntry, moveMeal } from './mealplan.js';
import { householdPermission } from './household.js';
import { uid } from './state.js';
import { appendLedgerEvent, createLedgerEvent } from './event-ledger.js';

/**
 * One event onto the household's history. The ledger always comes from the
 * real app state — never from the patch — so a patch that happens not to
 * carry a ledger can never erase one. Compaction (archive of the oldest
 * events once the ledger outgrows its cap) lives in appendLedgerEvent.
 */
const withEvent = (s, patch, event) => appendLedgerEvent({ ...s, ...patch }, event);

export const planActions = (set) => ({
  markMealPlanOutcome: ({ date, slot, status = 'skipped', reason = null, actualRecipeId = null } = {}) =>
    set((s) => {
      const plannedRecipeId = s.plan?.[date]?.[slot];
      const allowed = ['cooked', 'skipped', 'substituted', 'unplanned', 'takeaway'];
      if (!date || !slot || !plannedRecipeId || !allowed.includes(status)) return {};
      // Validate reason against full list — including new leftovers-available, plan-too-complex, takeaway
      const validReasons = ['no-time', 'missing-ingredients', 'ingredients-missing', 'changed-preference', 'leftovers-available', 'plan-too-complex', 'not-in-the-mood', 'plans-changed', 'ate-something-else', 'takeaway', 'cooked-a-different-meal', 'other'];
      const cleanReason = validReasons.includes(reason) ? reason : (status === 'skipped' ? 'other' : null);
      const event = {
        id: uid('mpe'),
        date,
        slot,
        plannedRecipeId,
        actualRecipeId: actualRecipeId || (status === 'cooked' ? plannedRecipeId : status === 'substituted' ? actualRecipeId : null),
        status: status === 'takeaway' ? 'skipped' : status,
        reason: status === 'skipped' || status === 'takeaway' ? (cleanReason === 'takeaway' ? 'takeaway' : cleanReason) : (cleanReason === 'cooked-a-different-meal' ? 'cooked-a-different-meal' : null),
        isTakeaway: status === 'takeaway',
        leftoverUsed: reason === 'leftovers-available',
        at: Date.now(),
      };
      const existing = (s.mealPlanEvents || []).filter((item) => !(item.date === date && item.slot === slot));
      const base = {
        mealPlanEvents: [...existing, event].slice(-500),
        plan: event.status === 'skipped'
          ? { ...s.plan, [date]: { ...(s.plan[date] || {}), [slot]: plannedRecipeId } }
          : s.plan,
      };
      // The same outcome, as one replayable ledger event.
      const ledgerType = event.status === 'cooked' ? 'MealCooked'
        : event.status === 'skipped' ? 'MealSkipped'
          : 'MealCooked'; // substituted: a meal was cooked, just not the planned one
      return withEvent(s, base, createLedgerEvent(ledgerType, {
        date, slot,
        recipeId: event.actualRecipeId || plannedRecipeId,
        plannedRecipeId,
        status: event.status,
        reason: event.reason,
        substituted: event.status === 'substituted' || undefined,
      }, { origin: 'user' }));
    }),
  recordTakeaway: ({ date = null, reason = 'takeaway', note = '' } = {}) =>
    set((s) => {
      const d = date || s.day;
      const event = {
        id: uid('mpe'),
        date: d,
        slot: 'unplanned',
        plannedRecipeId: null,
        actualRecipeId: null,
        status: 'unplanned',
        reason: reason || 'takeaway',
        note: String(note || '').slice(0, 120),
        at: Date.now(),
      };
      return withEvent(s, { mealPlanEvents: [...(s.mealPlanEvents || []), event].slice(-500) },
        createLedgerEvent('MealSkipped', { date: d, slot: 'unplanned', reason: reason || 'takeaway', note: event.note, takeaway: true }, { origin: 'user' }));
    }),
  setPlanSlot: (date, slot, recipeId) =>
    set((s) => {
      const day = { ...(s.plan[date] || {}) };
      if (recipeId) day[slot] = recipeId;
      else delete day[slot];
      const plan = { ...s.plan };
      if (Object.keys(day).length) plan[date] = day;
      else delete plan[date];
      const changed = (s.plan?.[date]?.[slot] || null) !== (recipeId || null);
      if (!changed) return { ...s, plan };
      return withEvent(s, { plan }, createLedgerEvent('MealPlanned', { date, slot, recipeId }, { origin: 'user' }));
    }),
  clearPlanWeek: (dates) => set((s) => {
    const removed = (dates || []).reduce(
      (n, d) => n + Object.keys(s.plan?.[d] || {}).length, 0,
    );
    if (!removed) return { ...s, plan: clearDates(s.plan, dates) };
    return withEvent(s, { plan: clearDates(s.plan, dates) },
      createLedgerEvent('MealPlanned', { clearedDates: dates || [], removed }, { origin: 'user' }));
  }),
  moveMealSlot: (from, to) => set((s) => {
    const nextPlan = moveMeal(s.plan, from, to);
    const moved = nextPlan?.[to?.date]?.[to?.slot] || null;
    if (!moved || moved === (s.plan?.[from?.date]?.[from?.slot] || null)) return { ...s, plan: nextPlan };
    return withEvent(s, { plan: nextPlan },
      createLedgerEvent('MealPlanned', { date: to?.date, slot: to?.slot, recipeId: moved, movedFrom: from }, { origin: 'user' }));
  }),
  applyPlanEntries: (entries) => set((s) => {
    const plan = applyEntries(s.plan, entries);
    const added = (entries || []).filter((e) => e?.date && e?.slot && e?.recipeId).length;
    if (!added) return { ...s, plan };
    return withEvent(s, { plan }, createLedgerEvent('MealPlanned', { batch: added }, { origin: 'user' }));
  }),
  saveLeftovers: (recipe, portions) =>
    set((s) => {
      if (!householdPermission(s, 'pantry') || !(portions > 0) || !recipe) return {};
      return withEvent(s,
        { pantry: [...s.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, portions, s.day) }] },
        createLedgerEvent('LeftoverCreated', { name: recipe.name, recipeId: recipe.id, portions }, { origin: 'user' }));
    }),
  useLeftover: (id) =>
    set((s) => {
      if (!householdPermission(s, 'pantry')) return {};
      const row = (s.pantry || []).find((p) => p.id === id);
      if (!row) return {};
      // Consuming a saved portion is the Eat stage of a LeftoverCreated that
      // already exists — the cook flow logs the MealCooked, so no second event.
      // But the meal itself IS recorded: a leftover eaten is the outcome the
      // whole leftovers system exists for, and evaluation reads the ledger.
      const portions = (Number(row.portions) || 1) - 1;
      return withEvent(s, { pantry: s.pantry
        .map((p) => {
          if (p.id !== id) return p;
          return { ...p, portions, qty: `${portions} portion${portions === 1 ? '' : 's'}` };
        })
        .filter((p) => p.cat !== LEFTOVER_CAT || (Number(p.portions) || 0) > 0) },
        createLedgerEvent('MealCooked', {
          date: s.day,
          slot: null,
          recipeId: row.recipeId || null,
          leftover: true,
          leftoverId: row.id,
          name: row.name,
        }, { origin: 'user' }));
    }),
  /**
   * Reconcile today's saved portions for one dish to exactly `portions` —
   * the correction path for cooking's automatic leftover save. Zero removes
   * the rows entirely; more than saved adds a row, so the fridge always ends
   * up matching what the household says is there.
   */
  setLeftoverPortions: (recipe, portions) =>
    set((s) => {
      if (!householdPermission(s, 'pantry') || !recipe?.id) return {};
      const n = Math.max(0, Math.round(Number(portions) || 0));
      const mine = (p) => p.cat === LEFTOVER_CAT && p.recipeId === recipe.id && p.addedAt === s.day;
      const rows = s.pantry.filter(mine);
      if (!rows.length && n === 0) return {};
      if (!rows.length) {
        return { pantry: [...s.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, n, s.day) }] };
      }
      if (n === 0) return { pantry: s.pantry.filter((p) => !mine(p)) };
      let remaining = n;
      const pantry = s.pantry.flatMap((p) => {
        if (!mine(p)) return [p];
        const take = Math.min(remaining, Math.max(1, Math.round(Number(p.portions) || 1)));
        remaining -= take;
        return take > 0
          ? [{ ...p, portions: take, qty: `${take} portion${take === 1 ? '' : 's'}` }]
          : [];
      });
      if (remaining > 0) {
        pantry.push({ id: uid('p'), low: false, ...leftoverEntry(recipe, remaining, s.day) });
      }
      return { pantry };
    }),
});
