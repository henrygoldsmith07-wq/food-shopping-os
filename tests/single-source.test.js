import { describe, expect, it } from 'vitest';
import { shoppingForPlan, planEntries, planStats, leftoverCoverageForPlan } from '../src/lib/mealplan.js';
import { reconcileListWithPlan, shoppingForWeekLoop, weekLoopSnapshot, weekPlanNeed } from '../src/lib/week-loop.js';
import { deriveDynamicShoppingList } from '../src/lib/dynamic-shopping.js';
import { householdPortionsFor } from '../src/lib/portions.js';
import { weekDates } from '../src/lib/kitchen.js';
import { byId } from '../src/data/recipes.js';

/**
 * One authoritative derivation per concept: the week loop, the plan tab and
 * the dynamic list must agree about "what do we need to buy". Each path
 * reads householdPortionsFor + shoppingForPlan + pantry subtraction, so two
 * screens can never quote different quantities for the same plan.
 */
describe('single source of truth — plan → list', () => {
  // A real book recipe: a plan entry only exists once the recipe resolves, so
  // a made-up id would quietly test the empty case instead of the real one.
  const CURRY = 'chickpea-curry';
  const state = {
    day: '2026-09-28',
    portions: 2,
    plan: { '2026-09-29': { dinner: CURRY }, '2026-09-30': { dinner: CURRY } },
    pantry: [],
    waste: [],
    cooked: [],
    recipes: [byId(CURRY)],
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
    expect(loopNames.length).toBeGreaterThan(0);
  });

  it('plan entries, stats and leftover coverage read the same plan', () => {
    const dates = ['2026-09-29', '2026-09-30'];
    expect(planEntries(state.plan, dates)).toHaveLength(2);
    expect(planStats(state.plan, dates).meals).toBe(2);
    expect(leftoverCoverageForPlan(state.plan, dates, [], { people: 2 })).toHaveLength(2);
    const dynamic = deriveDynamicShoppingList({ ...state, shoppingList: [], shops: [] }, { dates });
    expect(dynamic.length).toBeGreaterThan(0);
    expect(dynamic.map((row) => row.name).sort())
      .toEqual(shoppingForPlan(state.plan, dates, { pantry: [], today: state.day, people: 2 })
        .map((row) => row.name).sort());
  });

  it('reconcile settles after generation: preview and reconciliation are one derivation', () => {
    // WeekLoop.generateList writes `snap.listPreview` verbatim. Reconciling
    // that list against the same state must reach a fixpoint: the first pass
    // may stamp evidence the write path does not carry (lastAutoQty), but a
    // second pass has nothing left to change. If either diverged, the screen
    // the household reads and the list the store keeps would disagree.
    const dates = weekDates(state.day);
    const base = {
      ...state, shoppingList: [], shops: [], leftovers: [], onboarded: true, aliasMemory: {},
    };
    const snap = weekLoopSnapshot(base);
    expect(snap.listPreview.length).toBeGreaterThan(0);
    const written = {
      ...base,
      shoppingList: snap.listPreview.map((row) => ({ ...row, checked: false })),
    };
    const first = reconcileListWithPlan(written, dates, { planChanged: true });
    const settled = first.shoppingList
      ? { ...written, shoppingList: first.shoppingList }
      : written;
    expect(reconcileListWithPlan(settled, dates, { planChanged: true })).toEqual({});
  });

  it('weekPlanNeed is the single need row set every entry point composes from', () => {
    const dates = weekDates(state.day);
    const app = { ...state, shoppingList: [], shops: [], leftovers: [] };
    const need = weekPlanNeed(app, dates);
    const preview = shoppingForWeekLoop(app, dates);
    expect(preview.items.map((row) => row.name).sort())
      .toEqual(need.rows.map((row) => row.name).sort());
    // The dynamic builder may add staples/manual rows, but it never rewrites
    // the plan-derived need it was handed: every plan row survives untouched.
    const dynamic = deriveDynamicShoppingList(app, { dates, planNeed: need.rows });
    const needByName = new Map(need.rows.map((row) => [row.name, row]));
    for (const row of dynamic) {
      if (!needByName.has(row.name)) continue;
      expect(row.qty).toBe(needByName.get(row.name).qty);
      expect(row.requiredQty).toBe(needByName.get(row.name).requiredQty);
    }
  });
});
