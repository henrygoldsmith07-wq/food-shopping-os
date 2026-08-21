import { describe, it, expect } from 'vitest';
import {
  addDays, badgeProgress, budgetWeeks, cuisineSplit, dayStamp, daysUntil, expiringSoon,
  consumePantryIngredients, decrementPantryItem, groceryInflation, kitchenStats, leftovers, pantryAnalytics,
  pantryFromShareCode, pantryShareCode, pantryValue, planCost, plannedMeals, priceHistory,
  recipesUsing, runningLow, savingsSummary, spendByMonth, spentInMonth, spentInWeek,
  streakFrom, weekDates, weekStart,
} from '../src/lib/kitchen.js';
import { groupByAisle, guessAisle, itemsFromRecipes, totalOf, checkedTotalOf } from '../src/data/stores.js';
import { RECIPES } from '../src/data/recipes.js';

const TODAY = '2026-07-27'; // a Monday

describe('dates', () => {
  it('walks days and weeks without timezone drift', () => {
    expect(addDays(TODAY, 1)).toBe('2026-07-28');
    expect(addDays(TODAY, -1)).toBe('2026-07-26');
    expect(daysUntil('2026-07-30', TODAY)).toBe(3);
    expect(daysUntil('2026-07-26', TODAY)).toBe(-1);
    expect(daysUntil(null, TODAY)).toBeNull();
  });

  it('starts weeks on Monday', () => {
    expect(weekStart(TODAY)).toBe(TODAY);
    expect(weekStart('2026-07-26')).toBe('2026-07-20'); // a Sunday
    expect(weekDates(TODAY)).toHaveLength(7);
    expect(weekDates(TODAY)[6]).toBe('2026-08-02');
  });

  it('produces today in local time', () => {
    expect(dayStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pantry', () => {
  const pantry = [
    { id: '1', name: 'Spinach', cost: 1, expiry: '2026-07-28' },
    { id: '2', name: 'Milk', cost: 1.45, expiry: '2026-07-30' },
    { id: '3', name: 'Rice', cost: 3.5, expiry: null, low: true },
    { id: '4', name: 'Ragu', cost: 0, cat: 'Leftovers' },
  ];

  it('values what you have and finds what needs eating', () => {
    expect(pantryValue(pantry)).toBe(5.95);
    expect(expiringSoon(pantry, 3, TODAY).map((p) => p.name)).toEqual(['Spinach', 'Milk']);
    expect(runningLow(pantry).map((p) => p.name)).toEqual(['Rice']);
    expect(leftovers(pantry).map((p) => p.name)).toEqual(['Ragu']);
  });

  it('is empty-safe', () => {
    expect(pantryValue([])).toBe(0);
    expect(expiringSoon([], 3, TODAY)).toEqual([]);
    expect(recipesUsing([], 3, TODAY)).toEqual([]);
  });

  it('suggests recipes that use what is about to go off', () => {
    const uses = recipesUsing(pantry, 3, TODAY);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses[0].hits).toBeGreaterThan(0);
    expect(uses[0].recipe.ingredients.some((i) => /spinach|milk/i.test(i.name))).toBe(true);
  });

  it('summarises locations, categories and date coverage without storing totals', () => {
    const analytics = pantryAnalytics(pantry, TODAY);
    expect(analytics.byLocation).toEqual([
      { label: 'Unassigned', count: 4, value: 5.95 },
    ]);
    expect(analytics.byCategory).toEqual(expect.arrayContaining([
      { label: 'Leftovers', count: 1, value: 0 },
      { label: 'Other', count: 3, value: 5.95 },
    ]));
    expect(analytics.dated).toBe(2);
    expect(analytics.useSoon).toBe(2);
  });

  it('removes pantry items that a completed recipe used', () => {
    const stocked = [
      { id: 'p1', name: 'Chicken thighs', qty: '8' },
      { id: 'p2', name: 'New potatoes', qty: '600 g' },
      { id: 'p3', name: 'Milk', qty: '1 litre' },
    ];
    const ingredients = [{ name: 'Chicken thighs' }, { name: 'New potatoes' }, { name: 'Garlic' }];
    const result = consumePantryIngredients(stocked, ingredients);
    expect(result.pantry.map((p) => p.name)).toEqual(['Chicken thighs', 'Milk']);
    expect(result.pantry[0].qty).toBe('7');
    expect(result.used.map((p) => p.name)).toEqual(['Chicken thighs', 'New potatoes']);
  });

  it('decrements countable stock and keeps free-text quantities honest', () => {
    const next = decrementPantryItem({ id: 'p1', name: 'Beans', qty: '2 tins', cost: 3 });
    expect(next.remove).toBe(false);
    expect(next.item.qty).toBe('1 tin');
    expect(next.item.cost).toBe(1.5);
    expect(decrementPantryItem({ id: 'p2', name: 'Flour', qty: '500 g' })).toEqual({ remove: true });
    expect(decrementPantryItem({ id: 'p3', name: 'Leftover curry', cat: 'Leftovers', portions: 2, qty: '2 portions' }).item)
      .toMatchObject({ portions: 1, qty: '1 portion' });
  });

  it('round-trips a household pantry share code and rejects invalid input', () => {
    const code = pantryShareCode(pantry);
    expect(pantryFromShareCode(code).map((p) => p.name)).toEqual(pantry.map((p) => p.name));
    expect(() => pantryFromShareCode('not-a-pantry')).toThrow(/pantry code/i);
  });
});

describe('shopping list', () => {
  it('guesses an aisle so adding an item is one field', () => {
    expect(guessAisle('Chicken breast')).toBe('Meat & fish');
    expect(guessAisle('Sourdough loaf')).toBe('Bakery');
    expect(guessAisle('Spinach')).toBe('Fruit & veg');
    expect(guessAisle('Mystery thing')).toBe('Other');
  });

  it('totals a list and the part you have ticked', () => {
    const list = [
      { id: '1', name: 'Milk', price: 1.45, checked: true, aisle: 'Dairy & eggs' },
      { id: '2', name: 'Bread', price: 1.2, checked: false, aisle: 'Bakery' },
    ];
    expect(totalOf(list)).toBeCloseTo(2.65, 2);
    expect(checkedTotalOf(list)).toBeCloseTo(1.45, 2);
    expect(groupByAisle(list).map(([aisle]) => aisle)).toEqual(['Bakery', 'Dairy & eggs']);
  });

  it('pulls a recipe’s missing ingredients, skipping what the pantry has', () => {
    const recipe = RECIPES.find((r) => r.id === 'chickpea-curry');
    const all = itemsFromRecipes([recipe]);
    const some = itemsFromRecipes([recipe], ['Spinach', 'Rice']);
    expect(all.length).toBe(recipe.ingredients.length);
    expect(some.length).toBe(all.length - 2);
    expect(all.every((i) => i.price === 0)).toBe(true); // you fill prices in as you shop
  });
});

describe('shops and spending', () => {
  const shops = [
    { id: '1', date: '2026-07-27', store: 'Aldi', total: 32.4, items: [{ name: 'Milk', price: 1.45 }] },
    { id: '2', date: '2026-07-24', store: 'Tesco', total: 18.2, items: [{ name: 'Milk', price: 1.65 }] },
    { id: '3', date: '2026-06-14', store: 'Lidl', total: 44, items: [] },
  ];

  it('sums the current week only', () => {
    expect(spentInWeek(shops, TODAY)).toBe(32.4); // 24 July is the week before
    expect(spentInWeek([], TODAY)).toBe(0);
  });

  it('builds a monthly series from real trips', () => {
    const months = spendByMonth(shops, 3, TODAY);
    expect(months).toHaveLength(3);
    expect(months[months.length - 1].spend).toBe(50.6); // both July trips
    expect(months.find((m) => m.key === '2026-06').spend).toBe(44);
    expect(spendByMonth([], 3, TODAY).every((m) => m.spend === 0)).toBe(true);
    expect(spentInMonth(shops, TODAY)).toBe(50.6);
  });

  it('tracks like-for-like grocery inflation from repeated purchases', () => {
    const index = groceryInflation([
      { date: '2026-01-01', store: 'A', items: [{ name: 'Milk', price: 1 }, { name: 'Bread', price: 2 }] },
      { date: '2026-07-01', store: 'B', items: [{ name: 'Milk', price: 1.2 }, { name: 'Bread', price: 1.8 }] },
    ]);
    expect(index.items).toBe(2);
    expect(index.baseline).toBe(3);
    expect(index.current).toBe(3);
    expect(index.percent).toBe(0);
    expect(groceryInflation([]).items).toBe(0);
  });

  it('adds up savings actually recorded at checkout', () => {
    expect(savingsSummary([
      { saved: 2.5 }, { saved: 0 }, { saved: 1.25 },
    ])).toEqual({ saved: 3.75, trips: 2 });
  });

  it('counts only complete weeks that stayed inside the budget', () => {
    expect(budgetWeeks(shops, 25, TODAY)).toBe(1); // last week: £18.20
    expect(budgetWeeks(shops, 10, TODAY)).toBe(0);
    expect(budgetWeeks(shops, 0, TODAY)).toBe(0); // no budget set
  });

  it('tracks what each item has cost you', () => {
    const [milk] = priceHistory(shops);
    expect(milk.name).toBe('Milk');
    expect(milk.times).toBe(2);
    expect(milk.latest).toBe(1.45); // newest shop last
    expect(milk.change).toBeCloseTo(-0.2, 2);
    expect(milk.best).toBe(1.45);
    expect(milk.bestStore).toBe('Aldi');
  });

  it('says nothing when nothing has been recorded', () => {
    expect(priceHistory([])).toEqual([]);
  });
});

describe('plan', () => {
  it('costs a day and counts what is planned', () => {
    const plan = {
      '2026-07-27': { dinner: 'chickpea-curry', lunch: 'halloumi-grain' },
      '2026-07-28': { dinner: 'veg-chilli' },
    };
    expect(plannedMeals(plan)).toBe(3);
    expect(planCost(plan['2026-07-27'])).toBeCloseTo(1.1 + 2.0, 2);
    expect(planCost({})).toBe(0);
    expect(plannedMeals({})).toBe(0);
  });
});

describe('earned progress', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(streakFrom(['2026-07-27', '2026-07-26', '2026-07-25'], TODAY)).toBe(3);
    expect(streakFrom(['2026-07-26', '2026-07-25'], TODAY)).toBe(2); // yesterday still counts
    expect(streakFrom(['2026-07-20'], TODAY)).toBe(0);
    expect(streakFrom([], TODAY)).toBe(0);
  });

  it('derives every badge counter from real history', () => {
    const stats = kitchenStats({
      cooked: [
        { recipeId: 'chickpea-curry', date: '2026-07-27' },
        { recipeId: 'salmon-teriyaki', date: '2026-07-26' },
      ],
      log: { '2026-07-27': [{ id: 'a' }], '2026-07-26': [] },
      shops: [],
      weeklyBudget: 0,
      xp: 320,
    }, TODAY);

    expect(stats.recipesCooked).toBe(2);
    expect(stats.cuisines).toBe(2);
    expect(stats.plantMeals).toBe(1); // the curry is vegan
    expect(stats.streak).toBe(2);
    expect(stats.loggedDays).toBe(1); // the empty day doesn't count
    expect(stats.level).toBe(3);
  });

  it('starts every badge unearned for a new user', () => {
    const badges = badgeProgress(kitchenStats({}, TODAY));
    expect(badges.every((b) => !b.earned)).toBe(true);
    // Everything is zero except the level, which starts at 1 by definition.
    expect(badges.filter((b) => b.metric !== 'level').every((b) => b.progress === 0)).toBe(true);
    expect(badges.find((b) => b.metric === 'level').progress).toBe(1);
  });

  it('earns a badge once the real counter clears the bar', () => {
    const stats = kitchenStats({ cooked: [{ recipeId: 'veg-chilli', date: TODAY }] }, TODAY);
    const first = badgeProgress(stats).find((b) => b.id === 'first-cook');
    expect(first.earned).toBe(true);
  });

  it('splits cuisines by what was actually cooked', () => {
    const split = cuisineSplit([
      { recipeId: 'chickpea-curry' }, { recipeId: 'chickpea-curry' }, { recipeId: 'veg-chilli' },
    ]);
    expect(split[0]).toMatchObject({ name: 'Indian', count: 2, pct: 67 });
    expect(cuisineSplit([])).toEqual([]);
  });
});
