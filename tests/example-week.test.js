import { describe, it, expect } from 'vitest';
import {
  adoptionSummary,
  buildDemoAdoptionPatch,
  createExampleWeekState,
  isDemoState,
  DEMO_LABEL,
  DEMO_WALKTHROUGH,
  DEMO_DINNER_IDS,
} from '../src/data/exampleWeek.js';
import { weekDates } from '../src/lib/kitchen.js';
import { planStats, shoppingForPlan } from '../src/lib/mealplan.js';
import { EMPTY_STATE } from '../src/lib/state.js';

describe('example week demonstration data', () => {
  it('is clearly labelled and walkthrough covers plan → list → shop → pantry', () => {
    expect(DEMO_LABEL).toMatch(/demonstration/i);
    expect(DEMO_WALKTHROUGH.map((s) => s.id)).toEqual(
      expect.arrayContaining(['plan', 'list', 'shop', 'pantry', 'done']),
    );
  });

  it('builds an isolated session with a full week plan and pantry staples', () => {
    const day = '2026-07-28';
    const demo = createExampleWeekState(day);
    expect(isDemoState(demo)).toBe(true);
    expect(demo.onboarded).toBe(true);
    expect(demo.isDemoSession).toBe(true);
    expect(demo.name).toMatch(/example/i);

    const dates = weekDates(day);
    expect(dates).toHaveLength(7);
    const stats = planStats(demo.plan, dates);
    expect(stats.meals).toBe(7);
    expect(demo.pantry.length).toBeGreaterThan(0);
    // The /demo route promises "pantry-aware shopping" on arrival, so the seed
    // ships the real list the plan generates — pantry already deducted — rather
    // than an empty one the visitor has to click the walkthrough to fill.
    expect(demo.shoppingList.length).toBeGreaterThan(0);
    expect(demo.shoppingList.every((item) => item.demo)).toBe(true);
    expect(demo.shoppingList.every((item) => item.id)).toBe(true);
    // It is the same list the walkthrough claims to generate.
    expect(demo.shoppingList.length).toBe(demo.demoMeta.listWouldContain);
    // Pantry subtraction is real: staples held in the demo pantry are not bought.
    const names = demo.shoppingList.map((item) => item.name.toLowerCase());
    expect(names).not.toContain('olive oil');
    expect(names).not.toContain('rice');
    expect(demo.shoppingList.every((item) => item.checked === false)).toBe(true);
    // Diary stays empty; the one cooked entry references a real catalogue recipe
    expect(demo.log).toEqual({});
    demo.cooked.forEach((entry) => {
      expect(entry.recipeId).toBeTruthy();
      expect(entry.date <= demo.day).toBe(true);
    });
  });

  it('ships a clearly-labelled receipt history for the sandbox', () => {
    const day = '2026-07-28';
    const demo = createExampleWeekState(day);
    expect(demo.shops.length).toBeGreaterThan(0);
    demo.shops.forEach((shop) => {
      expect(shop.imported).toBe(true); // reads as demonstration data everywhere
      expect(shop.items.length).toBeGreaterThan(0);
      shop.items.forEach((item) => expect(item.priceSource).toBe('receipt'));
      expect(shop.date <= day).toBe(true); // history, not the future
      const total = shop.items.reduce((sum, item) => sum + item.price, 0);
      expect(shop.total).toBeCloseTo(Math.round(total * 100) / 100, 2);
    });
  });

  it('uses real catalogue recipes so cooking mode works in the demo', () => {
    DEMO_DINNER_IDS.forEach((id) => {
      expect(id).toBeTruthy();
    });
    const demo = createExampleWeekState('2026-07-28');
    const dates = weekDates(demo.day);
    const need = shoppingForPlan(demo.plan, dates, { pantry: demo.pantry, people: demo.household, today: demo.day });
    expect(need.length).toBeGreaterThan(0);
    // Pantry staples reduce the list
    const withoutPantry = shoppingForPlan(demo.plan, dates, { pantry: [], people: demo.household, today: demo.day });
    expect(need.length).toBeLessThanOrEqual(withoutPantry.length);
  });

  it('sizes the demonstration shopping quantities for the two-person example household', () => {
    const demo = createExampleWeekState('2026-07-28');
    const dates = weekDates(demo.day);
    const need = shoppingForPlan(demo.plan, dates, {
      pantry: demo.pantry, people: demo.household, today: demo.day,
    });
    // Chicken traybake appears twice. It serves four and uses 8 thighs per
    // batch, so two dinners for two people still require 8 thighs in total.
    expect(need.find((item) => item.name === 'Chicken thighs')?.requiredQty).toBe('8');
  });

  it('does not mutate EMPTY_STATE when creating a demo', () => {
    const before = JSON.stringify(EMPTY_STATE);
    createExampleWeekState('2026-07-28');
    expect(JSON.stringify(EMPTY_STATE)).toBe(before);
  });
});

describe('demo adoption (demo week becomes the real kitchen)', () => {
  it('rebases the dinner rotation onto the current week with a full 7-day plan', () => {
    const demo = createExampleWeekState('2026-07-28');
    const patch = buildDemoAdoptionPatch(demo, { ...EMPTY_STATE }, '2026-10-20');
    const dates = weekDates('2026-10-20');
    expect(Object.keys(patch.plan)).toEqual(dates);
    dates.forEach((date, i) => {
      expect(patch.plan[date].dinner).toBe(DEMO_DINNER_IDS[i % DEMO_DINNER_IDS.length]);
    });
    expect(patch.onboarded).toBe(true);
  });

  it('merges pantry staples without touching real rows and never carries demo flags', () => {
    const demo = createExampleWeekState('2026-07-28');
    const realPantry = [{ id: 'p1', name: 'Olive oil' }];
    const patch = buildDemoAdoptionPatch(demo, { ...EMPTY_STATE, pantry: realPantry }, '2026-10-20');
    // Real row kept exactly once; demo duplicate skipped.
    expect(patch.pantry.filter((p) => p.name.toLowerCase() === 'olive oil')).toHaveLength(1);
    expect(patch.pantry[0].id).toBe('p1');
    // Other staples adopted with fresh ids.
    expect(patch.pantry.length).toBeGreaterThan(realPantry.length);
    expect(patch.pantry.every((p) => p.id)).toBe(true);
    // No demo-only surface crosses over.
    expect(patch.isDemoSession).toBeUndefined();
    expect(patch.demoMeta).toBeUndefined();
    expect(patch.shops).toBeUndefined();
    expect(patch.adoptedFromDemo.dinners).toEqual(DEMO_DINNER_IDS);
  });

  it('merges favourites without duplicates and keeps the real budget when set', () => {
    const demo = createExampleWeekState('2026-07-28');
    const patch = buildDemoAdoptionPatch(
      demo,
      { ...EMPTY_STATE, favourites: [DEMO_DINNER_IDS[0]], weeklyBudget: 60, household: 3 },
      '2026-10-20',
    );
    expect(patch.favourites.filter((id) => id === DEMO_DINNER_IDS[0])).toHaveLength(1);
    expect(patch.weeklyBudget).toBe(60);
    expect(patch.household).toBe(3);
  });

  it('never replaces a real planned dinner — the demo fills only empty dates', () => {
    const demo = createExampleWeekState('2026-07-28');
    const dates = weekDates('2026-10-20');
    const real = {
      ...EMPTY_STATE,
      plan: {
        [dates[0]]: { dinner: 'my-roast', lunch: 'my-soup' },
        [dates[3]]: { dinner: 'my-curry' },
      },
    };
    const patch = buildDemoAdoptionPatch(demo, real, '2026-10-20');
    // Real slots survive untouched, including the non-dinner slot.
    expect(patch.plan[dates[0]]).toEqual({ dinner: 'my-roast', lunch: 'my-soup' });
    expect(patch.plan[dates[3]]).toEqual({ dinner: 'my-curry' });
    // Empty dates still get the rebased demo rotation.
    expect(patch.plan[dates[1]].dinner).toBe(DEMO_DINNER_IDS[1]);
    expect(patch.plan[dates[2]].dinner).toBe(DEMO_DINNER_IDS[2]);
    expect(patch.adoptedFromDemo.keptMeals).toBe(2);
  });

  it('gives adopted kitchens the same nameless default as skipped onboarding', () => {
    const demo = createExampleWeekState('2026-07-28');
    // Onboarding turns a blank name into 'you'; adoption is the only other
    // path past setup, so it must too — otherwise Home greets "Good evening, ".
    expect(buildDemoAdoptionPatch(demo, { ...EMPTY_STATE, name: '' }, '2026-10-20').name).toBe('you');
    expect(buildDemoAdoptionPatch(demo, { ...EMPTY_STATE, name: '   ' }, '2026-10-20').name).toBe('you');
    expect(buildDemoAdoptionPatch(demo, { ...EMPTY_STATE, name: 'Sam' }, '2026-10-20').name).toBe('Sam');
  });

  it('reports zero kept meals for a brand-new kitchen', () => {
    const demo = createExampleWeekState('2026-07-28');
    const patch = buildDemoAdoptionPatch(demo, { ...EMPTY_STATE }, '2026-10-20');
    expect(patch.adoptedFromDemo.keptMeals).toBe(0);
    expect(patch.adoptedFromDemo.staples).toBe(demo.pantry.length);
    expect(Object.keys(patch.plan)).toHaveLength(7);
  });

  it('keeps a new kitchen\'s household size and seeds the demo budget', () => {
    const demo = createExampleWeekState('2026-07-28');
    const patch = buildDemoAdoptionPatch(demo, { ...EMPTY_STATE }, '2026-10-20');
    // Household 1 is valid (and the fresh default) — the plan re-derives for it.
    expect(patch.household).toBe(1);
    // Zero budget means unset, so the demo starter budget applies.
    expect(patch.weeklyBudget).toBe(demo.weeklyBudget);
  });
});

describe('adoption receipt', () => {
  it('summarises what the demo added and what it kept', () => {
    expect(adoptionSummary(null)).toBeNull();
    expect(adoptionSummary(undefined)).toBeNull();
    expect(adoptionSummary({ dinners: [], keptMeals: 0, staples: 0 })).toBeNull();
    expect(adoptionSummary({
      dinners: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], keptMeals: 2, staples: 4,
    })).toEqual({ added: 5, kept: 2, staples: 4 });
  });

  it('reads straight off a real adoption patch', () => {
    const demo = createExampleWeekState('2026-07-28');
    const patch = buildDemoAdoptionPatch(demo, { ...EMPTY_STATE }, '2026-10-20');
    expect(adoptionSummary(patch.adoptedFromDemo)).toEqual({
      added: 7,
      kept: 0,
      staples: demo.pantry.length,
    });
  });
});
