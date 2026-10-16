import { describe, expect, it } from 'vitest';
import { weeklyFoodLoop } from '../src/lib/food-loop.js';

const today = '2026-08-03';

describe('weekly food loop', () => {
  it('starts by asking the household to plan', () => {
    const loop = weeklyFoodLoop({ day: today, plan: {}, shoppingList: [], shops: [], cooked: [] }, today);
    expect(loop.next).toBe('plan');
    expect(loop.steps.every((step) => !step.done)).toBe(true);
  });

  it('moves from planning to shopping when a plan and pending list exist', () => {
    const loop = weeklyFoodLoop({
      day: today,
      plan: { [today]: { dinner: 'recipe-1' } },
      shoppingList: [{ name: 'Rice', checked: false }],
      shops: [],
      cooked: [],
    }, today);
    expect(loop.next).toBe('shop');
    expect(loop.plannedMeals).toBe(1);
  });

  it('recognises a completed plan-to-table week', () => {
    const loop = weeklyFoodLoop({
      day: today,
      plan: { [today]: { dinner: 'recipe-1' } },
      shoppingList: [],
      shops: [{ date: today, items: [] }],
      cooked: [{ recipeId: 'recipe-1', date: today }],
    }, today);
    expect(loop.next).toBe('steady');
    expect(loop.steps.map((step) => step.done)).toEqual([true, true, true]);
  });

  it('keeps the week on cooking until the planned meals are eaten', () => {
    const plan = { [today]: { dinner: 'recipe-1' }, '2026-08-04': { dinner: 'recipe-2' }, '2026-08-05': { dinner: 'recipe-3' } };
    const loop = weeklyFoodLoop({
      day: today, plan, shoppingList: [], shops: [{ date: today, items: [] }],
      cooked: [{ recipeId: 'recipe-1', date: today }],
    }, today);
    expect(loop.next).toBe('cook');
    expect(loop.steps.map((step) => step.done)).toEqual([true, true, false]);
  });
});
