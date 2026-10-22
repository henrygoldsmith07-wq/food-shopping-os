import { describe, it, expect } from 'vitest';
import { buildMultiDayPlan } from '../src/lib/planner-multiday.js';

const r = (id, meal, name) => ({ id, meal, name, ingredients: [{ name: `${name} item` }], time: 10, cost: 2, diets: [] });
const recipes = [
  r('b1', 'breakfast', 'Oats'), r('b2', 'breakfast', 'Toast'),
  r('d1', 'dinner', 'Pasta'), r('d2', 'dinner', 'Curry'),
];
const base = {
  dayCount: 3, diets: [], goal: null, budget: null, maxTime: null, occasion: null, people: 1,
  pantry: [], month: 1, batch: false, recipes, taste: null, leftovers: [], equipment: [], expiry: [],
  focus: [], variety: true, pantryItems: [], availableOnly: false, wasteOptimisation: false,
  multiObjective: false, wasteOptions: {}, candidateRuns: 1, narrow: (p) => p, seed: 5,
};

describe('buildMultiDayPlan', () => {
  it('keeps meals aligned to their slot when a slot has no recipes', () => {
    const plan = buildMultiDayPlan({ ...base, slotList: ['breakfast', 'lunch', 'dinner'] });
    const meals = plan.meals || plan;
    const slots = ['breakfast', 'lunch', 'dinner'];
    meals.forEach((m, i) => {
      if (slots[i % 3] !== 'lunch') expect(m.meal).toBe(slots[i % 3]);
    });
    expect(meals.length).toBe(9);
    expect(meals.every(Boolean)).toBe(true);
  });
});
