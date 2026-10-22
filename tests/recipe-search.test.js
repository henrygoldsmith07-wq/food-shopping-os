import { describe, it, expect } from 'vitest';
import { enrichRecipeTags, searchAndSortRecipes } from '../src/lib/recipe-search.js';

const r = (name, o = {}) => ({ name, ingredients: [], ...o });

describe('enrichRecipeTags', () => {
  it('adds tags from real numbers only', () => {
    const t = enrichRecipeTags(r('a', { kcal: 400, time: 15, protein: 31, fibre: 8, meal: 'dinner' })).tags;
    expect(t).toEqual(expect.arrayContaining(['light', 'quick', 'high-protein', 'high-fibre', 'dinner']));
  });
  it('does not tag recipes with missing numbers as light or quick', () => {
    const t = enrichRecipeTags(r('a', { kcal: null, time: '' })).tags;
    expect(t).not.toContain('light');
    expect(t).not.toContain('quick');
  });
});

describe('searchAndSortRecipes', () => {
  it('matches every word across name and ingredients', () => {
    const list = [r('Soup', { ingredients: ['leek', { name: 'Potato' }] }), r('Salad')];
    expect(searchAndSortRecipes(list, { query: 'leek potato' }).map((x) => x.name)).toEqual(['Soup']);
  });
  it('sorts cost with missing costs last, not scrambled by NaN', () => {
    const list = [r('B', {}), r('A', { costPerServing: 3 }), r('C', { costPerServing: 1 })];
    expect(searchAndSortRecipes(list, { sort: 'cost' }).map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });
  it('sorts health best first with missing scores last', () => {
    const list = [r('A'), r('B', { healthScore: 5 }), r('C', { healthScore: 9 })];
    expect(searchAndSortRecipes(list, { sort: 'health' }).map((x) => x.name)).toEqual(['C', 'B', 'A']);
  });
  it('puts names starting with the query first', () => {
    const list = [r('Spicy rice'), r('Rice bowl')];
    expect(searchAndSortRecipes(list, { query: 'rice' })[0].name).toBe('Rice bowl');
  });
});
