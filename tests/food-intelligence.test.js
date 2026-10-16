import { describe, it, expect } from 'vitest';
import { buildFoodIntelligence, runDecision } from '../src/lib/food-intelligence.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

/**
 * Food Intelligence — the one ranked stack of decisions.
 *
 * These assertions are about the contract every surface depends on: the
 * stack leads with the kitchen's urgency (waste first), every decision
 * carries its reason/evidence/impact, predictions never sound like
 * certainty, a settled week stays quiet, and the action descriptors map
 * onto the calls a screen can make.
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

describe('food intelligence', () => {
  it('leads with expiring food as a decision with evidence and honest confidence', () => {
    const state = app({
      pantry: [{ id: 'p1', name: 'Spinach', emoji: '🥬', expiry: '2026-07-30', qty: '200g' }],
    });
    const fi = state.foodIntelligence;
    expect(fi.quiet).toBe(false);
    const lead = fi.decisions[0];
    expect(lead.id).toBe('use-soon');
    expect(lead.title.toLowerCase()).toContain('spinach');
    expect(lead.evidence.length).toBeGreaterThan(0);
    // A prediction is a prediction: it must not read as certainty.
    expect(lead.confidence).not.toBe('high');
    expect(lead.reason).toBeTruthy();
    expect(lead.action.kind).toBe('pantry');
  });

  it('ranks shopping below waste, and carries the list as evidence', () => {
    const state = app({
      pantry: [{ id: 'p1', name: 'Spinach', emoji: '🥬', expiry: '2026-07-30', qty: '200g' }],
      plan: { [day]: { dinner: 'chicken-traybake' } },
      shoppingList: [{ id: 's1', name: 'Milk', checked: false }, { id: 's2', name: 'Eggs', checked: false }],
    });
    const fi = state.foodIntelligence;
    expect(fi.decisions[0].id).toBe('use-soon');
    const shop = fi.decisions.find((row) => row.id === 'to-buy');
    expect(shop).toBeTruthy();
    expect(shop.priority).toBeGreaterThanOrEqual(1);
    expect(shop.evidence.join(' ')).toMatch(/2 unchecked/);
  });

  it('prevents waste before it happens: a settled planned week still hears about what the plan will leave unused', () => {
    const weekDates = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    const plan = {};
    for (const date of weekDates) plan[date] = { dinner: 'chicken-traybake' };
    const state = app({ plan, pantry: [], shoppingList: [], cooked: [], waste: [] });
    const fi = state.foodIntelligence;
    // The plan buys garlic it will not use — Forq says so before the shop,
    // not after the bin.
    const waste = fi.decisions.find((row) => row.kind === 'waste');
    expect(waste).toBeTruthy();
    expect(waste.evidence.length).toBeGreaterThan(0);
    expect(waste.action).toBeTruthy();
  });

  it('every decision is well-formed, unique and honest about confidence', () => {
    const state = app({
      pantry: [{ id: 'p1', name: 'Spinach', emoji: '🥬', expiry: '2026-07-30', qty: '200g' }],
      plan: { [day]: { dinner: 'chicken-traybake' } },
      shoppingList: [{ id: 's1', name: 'Milk', checked: false }],
    });
    const { decisions } = state.foodIntelligence;
    expect(decisions.length).toBeGreaterThan(0);
    const ids = decisions.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of decisions) {
      expect(row.title).toBeTruthy();
      expect(row.reason).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(row.confidence);
      expect(row.action.kind).toBeTruthy();
      expect(Array.isArray(row.evidence)).toBe(true);
    }
  });

  it('executes action descriptors through the handlers a screen provides', () => {
    const calls = { tab: [], weekLoop: [], pantry: 0 };
    runDecision({ action: { kind: 'weekLoop', target: 'plan' } }, {
      goTab: (t) => calls.tab.push(t),
      openWeekLoop: (t) => calls.weekLoop.push(t),
    });
    expect(calls.weekLoop).toEqual(['plan']);
    runDecision({ action: { kind: 'tab', target: 'shop' } }, {
      goTab: (t) => calls.tab.push(t),
      openWeekLoop: (t) => calls.weekLoop.push(t),
    });
    expect(calls.tab).toEqual(['shop']);
    runDecision({ action: { kind: 'pantry' } }, { openPantry: () => { calls.pantry += 1; } });
    expect(calls.pantry).toBe(1);
  });
});
