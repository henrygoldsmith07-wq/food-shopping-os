import { describe, it, expect } from 'vitest';
import {
  pantryCoverage, expiringIngredients, leftoverYield, fitsSchedule,
  explainRecommendation, rankRecipesForSlot, bestForSlot, scoreRecipe,
} from '../src/lib/recommend.js';

const r = (over = {}) => ({
  id: 'r', name: 'Chicken fajitas', meal: 'dinner', cuisine: 'Mexican',
  tags: ['quick'], time: 24, servings: 6, costPerServing: 2.17, kcal: 480,
  protein: 28, ingredients: [
    { name: 'Chicken breast', qty: '400 g' },
    { name: 'Peppers', qty: '2' },
    { name: 'Onion', qty: '1' },
    { name: 'Tortillas', qty: '4' },
    { name: 'Cumin', qty: '1 tsp' },
    { name: 'Lime', qty: '1' },
  ], steps: [{ text: 'Cook it.' }],
  ...over,
});

const today = '2026-02-10'; // February
const pantry = [
  { id: 'p1', name: 'Chicken breast', expiry: '2026-02-14' },
  { id: 'p2', name: 'Peppers', expiry: '2026-02-11' }, // expires tomorrow
  { id: 'p3', name: 'Onion', expiry: '2026-02-17' },
  { id: 'p4', name: 'Tortillas', expiry: null },
  { id: 'p5', name: 'Cumin' },
];

describe('pantryCoverage', () => {
  it('counts matched ingredients case-insensitively with substring fallthrough', () => {
    const { pct, have, total, missing } = pantryCoverage(r(), pantry.map((p) => p.name));
    // 5 of 6 present, lime missing
    expect(have).toBe(5);
    expect(total).toBe(6);
    expect(pct).toBe(83);
    expect(missing.map((m) => m.name)).toEqual(['Lime']);
  });
  it('returns 0 when pantry is empty', () => {
    expect(pantryCoverage(r(), []).pct).toBe(0);
  });
});

describe('expiringIngredients', () => {
  it('surfaces peppers expiring tomorrow first', () => {
    const exp = expiringIngredients(r(), pantry, today, 3);
    expect(exp[0].pantryItem.name).toBe('Peppers');
    expect(exp[0].daysLeft).toBe(1);
  });
  it('dedupes pantry rows with same normalized name', () => {
    const dup = [...pantry, { id: 'p6', name: 'peppers', expiry: '2026-02-12' }];
    expect(expiringIngredients(r(), dup, today, 3).filter((e) => e.pantryItem.name.toLowerCase() === 'peppers')).toHaveLength(1);
  });
  it('ignores items past -1 day window', () => {
    const old = [{ id: 'p1', name: 'Peppers', expiry: '2026-02-05' }];
    expect(expiringIngredients(r(), old, today, 3)).toHaveLength(0);
  });
});

describe('leftoverYield', () => {
  it('six servings → two lunch portions', () => {
    expect(leftoverYield(r({ servings: 6, tags: [] }))).toEqual({ portions: 2, note: 'Creates two lunch portions' });
  });
  it('batch tag with 2 servings → one portion', () => {
    expect(leftoverYield(r({ servings: 2, tags: ['batch'] })).portions).toBe(1);
  });
  it('2 servings, no batch → none', () => {
    expect(leftoverYield(r({ servings: 2, tags: [] })).portions).toBe(0);
  });
});

describe('fitsSchedule', () => {
  it('busy Tuesday only fits ≤25 min dishes', () => {
    const av = { '2026-02-10': { busy: true, date: '2026-02-10', dayName: 'Tuesday' } };
    expect(fitsSchedule(r({ time: 24 }), '2026-02-10', av).fits).toBe(true);
    expect(fitsSchedule(r({ time: 40 }), '2026-02-10', av).fits).toBe(false);
  });
  it('open day always fits', () => {
    expect(fitsSchedule(r({ time: 90 }), '2026-02-11', {}).fits).toBe(true);
  });
  it('respects maxMinutes window', () => {
    const av = { '2026-02-11': { date: '2026-02-11', dayName: 'Wednesday', maxMinutes: 20 } };
    expect(fitsSchedule(r({ time: 20 }), '2026-02-11', av).fits).toBe(true);
    expect(fitsSchedule(r({ time: 21 }), '2026-02-11', av).fits).toBe(false);
  });
});

describe('explainRecommendation — the five verifiable lines', () => {
  it('produces the brief example lines', () => {
    const availability = { '2026-02-10': { busy: true, date: '2026-02-10', dayName: 'Tuesday' } };
    const exp = explainRecommendation(r(), {
      pantry, today, date: '2026-02-10', availability, people: 2, budget: 2.5, month: 2,
    });
    expect(exp.coverage.pct).toBe(83);
    expect(exp.expiring.some((e) => e.daysLeft === 1)).toBe(true);
    expect(exp.timeMins).toBe(24);
    expect(exp.schedule.fits).toBe(true);
    expect(exp.cost).toBeCloseTo(2.17);
    expect(exp.leftover.note).toBe('Creates two lunch portions');
    // Lines are what the UI renders verbatim
    expect(exp.lines.join(' | ')).toMatch(/83% already in your kitchen/);
    expect(exp.lines.join(' | ')).toMatch(/peppers expiring tomorrow/i);
    expect(exp.lines.join(' | ')).toMatch(/24 minutes/);
    expect(exp.lines.join(' | ')).toMatch(/£2\.17\/person/);
    expect(exp.lines.join(' | ')).toMatch(/two lunch portions/);
  });
  it('cost line respects per-person scaling', () => {
    const exp = explainRecommendation(r({ costPerServing: 1.2 }), { pantry: [], today, budget: 4 });
    expect(exp.cost).toBe(1.2);
  });
});

describe('ranking — sensitivity to pantry, expiry, schedule, cost', () => {
  const mkR = (id, extra = {}) => r({ id, name: id, ...extra });

  const pantryHeavy = ['Chicken breast', 'Peppers', 'Onion', 'Tortillas', 'Cumin', 'Lime'];
  const ctxBase = { pantry, today, date: '2026-02-10', budget: 4, month: 7, taste: null };

  it('more pantry coverage outranks less at equal time and cost', () => {
    const full = mkR('full', { ingredients: [{ name: 'Chicken breast' }, { name: 'Peppers' }, { name: 'Onion' }], time: 20, costPerServing: 1.5 });
    const thin = mkR('thin', { ingredients: [{ name: 'Wagyu' }, { name: 'Truffle' }, { name: 'Caviar' }], time: 20, costPerServing: 1.5 });
    expect(scoreRecipe(full, { ...ctxBase, pantry })).toBeGreaterThan(scoreRecipe(thin, { ...ctxBase, pantry }));
  });

  it('using an expiring item lifts the score', () => {
    const usesPepper = mkR('uses', { ingredients: [{ name: 'Peppers' }], time: 20, costPerServing: 1.5 });
    const avoids = mkR('avoids', { ingredients: [{ name: 'Carrots' }], time: 20, costPerServing: 1.5 });
    expect(scoreRecipe(usesPepper, ctxBase)).toBeGreaterThan(scoreRecipe(avoids, ctxBase));
  });

  it('busy-day filter: short dish outranks long one, and both scores make it visible', () => {
    const busyCtx = { ...ctxBase, availability: { '2026-02-10': { busy: true, date: '2026-02-10', dayName: 'Tuesday' } } };
    const short = mkR('short', { time: 20, costPerServing: 1.5, ingredients: [{ name: 'Chicken breast' }] });
    const long = mkR('long', { time: 60, costPerServing: 1.5, ingredients: [{ name: 'Chicken breast' }] });
    expect(scoreRecipe(short, busyCtx)).toBeGreaterThan(scoreRecipe(long, busyCtx));
  });

  it('cheap dish favoured over expensive at same coverage', () => {
    const cheap = mkR('cheap', { costPerServing: 1.1, time: 20, ingredients: [{ name: 'Chicken breast' }] });
    const pricey = mkR('pricey', { costPerServing: 3.8, time: 20, ingredients: [{ name: 'Chicken breast' }] });
    expect(scoreRecipe(cheap, { ...ctxBase, budget: 2.5 })).toBeGreaterThan(scoreRecipe(pricey, { ...ctxBase, budget: 2.5 }));
  });

  it('batch/leftover bonus lifts otherwise equal candidates', () => {
    const batch = mkR('batch', { servings: 6, tags: ['batch'], time: 30, ingredients: [{ name: 'Chicken breast' }] });
    const solo = mkR('solo', { servings: 2, tags: [], time: 30, ingredients: [{ name: 'Chicken breast' }] });
    expect(scoreRecipe(batch, ctxBase)).toBeGreaterThan(scoreRecipe(solo, ctxBase));
  });

  it('ranking is deterministic and sorted', () => {
    const rows = rankRecipesForSlot([mkR('a'), mkR('b', { time: 10 }), mkR('c', { servings: 8 })], ctxBase);
    expect(rows.map((x) => x.recipe.id)).toHaveLength(3);
    expect(rows[0].explanation.score).toBeGreaterThanOrEqual(rows[1].explanation.score);
  });

  it('bestForSlot returns highest scored', () => {
    const best = bestForSlot([mkR('low', { costPerServing: 4, ingredients: [{ name: 'Lobster' }] }), mkR('high', { ingredients: [{ name: 'Peppers' }] })], ctxBase);
    expect(best.recipe.id).toBe('high');
  });

  it('taste match is a bounded bonus, not a veto', () => {
    const taste = { rated: 5, ratings: { 'uses-pepper': 'love' }, cuisines: { Mexican: 6 }, tags: {}, topCuisines: ['Mexican'], topTags: [] };
    const mexican = mkR('uses-pepper', { cuisine: 'Mexican', time: 24, ingredients: [{ name: 'Peppers' }] });
    const other = mkR('other', { cuisine: 'French', time: 24, ingredients: [{ name: 'Peppers' }] });
    const sMex = scoreRecipe(mexican, { ...ctxBase, taste });
    const sOther = scoreRecipe(other, { ...ctxBase, taste });
    expect(sMex).toBeGreaterThan(sOther);
    // But without pantry advantage an Italian pepper user still has non-zero score
    expect(sOther).toBeGreaterThan(0.5);
  });
});
