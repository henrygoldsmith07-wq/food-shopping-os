import { describe, expect, it } from 'vitest';
import { dinnerDeck, openDinnerDates, plannedRecipeIds, weekCostSummary } from '../src/lib/swipe-week.js';

const recipes = [
  { id: 'a', meal: 'dinner', name: 'Curry', tags: [] },
  { id: 'b', meal: 'dinner', name: 'Salmon', tags: [] },
  { id: 'c', meal: 'breakfast', name: 'Oats', tags: [] },
  { id: 'd', meal: 'dinner', name: 'Chilli', tags: [] },
];

describe('dinnerDeck', () => {
  it('offers only dinners, favourites first, keeping order otherwise', () => {
    expect(dinnerDeck(recipes, { favourites: ['d'] }).map((r) => r.id)).toEqual(['d', 'a', 'b']);
  });

  it('never offers a recipe already planned this week or skipped in this deck', () => {
    expect(dinnerDeck(recipes, { planned: ['a'], skipped: ['b'] }).map((r) => r.id)).toEqual(['d']);
  });

  it('copes with no recipes', () => {
    expect(dinnerDeck()).toEqual([]);
  });
});

describe('openDinnerDates', () => {
  const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'];

  it('lists open dinners from today on, never past days', () => {
    const plan = { '2026-10-28': { dinner: 'a' } };
    expect(openDinnerDates(plan, dates, '2026-10-27')).toEqual(['2026-10-27', '2026-10-29']);
  });

  it('treats a slot with only lunch as an open dinner', () => {
    expect(openDinnerDates({ '2026-10-29': { lunch: 'x' } }, dates, '2026-10-29')).toEqual(['2026-10-29']);
  });
});

describe('plannedRecipeIds', () => {
  it('collects every planned recipe across slots once', () => {
    const plan = { d1: { dinner: 'a', lunch: 'b' }, d2: { dinner: 'a' }, d3: {} };
    expect(plannedRecipeIds(plan, ['d1', 'd2', 'd3']).sort()).toEqual(['a', 'b']);
  });
});

describe('weekCostSummary', () => {
  it('reports cost, per-serving average and which nights have a dinner', () => {
    const plan = { d1: { dinner: 'a' }, d3: { dinner: 'b' } };
    const summary = weekCostSummary({ cost: 12, meals: 3 }, 2, plan, ['d1', 'd2', 'd3']);
    expect(summary.perServing).toBe(2);
    expect(summary.dinnersPlanned).toBe(2);
    expect(summary.nights.map((n) => n.planned)).toEqual([true, false, true]);
  });

  it('never divides by zero on an empty week', () => {
    expect(weekCostSummary({ cost: 0, meals: 0 }, 0, {}, [])).toMatchObject({ perServing: 0, dinnersPlanned: 0 });
  });
});
