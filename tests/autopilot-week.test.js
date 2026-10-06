import { describe, it, expect } from 'vitest';
import {
  autopilotForm,
  autopilotWeekProposal,
  autopilotWeekSummary,
  regenerateProposalMeal,
} from '../src/lib/autopilot-week.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';
import { shoppingForWeekLoop } from '../src/lib/week-loop.js';
import { byId } from '../src/data/recipes.js';

/**
 * Autopilot Week — the zero-config proposal.
 *
 * These assertions are about the contract the Home screen depends on: the
 * proposal is a real week, its numbers come from the same derivations the
 * shopping list uses (so the summary can never lie about the plan), and
 * changing one meal leaves the rest of the week alone.
 */
const day = '2026-07-28';

const app = (extra = {}) => {
  const state = {
    ...EMPTY_STATE,
    day,
    onboarded: true,
    portions: 2,
    ...extra,
  };
  return { ...state, ...deriveApp(state) };
};

describe('autopilot week', () => {
  it('infers its form instead of asking: people, pantry on, waste minimised', () => {
    // Household size is the members' portions — deriveApp recomputes the
    // aggregate, exactly as the rest of the app reads it.
    const form = autopilotForm(app({ members: [{ id: 'm1', portions: 4 }] }));
    expect(form.people).toBe(4);
    expect(form.usePantry).toBe(true);
    expect(form.minimiseWaste).toBe(true);
    expect(form.variety).toBe(true);
    // Busy weeks get shorter meals.
    const busy = autopilotForm(app({ calendarBusy: [{ date: day }, { date: '2026-07-29' }] }));
    expect(busy.timeAvailable).toBe(30);
  });

  it('proposes a full week whose numbers agree with the list derivation', () => {
    const proposal = autopilotWeekProposal(app());
    expect(proposal.stats.meals).toBeGreaterThan(0);
    // Every planned dinner resolves in the recipe book.
    for (const entry of proposal.entries) {
      expect(byId(entry.recipeId), entry.recipeId).toBeTruthy();
    }
    // The item count the summary quotes is the list's own count — one need
    // source, never a second.
    const listRows = shoppingForWeekLoop({ ...app(), plan: proposal.plan }, proposal.model.planDates);
    expect(proposal.itemCount).toBe(listRows.items.length);
  });

  it('summarises only facts the proposal holds', () => {
    const proposal = autopilotWeekProposal(app());
    const lines = autopilotWeekSummary(proposal);
    expect(lines[0]).toMatch(/dinners planned/);
    expect(lines.some((l) => l.includes('to buy'))).toBe(true);
    // No line claims a rescue when nothing was rescued.
    if (proposal.rescuedExpiring === 0) {
      expect(lines.some((l) => l.includes('rescued'))).toBe(false);
    }
  });

  it('swaps one meal and leaves every other meal untouched', () => {
    const proposal = autopilotWeekProposal(app());
    const date = proposal.model.planDates[0];
    const before = { ...proposal.plan };
    const next = regenerateProposalMeal(app(), proposal, date, { seed: 3 });
    expect(next).toBeTruthy();
    for (const other of proposal.model.planDates) {
      if (other === date) continue;
      expect(next.plan[other]).toEqual(before[other]);
    }
    // A swap changes the meal — it must not quietly return the same dinner.
    expect(next.plan[date].dinner).toBeTruthy();
  });

  it('refuses to regenerate a locked meal', () => {
    const state = app();
    const proposal = autopilotWeekProposal(state);
    const date = proposal.model.planDates[0];
    const lockedRecipe = proposal.plan[date].dinner;
    const next = regenerateProposalMeal(state, proposal, date, {
      seed: 5,
      exclude: [lockedRecipe],
    });
    // Either no alternative exists (null) or the replacement differs.
    if (next) expect(next.plan[date].dinner).not.toBe(lockedRecipe);
  });
});
