import { describe, expect, it } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { diaryActions } from '../src/lib/diary-actions.js';
import { planActions } from '../src/lib/plan-actions.js';
import { pantryFlowActions } from '../src/lib/pantry-flow-actions.js';
import {
  defaultLeftoverPortions, loopHealth, wasteAwareList,
} from '../src/lib/loop-learning.js';
import { withAutoListSync } from '../src/lib/week-loop.js';
import { RECIPES } from '../src/data/recipes.js';

const TODAY = '2026-08-03'; // a Monday
const daysAgo = (n) => {
  const d = new Date(`${TODAY}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** The same `set` contract the real store uses, without React. */
const makeStore = (initial = {}) => {
  let state = { ...EMPTY_STATE, day: TODAY, ...initial };
  const set = (patch) => {
    const changes = typeof patch === 'function' ? patch(state) : patch;
    if (changes && Object.keys(changes).length) state = { ...state, ...changes };
  };
  return { set, get: () => state };
};

describe('the automatic cook step', () => {
  const recipe = RECIPES.find((r) => r.servings >= 3);

  it('saves leftovers, logs the meal and marks the planned slot in one write', () => {
    const store = makeStore({ plan: { [TODAY]: { dinner: recipe.id } } });
    const { completeRecipe } = diaryActions(store.set);
    completeRecipe(recipe, { leftovers: 2, actualMins: 35 });
    const s = store.get();

    expect(s.cooked).toEqual([{ recipeId: recipe.id, date: TODAY }]);
    expect(s.mealPlanEvents).toHaveLength(1);
    expect(s.mealPlanEvents[0]).toMatchObject({ date: TODAY, slot: 'dinner', status: 'cooked' });

    const saved = s.pantry.find((p) => p.recipeId === recipe.id);
    expect(saved).toBeTruthy();
    expect(saved.cat).toBe('Leftovers');
    expect(saved.portions).toBe(2);
    expect(saved.expiry).toBeTruthy();
  });

  it('keeps the leftover row correctable without a second manual flow', () => {
    const store = makeStore();
    const { completeRecipe } = diaryActions(store.set);
    const { setLeftoverPortions } = planActions(store.set);
    completeRecipe(recipe, { leftovers: 2 });

    setLeftoverPortions(recipe, 1);
    expect(store.get().pantry.find((p) => p.recipeId === recipe.id).portions).toBe(1);

    setLeftoverPortions(recipe, 0);
    expect(store.get().pantry.find((p) => p.recipeId === recipe.id)).toBeUndefined();

    // and can add one back after cooking saved none
    setLeftoverPortions(recipe, 2);
    expect(store.get().pantry.find((p) => p.recipeId === recipe.id).portions).toBe(2);
  });

  it('respects a household that turned pantry automation off', () => {
    const store = makeStore({ autoUsePantry: false, pantry: [{ id: 'p1', name: 'Rice', qty: '500 g' }] });
    const { completeRecipe } = diaryActions(store.set);
    completeRecipe(recipe, { leftovers: 1 });
    expect(store.get().pantry.find((p) => p.id === 'p1')).toBeTruthy(); // untouched
  });
});

describe('the learning that reaches the shopping list', () => {
  const waste = [
    { name: 'Avocado', cost: 1.2, date: daysAgo(4) },
    { name: 'Avocado', cost: 1.1, date: daysAgo(12) },
    { name: 'Spinach', cost: 2, date: daysAgo(40) }, // outside the window
  ];

  it('buys one fewer of what the household keeps binning, and says why', () => {
    const [row] = wasteAwareList([{ name: 'Avocado', qty: '3' }], { waste, today: TODAY });
    expect(row.qty).toBe('2');
    expect(row.wasteNote).toMatch(/Binned 2×/);
    expect(row.binnedCount).toBe(2);
  });

  it('annotates without inventing amounts', () => {
    const [single] = wasteAwareList([{ name: 'Avocado', qty: '1' }], { waste, today: TODAY });
    expect(single.qty).toBe('1');
    expect(single.wasteNote).toMatch(/buying less/);

    const [grams] = wasteAwareList([{ name: 'Avocado', qty: '400 g' }], { waste, today: TODAY });
    expect(grams.qty).toBe('400 g');
    expect(grams.wasteNote).toBeTruthy();
  });

  it('leaves untouched what has not been binned repeatedly', () => {
    const rows = wasteAwareList(
      [{ name: 'Milk', qty: '2 pints' }, { name: 'Spinach', qty: '2 bags' }],
      { waste, today: TODAY },
    );
    expect(rows[0]).not.toHaveProperty('wasteNote');
    expect(rows[0].qty).toBe('2 pints');
    expect(rows[1]).not.toHaveProperty('wasteNote'); // binned once, 40 days ago
  });

  it('defaults the leftover save to what the dish made minus who is eating', () => {
    expect(defaultLeftoverPortions({ servings: 4 }, 2)).toBe(2);
    expect(defaultLeftoverPortions({ servings: 2 }, 2)).toBe(0);
    expect(defaultLeftoverPortions(null, 2)).toBe(0);
  });
});

describe('the drift guard that keeps a month honest', () => {
  it('a quiet kitchen has nothing to report', () => {
    expect(loopHealth({ ...EMPTY_STATE, day: TODAY }).issues).toEqual([]);
  });

  it('says when cooking stopped updating the pantry, and offers the fix', () => {
    const state = {
      day: TODAY,
      autoUsePantry: false,
      cooked: [{ recipeId: 'r1', date: daysAgo(1) }, { recipeId: 'r2', date: daysAgo(2) }],
      pantry: [{ id: 'p1', name: 'Rice' }],
    };
    const { issues } = loopHealth(state, TODAY);
    const issue = issues.find((i) => i.id === 'pantry-use-off');
    expect(issue.fix).toMatchObject({ kind: 'enable-pantry-use' });
    expect(issue.detail).toMatch(/2 cooked meals/);
  });

  it('catches leftovers expiring unseen and bins them into waste', () => {
    const expired = { id: 'p1', cat: 'Leftovers', recipeId: 'r1', name: 'Chilli (leftovers)', portions: 2, qty: '2 portions', expiry: daysAgo(1), addedAt: daysAgo(4) };
    const fresh = { id: 'p2', cat: 'Leftovers', recipeId: 'r2', name: 'Curry (leftovers)', portions: 1, qty: '1 portion', expiry: daysAgo(-1), addedAt: TODAY };
    const state = { day: TODAY, pantry: [expired, fresh] };

    const { issues } = loopHealth(state, TODAY);
    expect(issues.find((i) => i.id === 'expired-leftovers').fix.kind).toBe('bin-expired-leftovers');

    const store = makeStore({ pantry: [expired, fresh], waste: [] });
    pantryFlowActions(store.set).clearExpiredLeftovers();
    const s = store.get();
    expect(s.pantry.map((p) => p.id)).toEqual(['p2']);
    expect(s.waste).toHaveLength(1);
    expect(s.waste[0]).toMatchObject({ name: 'Chilli', reason: 'expired' });
  });

  it('spots shops that never reached the pantry and finishes the job', () => {
    const shop = { id: 'h1', date: daysAgo(2), store: 'Aldi', total: 4.3, items: [{ name: 'Semi-skimmed milk', price: 1.15, qty: '2 pints' }] };
    const state = { day: TODAY, shops: [shop], pantry: [] };
    const { issues } = loopHealth(state, TODAY);
    const issue = issues.find((i) => i.id === 'unreconciled-shops');
    expect(issue.fix.shopIds).toEqual(['h1']);

    const store = makeStore({ shops: [shop], pantry: [] });
    pantryFlowActions(store.set).reconcileShopToPantry('h1');
    const s = store.get();
    expect(s.shops[0].pantryReconciled).toBe(true);
    expect(s.pantry.some((p) => /milk/i.test(p.name))).toBe(true);
    // idempotent: a second pass changes nothing
    pantryFlowActions(store.set).reconcileShopToPantry('h1');
    expect(s.pantry.length).toBe(store.get().pantry.length);
  });

  it('knows a reconciled shop is nothing to report', () => {
    const shop = { id: 'h1', date: daysAgo(1), store: 'Aldi', items: [{ name: 'Milk' }], pantryReconciled: true };
    const { issues } = loopHealth({ day: TODAY, shops: [shop], pantryEvents: [] }, TODAY);
    expect(issues.find((i) => i.id === 'unreconciled-shops')).toBeUndefined();
  });

  it('asks about past meals with no recorded outcome instead of guessing', () => {
    const state = {
      day: TODAY,
      plan: {
        [daysAgo(2)]: { dinner: 'r1' },
        [daysAgo(1)]: { dinner: 'r2' },
        [TODAY]: { dinner: 'r3' },
      },
      cooked: [{ recipeId: 'r2', date: daysAgo(1) }],
      mealPlanEvents: [],
    };
    const { issues } = loopHealth(state, TODAY);
    const issue = issues.find((i) => i.id === 'unmarked-meals');
    expect(issue.detail).toMatch(/^1 planned meal/); // r1 only — r2 has a cooked row
  });
});

describe('plan edits rewrite the list by themselves', () => {
  const recipe = RECIPES.find((r) => (r.ingredients || []).length >= 2);
  const autoRow = (name, qty, over = {}) => ({
    id: `s-${name}`, name, qty, fromRecipe: recipe.name, checked: false,
    lastAutoQty: qty, price: 0, ...over,
  });

  it('dropping a dish removes its unchecked rows in the same write, and nothing else', () => {
    const state = {
      ...EMPTY_STATE,
      day: TODAY,
      portions: 2,
      plan: { [daysAgo(-1)]: { dinner: recipe.id } },
      shoppingList: [
        autoRow('Rice', '500 g'),
        autoRow('Checked milk', '2 pints', { checked: true }),
        { id: 's-manual', name: 'Batteries', qty: '', checked: false }, // not from a recipe
      ],
    };
    const changes = withAutoListSync(state, { plan: {} });
    expect(changes.shoppingList.map((r) => r.name)).toEqual(['Checked milk', 'Batteries']);
  });

  it('adding a dish brings its missing ingredients in the same write, once the list follows the plan', () => {
    const state = {
      ...EMPTY_STATE,
      day: TODAY,
      portions: 2,
      plan: {},
      shoppingList: [autoRow('Existing rice', '500 g')],
    };
    const changes = withAutoListSync(state, { plan: { [daysAgo(-1)]: { dinner: recipe.id } } });
    const rows = changes.shoppingList.filter((r) => r.autoListed);
    expect(rows.length).toBeGreaterThanOrEqual(recipe.ingredients.length);
    expect(rows.every((r) => r.fromRecipe === recipe.name && r.checked === false)).toBe(true);
    // …and the row the household already had stays exactly as it was.
    expect(changes.shoppingList[0]).toMatchObject({ name: 'Existing rice', qty: '500 g' });
    expect(changes.shoppingList[0]).not.toHaveProperty('autoListed');
  });

  it('a stray plan write never conjures a list for a household without a plan-driven one', () => {
    const state = {
      ...EMPTY_STATE,
      day: TODAY,
      portions: 2,
      plan: {},
      shoppingList: [{ id: 's1', name: 'Bread', qty: '1 loaf', checked: false }],
    };
    expect(withAutoListSync(state, { plan: { [daysAgo(-1)]: { dinner: recipe.id } } })).toEqual({
      plan: { [daysAgo(-1)]: { dinner: recipe.id } },
    });
  });

  it('writes the loop never touches leave the list completely alone', () => {
    const changes = { theme: 'dark', log: { [TODAY]: [] } };
    expect(withAutoListSync({ ...EMPTY_STATE, day: TODAY }, changes)).toBe(changes);
  });
});
