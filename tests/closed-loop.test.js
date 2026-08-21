import { describe, expect, it } from 'vitest';
import {
  PACKAGE_GRAMS, mergeQtys, parseQtyAmount, qtyConfidence, qtySuffices,
} from '../src/lib/pantry.js';
import { canonicalName } from '../src/lib/aliases.js';
import {
  addDays, consumePantryIngredients, dayStamp, decrementPantryItem,
  expiringSoon, pantryAvailability,
} from '../src/lib/kitchen.js';
import {
  coveredByLeftovers, leftoverEntry, planEntries, shoppingForPlan,
} from '../src/lib/mealplan.js';
import { scaleQty } from '../src/lib/week-loop.js';
import { byId } from '../src/data/recipes.js';

const DAY = '2026-08-03';

/* ---------- Track 1 · quantities, units and aliases ---------- */

describe('quantity parsing (pantry.js)', () => {
  it('parses countable packages, normalising known tins/packs to mass', () => {
    expect(parseQtyAmount('2 tins')).toEqual({
      amount: 800, unit: 'g', raw: '2 tins', count: { amount: 2, unit: 'tin', grams: 400 },
    });
    expect(parseQtyAmount('400 g').amount).toBe(400);
    expect(parseQtyAmount('3 x 200g').amount).toBe(600);
    expect(parseQtyAmount('½ lemon').amount).toBe(0.5);
  });

  it('normalises a tin of tomatoes to the 400 g they come in', () => {
    const one = parseQtyAmount('1 tin');
    expect(one.amount).toBe(400);
    expect(one.unit).toBe('g');
    expect(PACKAGE_GRAMS.tin).toBe(400);
  });

  it('merges quantities on the same scale', () => {
    expect(mergeQtys('200g', '300 g')).toBe('500 g');
    expect(mergeQtys('1 tin', '1 tin')).toBe('800 g');
  });

  it('judges whether what we have covers what a recipe needs', () => {
    expect(qtySuffices('500 g', '400 g')).toBe(true);
    expect(qtySuffices('200 g', '400 g')).toBe(false);
    expect(qtyConfidence('2 tins')).toBe('exact');
    expect(qtyConfidence('some')).toBe('unknown');
  });
});

describe('ingredient aliases (aliases.js)', () => {
  it('resolves everyday alias pairs to one canonical name', () => {
    expect(canonicalName('coriander')).toBe(canonicalName('cilantro'));
    expect(canonicalName('tin tomatoes')).toBe(canonicalName('chopped tomatoes'));
  });

  it('prefers a user-taught correction over the table', () => {
    const taught = canonicalName('tomatos', { tomatos: 'tomatoes' });
    expect(taught).toBe('tomatoes');
  });
});

/* ---------- Track 1 · pantry truth and consumption ---------- */

describe('pantry truth (kitchen.js)', () => {
  it('treats a bare row as have (a plain list is a fact, not a guess)', () => {
    // A row with no amount is still a row you wrote down: it counts as
    // confirmed, and the amount-aware pass only downgrades when both sides
    // are countable and the pantry is short.
    expect(pantryAvailability({ name: 'Rice' })).toBe('confirmed_sufficient');
  });

  it('marks fresh tins as confirmed sufficient and low stock as running low', () => {
    expect(pantryAvailability({ name: 'Rice', qty: '2 kg', low: false })).toBe('confirmed_sufficient');
    expect(pantryAvailability({ name: 'Rice', qty: '2 kg', low: true })).toBe('running_low');
  });

  it('flags items that are due to go off', () => {
    const pantry = [
      { name: 'Milk', qty: '1 l', expiry: addDays(DAY, 1) },
      { name: 'Bread', qty: '1 loaf', expiry: addDays(DAY, 10) },
    ];
    const soon = expiringSoon(pantry, 3, DAY);
    expect(soon.map((item) => item.name)).toEqual(['Milk']);
  });
});

/* ---------- Full loop: plan → shop → pantry → cook → leftovers → next plan ---------- */

describe('closed loop (plan → shop → cook → leftovers → next plan)', () => {
  const dinner = 'chicken-traybake';
  const planWith = (date) => ({ [date]: { dinner } });

  it('shops for the plan when the pantry is empty', () => {
    const list = shoppingForPlan(planWith(DAY), [DAY], { pantry: [] });
    expect(list.some((row) => canonicalName(row.name) === canonicalName('Chicken thighs'))).toBe(true);
    expect(list.some((row) => canonicalName(row.name) === canonicalName('New potatoes'))).toBe(true);
  });

  it('does not re-buy what the pantry already holds', () => {
    const pantry = [
      { name: 'Chicken thighs', qty: '8', cat: 'Meat', location: 'Fridge' },
      { name: 'New potatoes', qty: '600g', cat: 'Produce', location: 'Fridge' },
    ];
    const list = shoppingForPlan(planWith(DAY), [DAY], { pantry });
    expect(list.some((row) => canonicalName(row.name) === canonicalName('Chicken thighs'))).toBe(false);
    expect(list.some((row) => canonicalName(row.name) === canonicalName('New potatoes'))).toBe(false);
  });

  it('re-adds an item whose amount is short of the recipe', () => {
    const pantry = [
      { name: 'Chicken thighs', qty: '4', cat: 'Meat', location: 'Fridge' },
    ];
    const list = shoppingForPlan(planWith(DAY), [DAY], { pantry });
    expect(list.some((row) => canonicalName(row.name) === canonicalName('Chicken thighs'))).toBe(true);
  });

  it("adds up a week's need for one ingredient across every dish", () => {
    // Two curries, 300 g of rice each. 300 g in the cupboard covers one of
    // them, not both — the list used to keep only the last recipe's amount and
    // call the week covered.
    const plan = { [DAY]: { dinner: 'chickpea-curry' }, [addDays(DAY, 1)]: { dinner: 'katsu-curry' } };
    const dates = [DAY, addDays(DAY, 1)];
    const short = shoppingForPlan(plan, dates, {
      pantry: [{ name: 'Rice', qty: '300 g', cat: 'Baking & dry' }],
    });
    expect(short.some((row) => canonicalName(row.name) === canonicalName('Rice'))).toBe(true);

    const enough = shoppingForPlan(plan, dates, {
      pantry: [{ name: 'Rice', qty: '1 kg', cat: 'Baking & dry' }],
    });
    expect(enough.some((row) => canonicalName(row.name) === canonicalName('Rice'))).toBe(false);
  });

  it('consumes pantry stock when the dish is cooked', () => {
    const recipe = byId(dinner);
    const pantry = [
      { name: 'Chicken thighs', qty: '8', cat: 'Meat', location: 'Fridge' },
      { name: 'New potatoes', qty: '600g', cat: 'Produce', location: 'Fridge' },
    ];
    const { pantry: after, used, shortfalls } = consumePantryIngredients(pantry, recipe.ingredients);
    expect(used.length).toBeGreaterThanOrEqual(2);
    // A cook spends what the recipe actually called for. The traybake wants all
    // 8 thighs and all 600 g of potatoes, so both rows are gone — the old
    // behaviour took one thigh and left the pantry claiming seven were still in
    // the fridge.
    expect(after.some((item) => canonicalName(item.name) === canonicalName('Chicken thighs'))).toBe(false);
    expect(after.some((item) => canonicalName(item.name) === canonicalName('New potatoes'))).toBe(false);
    expect(shortfalls.map((row) => canonicalName(row.name))).not.toContain(canonicalName('Chicken thighs'));
  });

  it('takes only what the recipe needs, and leaves the rest', () => {
    const recipe = byId(dinner); // 8 thighs, 600 g new potatoes
    const pantry = [
      { name: 'Chicken thighs', qty: '10', cat: 'Meat', location: 'Fridge' },
      { name: 'New potatoes', qty: '1 kg', cat: 'Produce', location: 'Fridge' },
    ];
    const { pantry: after } = consumePantryIngredients(pantry, recipe.ingredients);
    expect(after.find((i) => canonicalName(i.name) === canonicalName('Chicken thighs'))?.qty).toBe('2');
    expect(after.find((i) => canonicalName(i.name) === canonicalName('New potatoes'))?.qty).toBe('400 g');
  });

  it('says what it ran short of instead of quietly cooking anyway', () => {
    const recipe = byId(dinner);
    const pantry = [{ name: 'Chicken thighs', qty: '3', cat: 'Meat', location: 'Fridge' }];
    const { pantry: after, shortfalls } = consumePantryIngredients(pantry, recipe.ingredients);
    expect(after.some((i) => canonicalName(i.name) === canonicalName('Chicken thighs'))).toBe(false);
    const short = shortfalls.find((row) => canonicalName(row.name) === canonicalName('Chicken thighs'));
    expect(short?.short).toBe('5');
  });

  it('restores the pantry exactly as it was when a cook is undone', () => {
    const pantry = [{ name: 'Chicken thighs', qty: '8', cat: 'Meat', location: 'Fridge' }];
    const result = consumePantryIngredients(pantry, byId(dinner).ingredients);
    expect(result.pantry).not.toEqual(pantry);
    expect(result.restore).toEqual(pantry);
  });

  it('empties the carton nearest its date before the fresh one', () => {
    const pantry = [
      { name: 'New potatoes', qty: '400 g', expiry: addDays(DAY, 9) },
      { name: 'New potatoes', qty: '400 g', expiry: addDays(DAY, 2) },
    ];
    const { pantry: after } = consumePantryIngredients(pantry, [{ name: 'New potatoes', qty: '400g' }]);
    expect(after).toHaveLength(1);
    expect(after[0].expiry).toBe(addDays(DAY, 9));
  });

  it('leaves leftovers in the pantry with a use-by date', () => {
    const recipe = byId(dinner);
    const leftover = leftoverEntry(recipe, 2, DAY);
    expect(leftover.cat).toBe('Leftovers');
    expect(leftover.portions).toBe(2);
    expect(leftover.expiry > DAY).toBe(true);
  });

  it('covers a repeated meal from leftovers instead of shopping again', () => {
    const recipe = byId(dinner);
    const pantry = [leftoverEntry(recipe, 2, addDays(DAY, -1))];
    const plan = { [DAY]: { dinner }, [addDays(DAY, 1)]: { dinner } };
    const dates = [DAY, addDays(DAY, 1)];
    const covered = coveredByLeftovers(plan, dates, pantry);
    // Two leftover portions spend one per planned dinner — both are covered.
    expect(covered.length).toBe(2);
    // Covered dinners are not re-bought on the next list.
    const list = shoppingForPlan(plan, dates, { pantry });
    expect(list.some((row) => canonicalName(row.name) === canonicalName('Chicken thighs'))).toBe(false);
  });

  it('scales quantities for the household size', () => {
    expect(scaleQty('600g', 1.5)).toMatch(/900/);
    expect(scaleQty('8', 0.5)).toMatch(/4/);
  });

  it('keeps the full week loop intact: plan then shop then steady', () => {
    // One turn of the loop, all through real lib functions:
    const dates = [DAY];
    const list = shoppingForPlan(planWith(DAY), dates, { pantry: [] });
    expect(list.length).toBeGreaterThan(0);
    // The shop fills the pantry…
    const pantry = list.map((row) => ({
      name: row.name, qty: row.qty, cat: row.cat || 'Store', location: 'Fridge', addedAt: DAY,
    }));
    expect(pantryAvailability(pantry[0])).toBe('confirmed_sufficient');
    // …cooking spends it…
    const { pantry: afterCook } = consumePantryIngredients(pantry, byId(dinner).ingredients);
    // …and the loop is ready to turn again rather than stuck mid-week.
    expect(afterCook).toBeDefined();
    expect(planEntries(planWith(DAY), dates).length).toBe(1);
  });
});
