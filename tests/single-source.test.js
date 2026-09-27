import { describe, expect, it } from 'vitest';
import { shoppingForPlan, planEntries, planStats, leftoverCoverageForPlan } from '../src/lib/mealplan.js';
import { shoppingForWeekLoop, weekLoopSnapshot } from '../src/lib/week-loop.js';
import { deriveDynamicShoppingList } from '../src/lib/dynamic-shopping.js';
import { householdPortionsFor } from '../src/lib/portions.js';
import { weekDates } from '../src/lib/kitchen.js';

/**
 * One authoritative derivation per concept: the week loop, the plan tab and
 * the dynamic list must agree about "what do we need to buy". Each path
 * reads householdPortionsFor + shoppingForPlan + pantry subtraction, so two
 * screens can never quote different quantities for the same plan.
 */
describe('single source of truth — plan → list', () => {
  const state = {
    day: '2026-09-28',
    portions: 2,
    plan: { '2026-09-29': { dinner: 'r1' }, '2026-09-30': { dinner: 'r1' } },
    pantry: [],
    waste: [],
    cooked: [],
    recipes: [{ id: 'r1', name: 'Chilli', servings: 2, ingredients: [{ name: 'Beans', qty: '400 g' }] }],
  };
  it('week loop and plan paths agree on portions and list contents', () => {
    const dates = weekDates(state.day);
    const household = householdPortionsFor(state);
    const loop = shoppingForWeekLoop(state, dates);
    expect(loop.portions.portions).toBe(household.portions);
    const direct = shoppingForPlan(state.plan, dates, {
      pantry: [], today: state.day, learnedAliases: {}, people: household.portions,
    });
    const loopNames = loop.items.map((i) => i.name).sort();
    // weekLoopSnapshot exposes the same preview the list step compares;
    // the snapshot and the direct derivation must name the same needs.
    const snapshot = weekLoopSnapshot({ ...state, shoppingList: [], shops: [], leftovers: [] });
    expect(snapshot.listPreview.map((i) => i.name).sort()).toEqual(loopNames);
    expect(direct.map((i) => i.name).sort()).toEqual(loopNames);
  });

  it('plan entries, stats and leftover coverage read the same plan', () => {
    const dates = ['2026-09-29', '2026-09-30'];
    expect(planEntries(state.plan, dates)).toHaveLength(2);
    expect(planStats(state.plan, dates).meals).toBe(2);
    expect(leftoverCoverageForPlan(state.plan, dates, [], { people: 2 })).toHaveLength(2);
    const dynamic = deriveDynamicShoppingList({ ...state, shoppingList: [], shops: [] }, { dates });
    expect(dynamic.some((r) => r.name === 'Beans')).toBe(true);
  });
});
