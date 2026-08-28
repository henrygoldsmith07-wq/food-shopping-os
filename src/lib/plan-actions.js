/**
 * The meal plan, and what happens to it when the week does not go to plan.
 *
 * A slot that was not cooked is recorded as an outcome rather than quietly
 * cleared, because "we ordered a takeaway on Thursday" is the useful fact —
 * it is what makes next week's plan smaller and more honest. Leftovers go into
 * the pantry as portions so they can be eaten rather than forgotten.
 */

import { applyEntries, clearDates, LEFTOVER_CAT, leftoverEntry, moveMeal } from './mealplan.js';
import { householdPermission } from './household.js';
import { uid } from './state.js';

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
      return { mealPlanEvents: [...existing, event].slice(-500) };
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
      return { mealPlanEvents: [...(s.mealPlanEvents || []), event].slice(-500) };
    }),
  setPlanSlot: (date, slot, recipeId) =>
    set((s) => {
      const day = { ...(s.plan[date] || {}) };
      if (recipeId) day[slot] = recipeId;
      else delete day[slot];
      const plan = { ...s.plan };
      if (Object.keys(day).length) plan[date] = day;
      else delete plan[date];
      return { plan };
    }),
  clearPlanWeek: (dates) => set((s) => ({ plan: clearDates(s.plan, dates) })),
  moveMealSlot: (from, to) => set((s) => ({ plan: moveMeal(s.plan, from, to) })),
  applyPlanEntries: (entries) => set((s) => ({ plan: applyEntries(s.plan, entries) })),
  saveLeftovers: (recipe, portions) =>
    set((s) => (householdPermission(s, 'pantry') && portions > 0
      ? { pantry: [...s.pantry, { id: uid('p'), low: false, ...leftoverEntry(recipe, portions, s.day) }] }
      : {})),
  useLeftover: (id) =>
    set((s) => (householdPermission(s, 'pantry') ? {
      pantry: s.pantry
        .map((p) => {
          if (p.id !== id) return p;
          const portions = (Number(p.portions) || 1) - 1;
          return { ...p, portions, qty: `${portions} portion${portions === 1 ? '' : 's'}` };
        })
        .filter((p) => p.cat !== LEFTOVER_CAT || (Number(p.portions) || 0) > 0),
    } : {})),
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
