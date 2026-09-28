/**
 * One next action.
 *
 * The Week screen used to open with three cards that each claimed to be the
 * thing to do next. This is the ranking that replaced them, and the thing worth
 * testing is the *order* — that a kitchen going off outranks a tidy-up, that
 * a plan being empty outranks a list to work through, and that a kitchen in
 * good shape says so rather than inventing something to do.
 *
 * It must also never be a dead end: every action it can return has to perform
 * something real.
 */

import { describe, expect, it, vi } from 'vitest';
import { nextAction } from '../src/lib/next-action.js';

const app = (overrides = {}) => ({
  day: '2026-07-28',
  plan: {},
  pantry: [],
  shoppingList: [],
  // Derived signals the resolver reads. `wastePrediction` is the one the
  // pantry card renders from, so the week screen and that card agree.
  wastePrediction: { items: [] },
  weekRecovery: null,
  loopChecks: { unconfirmed: 0 },
  guidance: { items: [] },
  ...overrides,
});

const planned = (recipeId) => ({ '2026-07-28': { dinner: recipeId } });

/** A pantry item Forq has evidence is going unused, worst first. */
const willGoOff = (name, overrides = {}) => ({
  items: [{ name, likelihood: 'high', daysLeft: 1, ...overrides }],
});

describe('what should I do next', () => {
  it('leads with food going off that nothing is using', () => {
    const openPantry = vi.fn();
    const action = nextAction(app({
      plan: planned('r1'),
      shoppingList: [{ id: 's1', name: 'Milk', checked: false }],
      wastePrediction: willGoOff('Spinach'),
    }), { onOpenPantry: openPantry, goTab: vi.fn() });

    expect(action.id).toBe('use-soon');
    // It names the food, because "use something" is not an instruction.
    expect(action.title).toContain('Spinach');
    action.run();
    expect(openPantry).toHaveBeenCalled();
  });

  it('ignores food the plan already accounts for', () => {
    // The predictor is the one that knows whether a planned meal uses it; an
    // empty prediction means nothing is going unused, however near the date.
    const action = nextAction(app({ plan: planned('r1'), wastePrediction: { items: [] } }));
    expect(action?.id).not.toBe('use-soon');
  });

  it('asks for loop confirmations before it asks for anything tidier', () => {
    const goTab = vi.fn();
    const action = nextAction(app({
      plan: planned('r1'),
      loopChecks: { unconfirmed: 2 },
    }), { goTab });

    expect(action.id).toBe('confirm-loop');
    expect(action.title).toContain('2 meals');
    action.run();
    expect(goTab).toHaveBeenCalledWith('cook');
  });

  it('offers week recovery when the week has fallen behind', () => {
    const onOpenWeekLoop = vi.fn();
    const action = nextAction(app({
      loopChecks: { unconfirmed: 0 },
      weekRecovery: { suggestions: [{}], explanations: ['Tuesday was skipped'] },
    }), { onOpenWeekLoop, goTab: vi.fn() });

    expect(action.id).toBe('recover-week');
    expect(action.detail).toBe('Tuesday was skipped');
    action.run();
    expect(onOpenWeekLoop).toHaveBeenCalled();
  });

  it('asks for a plan before it asks anyone to shop', () => {
    const goTab = vi.fn();
    // An unemptied list with nothing planned: planning is what fills it, so
    // planning is the actual next step.
    const action = nextAction(app({ shoppingList: [{ id: 's1', name: 'Milk', checked: false }] }), { goTab });
    expect(action.id).toBe('plan-week');
    action.run();
    expect(goTab).toHaveBeenCalledWith('plan');
  });

  it('asks for the shop once there is a plan and an unfinished list', () => {
    const goTab = vi.fn();
    const action = nextAction(app({
      plan: planned('r1'),
      shoppingList: [{ id: 's1', name: 'Milk', checked: false }],
    }), { goTab });

    expect(action.id).toBe('shop');
    expect(action.title).toContain('1 item');
    action.run();
    expect(goTab).toHaveBeenCalledWith('shop');
  });

  it('surfaces setup only once the loop itself is in order', () => {
    const openGuidance = vi.fn();
    const withSetup = app({
      plan: planned('r1'),
      shoppingList: [{ id: 's1', name: 'Milk', checked: true }],
      guidance: { items: [{ id: 'setup-budget', title: 'Set a weekly budget' }] },
    });
    const action = nextAction(withSetup, { openGuidance });
    expect(action.id).toBe('setup');
    action.run();
    expect(openGuidance).toHaveBeenCalled();
  });

  it('says there is nothing to do rather than inventing a suggestion', () => {
    const tidy = app({
      plan: planned('r1'),
      shoppingList: [{ id: 's1', name: 'Milk', checked: true }],
    });
    // A kitchen in good shape is an answer, not a gap in the UI.
    expect(nextAction(tidy)).toBeNull();
  });

  it('never offers shopping before a plan exists, whatever is on the list', () => {
    // The list is derived from the plan, so an unplanned list is a symptom.
    const action = nextAction(app({ shoppingList: [{ id: 's1', checked: false }] }));
    expect(action.id).toBe('plan-week');
  });
});
