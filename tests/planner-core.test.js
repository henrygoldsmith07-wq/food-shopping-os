import { describe, expect, it } from 'vitest';
import {
  equipmentOk, activeEquipment, varietyMeals, pantryCoverage, hardFilter,
  pantryHits, scopeCount, scopeMeals, windowBudget,
} from '../src/lib/planner-core.js';

const r = (name, ingredients = [], extra = {}) => ({
  id: name, name, ingredients: ingredients.map((n) => ({ name: n })), tags: [],
  protein: 30, kcal: 400, costPerServing: 2, time: 20, servings: 2, ...extra,
});

describe('equipment', () => {
  it('untagged dishes always fit; tagged ones need every appliance', () => {
    expect(equipmentOk(r('a'), [])).toBe(true);
    expect(equipmentOk(r('b', [], { tags: ['air-fryer', 'oven'] }), ['oven'])).toBe(false);
    expect(equipmentOk(r('b', [], { tags: ['air-fryer', 'oven'] }), ['oven', 'air-fryer'])).toBe(true);
    expect(equipmentOk(null, [])).toBe(false);
  });
  it('prefers the active kitchen profile', () => {
    expect(activeEquipment({ activeKitchenProfile: { equipment: ['hob'] }, equipment: ['oven'] })).toEqual(['hob']);
    expect(activeEquipment({ equipment: ['oven'] })).toEqual(['oven']);
    expect(activeEquipment()).toEqual([]);
  });
});

describe('varietyMeals', () => {
  const pool = [r('A', ['egg']), r('B', ['rice']), r('C', ['egg']), r('D', ['bean'])];
  it('is deterministic for a seed and returns the requested count', () => {
    const one = varietyMeals(pool, 3, 2).map((m) => m.name);
    expect(varietyMeals(pool, 3, 2).map((m) => m.name)).toEqual(one);
    expect(one).toHaveLength(3);
  });
  it('avoids repeating ingredients while the pool allows', () => {
    const names = varietyMeals(pool, 3, 0).map((m) => m.name);
    expect(names.includes('A') && names.includes('C')).toBe(false);
  });
  it('wraps only once the pool is exhausted', () => {
    expect(varietyMeals(pool, 6, 1)).toHaveLength(6);
  });
  it('returns no meals (not undefined holes) from an empty pool', () => {
    expect(varietyMeals([], 3, 1)).toEqual([]);
  });
});

describe('pantryCoverage and pantryHits', () => {
  it('counts what is covered and lists what is missing', () => {
    const cov = pantryCoverage(r('x', ['egg', 'rice']), ['egg']);
    expect(cov).toMatchObject({ have: 1, total: 2, pct: 50 });
    expect(cov.missing.map((i) => i.name)).toEqual(['rice']);
  });
  it('treats a recipe with no ingredients as fully covered', () => {
    expect(pantryCoverage(r('x'), []).pct).toBe(100);
  });
  it('pantryHits matches loosely and survives nameless entries', () => {
    expect(pantryHits(r('x', ['egg', 'rice']), ['Eggs'])).toBe(1);
    expect(pantryHits(r('x', ['egg']), [])).toBe(0);
    expect(pantryHits({ ingredients: [{}, { name: 'egg' }] }, ['egg'])).toBe(1);
  });
});

describe('hardFilter', () => {
  const list = [r('cheap'), r('dear', [], { costPerServing: 9 }), r('slow', [], { time: 90 }), r('nocost', [], { costPerServing: undefined })];
  it('drops over-budget, over-time and unpriced dishes', () => {
    expect(hardFilter(list, { budget: 4 }).map((m) => m.name)).toEqual(['cheap', 'slow']);
    expect(hardFilter(list, { budget: 4, maxTime: 30 }).map((m) => m.name)).toEqual(['cheap']);
  });
  it('applies goal limits', () => {
    expect(hardFilter([r('low', [], { protein: 5 })], { goal: 'muscle' })).toEqual([]);
    expect(hardFilter([r('big', [], { kcal: 700 })], { goal: 'lose' })).toEqual([]);
  });
});

describe('scopes and budget', () => {
  it('maps scopes to meal counts and slots', () => {
    expect([scopeCount('1 meal'), scopeCount('A day'), scopeCount('A week'), scopeCount('A month')]).toEqual([1, 3, 7, 28]);
    expect(scopeMeals('A day')).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(scopeMeals('A week')).toEqual(['dinner']);
  });
  it('scales the weekly budget by window length', () => {
    expect(windowBudget(70, 7)).toBe(70);
    expect(windowBudget(70, 28)).toBe(280);
    expect(windowBudget(0, 7)).toBeNull();
    expect(windowBudget(70, 0)).toBeNull();
  });
});
