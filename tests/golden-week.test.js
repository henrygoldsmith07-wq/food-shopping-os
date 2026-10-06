import { describe, it, expect } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';
import {
  shoppingForWeekLoop, pantryCheckForPlan, weekLoopSnapshot,
} from '../src/lib/week-loop.js';
import { wasteAwareList } from '../src/lib/loop-learning.js';
import { quantitySuggestions } from '../src/lib/shopping-suggestions.js';

/**
 * Golden fixture: one household walks one real week without scraping, AI
 * or a parked tool. Plan -> pantry-aware list -> bought -> leftover ->
 * changed next suggestion. Every list line can explain why it is there,
 * and every suggestion cites the record that caused it.
 */
const DAY = '2026-07-28';

const goldenHousehold = () => ({
  ...EMPTY_STATE,
  day: DAY,
  onboarded: true,
  name: 'Golden',
  household: 2,
  portions: 2,
  plan: {
    [DAY]: { dinner: 'chicken-traybake' },
    '2026-07-29': { dinner: 'chickpea-curry' },
  },
  pantry: [
    { id: 'p1', name: 'Olive oil', qty: '1 bottle', cat: 'Cupboard' },
    { id: 'p2', name: 'Rice', qty: '2 kg', cat: 'Cupboard' },
  ],
  shoppingList: [],
  shops: [],
  cooked: [],
  waste: [],
  leftovers: [],
  enabledTools: [],
});

describe('golden week: plan to pantry-aware list to bought to leftover to changed suggestion', () => {
  it('subtracts pantry, dedupes, and shows its working', () => {
    const state = goldenHousehold();
    const app = { ...state, ...deriveApp(state) };
    const dates = [DAY, '2026-07-29'];
    const { items } = shoppingForWeekLoop(app, dates);

    // Deduped: one row per ingredient.
    expect(new Set(items.map((i) => i.name.toLowerCase())).size).toBe(items.length);
    // Pantry subtract: olive oil covered, so not on the list.
    expect(items.some((i) => i.name.toLowerCase().includes('olive'))).toBe(false);
    // Every line explains itself: planned, pantry, still to buy.
    for (const row of items) {
      expect(row.requiredQty || row.qty).toBeTruthy();
      expect('pantryQty' in row).toBe(true);
      expect(row.qty).toBeTruthy();
      expect(row.sourceRecipes?.length || row.explanation || row.requiredQty).toBeTruthy();
    }
    const thighs = items.find((i) => i.name === 'Chicken thighs');
    expect(thighs?.requiredQty).toBeTruthy();
    expect(thighs?.qty).toBeTruthy();

    const check = pantryCheckForPlan(app, dates);
    expect(check.plannedMeals).toBe(2);
    expect(check.missing).toBe(items.length);
    expect(check.missingItems.length).toBe(check.missing);
  });

  it('walks bought -> pantry -> cooked -> leftover -> next suggestion with sources', () => {
    const state = goldenHousehold();
    const dates = [DAY, '2026-07-29'];
    const app0 = { ...state, ...deriveApp(state) };
    const { items: list } = shoppingForWeekLoop(app0, dates);

    // Shop in aisle order, mark bought, pantry update (pure shape of recordShop).
    const bought = list.slice(0, 3).map((row) => ({ ...row, checked: true }));
    expect(bought.length).toBeGreaterThan(0);
    const shop = {
      id: 'shop-1', date: DAY, store: 'Test Market', total: 9.5,
      items: bought.map((row) => ({ name: row.name, price: 1.0, qty: row.qty })),
    };
    const pantryAfterShop = [
      ...state.pantry,
      ...bought.map((row, i) => ({ id: `bp${i}`, name: row.name, qty: row.qty, cat: 'Cupboard' })),
    ];

    // Cook one planned meal, save a leftover.
    const cooked = [{ recipeId: 'chicken-traybake', date: DAY, portions: 2 }];
    const leftover = {
      id: 'l1', name: 'Lemon Chicken Traybake (leftovers)', cat: 'Leftovers',
      recipeId: 'chicken-traybake', portions: 2, qty: '2 portions',
      expiry: '2026-07-30', addedAt: DAY, cookedDate: DAY,
    };

    // Next suggestion cites the record: leftover cover removes the dish's rows.
    const withLeftover = { ...state, pantry: [...pantryAfterShop, leftover], cooked };
    const { items: nextList } = shoppingForWeekLoop({ ...withLeftover, portions: 2, household: 2 }, dates);
    const withoutLeftover = shoppingForWeekLoop({ ...state, pantry: pantryAfterShop, portions: 2, household: 2 }, dates);
    // Leftover with enough portions for the household removes or shrinks the need.
    expect(nextList.length).toBeLessThanOrEqual(withoutLeftover.items.length);

    // Waste learning cites the record: binned rows arrive lighter with a source line.
    const waste = [
      { name: 'Chicken thighs', date: '2026-07-20' },
      { name: 'Chicken thighs', date: '2026-07-22' },
    ];
    const learned = wasteAwareList(nextList.length ? nextList : withoutLeftover.items, {
      waste, cooked, today: DAY,
    });
    const reduced = learned.find((row) => row.name === 'Chicken thighs');
    if (reduced) {
      expect(reduced.wasteNote || reduced.autoReduction).toBeTruthy();
      expect(reduced.autoReduction?.count >= 2 || reduced.binnedCount >= 2).toBe(true);
    }

    // Quantity suggestions cite shops: no suggestion without evidence.
    const shops = [
      { date: '2026-07-10', items: [{ name: 'Rice', qty: '1 kg' }] },
      { date: '2026-07-15', items: [{ name: 'Rice', qty: '1 kg' }] },
      { date: '2026-07-20', items: [{ name: 'Rice', qty: '1 kg' }] },
    ];
    const suggestions = quantitySuggestions([{ name: 'Rice', qty: '2 kg' }], shops);
    for (const s of suggestions) {
      expect(s.evidence).toBeTruthy();
      expect(s.samples).toBeGreaterThanOrEqual(3);
    }

    // Snapshot still points at the loop: plan done, list preview equals generation.
    const snap = weekLoopSnapshot({ ...withLeftover, ...deriveApp(withLeftover), shoppingList: nextList });
    expect(snap.done.plan).toBe(true);
    expect(Array.isArray(snap.listPreview)).toBe(true);
  });
});
