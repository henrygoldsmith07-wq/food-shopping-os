import { describe, expect, it } from 'vitest';
import { scrapAdjustedQty, scrapIngredientRates } from '../src/lib/scrap-factors.js';
import { wasteAwareList } from '../src/lib/loop-learning.js';

const TODAY = '2026-09-06';
const day = (offset) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};

const FAJITAS = {
  id: 'r-faj',
  name: 'Chicken fajitas',
  servings: 4,
  ingredients: [
    { name: 'Chicken breast', qty: '600 g' },
    { name: 'Peppers', qty: '2' },
    { name: 'Coriander', qty: '1 bunch' },
    { name: 'Olive oil', qty: '2 tbsp' },
  ],
};
const STEW = {
  id: 'r-stew',
  name: 'Beef stew',
  servings: 4,
  ingredients: [
    { name: 'Beef', qty: '500 g' },
    { name: 'Olive oil', qty: '1 tbsp' },
  ],
};
const RECIPES = [FAJITAS, STEW];

const scrapWaste = (n, { offset = 3, cat = 'Leftovers', name = 'Chicken fajitas (leftovers)' } = {}) =>
  Array.from({ length: n }, (_, i) => ({ name, cat, reason: 'expired', date: day(offset + i), cost: 0 }));
const cooks = (recipeId, n) => Array.from({ length: n }, (_, i) => ({ recipeId, date: day(i + 1) }));

describe('scrapIngredientRates', () => {
  it('attributes leftover discards to the recipe\'s ingredients, with cooks as denominator', () => {
    const rates = scrapIngredientRates(scrapWaste(2), [...cooks('r-faj', 2), ...cooks('r-stew', 1)], RECIPES, { today: TODAY });
    const coriander = rates.get('coriander');
    expect(coriander).toMatchObject({ discards: 2, cooks: 2, rate: 1, recipeName: 'Chicken fajitas' });
    expect(rates.get('peppers')).toMatchObject({ discards: 2, cooks: 2, rate: 1 });
    // The stew was cooked too, and shares olive oil — the oil's rate dilutes.
    const oil = rates.get('olive oil');
    expect(oil).toMatchObject({ discards: 2, cooks: 3, rate: 0.67 });
    // Beef has one cook — under the evidence floor, so no rate.
    expect(rates.has('beef')).toBe(false);
  });

  it('needs two cooks and two discards', () => {
    expect(scrapIngredientRates(scrapWaste(1), cooks('r-faj', 3), RECIPES, { today: TODAY }).size).toBe(0);
    expect(scrapIngredientRates(scrapWaste(2), cooks('r-faj', 1), RECIPES, { today: TODAY }).size).toBe(0);
    expect(scrapIngredientRates(scrapWaste(1), cooks('r-faj', 4), RECIPES, { today: TODAY }).size).toBe(0); // rate 0.25
  });

  it('ignores discards older than the lookback window', () => {
    const rates = scrapIngredientRates(scrapWaste(2, { offset: 90 }), cooks('r-faj', 2), RECIPES, { today: TODAY });
    expect(rates.size).toBe(0);
  });

  it('ignores waste rows that are not leftover scraps', () => {
    const waste = [
      { name: 'Chicken breast', cat: 'Fresh', reason: 'expired', date: day(2) },
      { name: 'Peppers', cat: 'Fresh', reason: 'expired', date: day(2) },
    ];
    expect(scrapIngredientRates(waste, cooks('r-faj', 2), RECIPES, { today: TODAY }).size).toBe(0);
  });

  it('ignores leftover rows for recipes the app does not know', () => {
    const waste = scrapWaste(2, { name: 'Takeaway curry (leftovers)' });
    expect(scrapIngredientRates(waste, cooks('r-faj', 2), RECIPES, { today: TODAY }).size).toBe(0);
  });

  it('matches leftovers by recipe name without the suffix or category', () => {
    const waste = scrapWaste(2, { cat: 'Other', name: 'chicken fajitas (Leftovers)' });
    expect(scrapIngredientRates(waste, cooks('r-faj', 2), RECIPES, { today: TODAY }).get('coriander')).toBeTruthy();
  });
});

describe('scrapAdjustedQty', () => {
  it('drops one unit from integer counts', () => {
    expect(scrapAdjustedQty({ qty: '2' }, 1)).toEqual({ qty: '1' });
    expect(scrapAdjustedQty({ qty: '3 peppers' }, 0.6)).toEqual({ qty: '2 peppers' });
  });

  it('shrinks mass once the rate is high, capped at a quarter', () => {
    expect(scrapAdjustedQty({ qty: '600 g' }, 1)).toEqual({ qty: '450 g' });
    expect(scrapAdjustedQty({ qty: '600 g' }, 0.6)).toBeNull();
  });

  it('never touches rows the evidence cannot shrink', () => {
    expect(scrapAdjustedQty({ qty: '1 bunch' }, 1)).toBeNull();
    expect(scrapAdjustedQty({ qty: '' }, 1)).toBeNull();
    expect(scrapAdjustedQty({ qty: '3' }, 0.4)).toBeNull();
    expect(scrapAdjustedQty({ qty: 'some' }, 1)).toBeNull();
  });
});

describe('wasteAwareList scrap integration', () => {
  it('lightens scrap-heavy rows and says why', () => {
    const rows = wasteAwareList(
      [
        { name: 'Coriander', qty: '2 bunches', fromRecipe: 'Chicken fajitas' },
        { name: 'Peppers', qty: '3', fromRecipe: 'Chicken fajitas' },
        { name: 'Chicken breast', qty: '600 g', fromRecipe: 'Chicken fajitas' },
      ],
      { waste: scrapWaste(2), cooked: cooks('r-faj', 2), recipes: RECIPES, today: TODAY },
    );
    expect(rows[0].qty).toBe('1 bunches');
    expect(rows[0].wasteNote).toMatch(/leftovers were binned 2× of 2 cooks/);
    expect(rows[1].qty).toBe('2');
    expect(rows[2].qty).toBe('450 g'); // rate 1 → mass shrinks a quarter
  });

  it('leaves rows alone without cooked evidence', () => {
    const rows = wasteAwareList([{ name: 'Coriander', qty: '2 bunches' }], {
      waste: scrapWaste(2), today: TODAY,
    });
    expect(rows[0].qty).toBe('2 bunches');
    expect(rows[0].wasteNote).toBeUndefined();
  });

  it('direct bins outrank scrap evidence', () => {
    const waste = [
      ...scrapWaste(2),
      { name: 'Peppers', cat: 'Fresh', reason: 'expired', date: day(2) },
      { name: 'Peppers', cat: 'Fresh', reason: 'expired', date: day(4) },
    ];
    const [row] = wasteAwareList([{ name: 'Peppers', qty: '3' }], {
      waste, cooked: cooks('r-faj', 2), recipes: RECIPES, today: TODAY,
    });
    expect(row.wasteNote).toMatch(/Binned 2×/);
    expect(row.qty).toBe('2');
  });
});
