import { describe, expect, it } from 'vitest';
import {
  applyWeekRecoveryTo, foldSkipReflection,
} from '../src/lib/store-commands.js';
import {
  bestPantrySwap, inferWeekRecoveryTrigger, inferWeekRecoveryTriggers, pantryCoverageOf,
  plannedUsesOf, recoverWeek, recoveryChanged, remainingWeekDates,
} from '../src/lib/week-recovery.js';

const catalogue = [
  { id: 'curry', name: 'Chickpea curry', cuisine: 'indian', ingredients: [{ name: 'Chickpeas' }, { name: 'Rice' }] },
  { id: 'pasta', name: 'Tomato pasta', cuisine: 'italian', ingredients: [{ name: 'Pasta' }, { name: 'Tomatoes' }] },
  { id: 'rice-beans', name: 'Rice and beans', cuisine: 'indian', time: 20, ingredients: [{ name: 'Rice' }, { name: 'Beans' }] },
];

const baseState = {
  day: '2026-09-01',
  plan: {
    '2026-09-01': { dinner: 'curry' },
    '2026-09-02': { dinner: 'pasta' },
    '2026-09-03': { dinner: 'curry' },
  },
  pantry: [
    { id: 'p1', name: 'Rice', expiry: '2026-09-02' },
    { id: 'p2', name: 'Chickpeas', expiry: null },
    { id: 'p3', name: 'Beans', expiry: null },
  ],
  leftovers: [],
  shoppingList: [{ id: 's1', name: 'Tomatoes', price: 1.2, qty: 1 }],
  shops: [],
  weeklyBudget: 60,
  spentThisWeek: 10,
};

describe('week recovery engine', () => {
  it('lists remaining week dates from today', () => {
    const dates = remainingWeekDates('2026-09-01');
    expect(dates[0]).toBe('2026-09-01');
    expect(dates.length).toBeGreaterThanOrEqual(1);
    expect(dates.every((d) => d >= '2026-09-01')).toBe(true);
  });

  it('is a no-op with a calm explanation when nothing changed', () => {
    const result = recoverWeek(baseState, { today: '2026-09-01', catalogue });
    expect(result.repairs).toEqual([]);
    expect(result.explanations.join(' ')).toMatch(/still line up/i);
    expect(recoveryChanged(result)).toBe(false);
  });

  it('repairs a skipped meal with the least disruptive option first', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
      catalogue,
    });
    expect(recoveryChanged(result)).toBe(true);
    // The pantry fully covers rice-and-beans → a pantry swap (disruption 1)
    // beats freeing the slot, and rice expiring tomorrow makes it the pick.
    expect(result.repairs[0].kind).toBe('pantry-swap');
    expect(result.planPatch['2026-09-01'].dinner).toBe('rice-beans');
    expect(result.expiryPriority[0].name).toBe('Rice');
  });

  it('fills the slot with an urgent leftover when one exists', () => {
    const state = {
      ...baseState,
      leftovers: [{ id: 'l1', name: 'Curry portions', expiry: '2026-09-02', portions: 1 }],
    };
    const result = recoverWeek(state, {
      today: '2026-09-01',
      trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
      catalogue,
    });
    expect(result.repairs[0].kind).toBe('reuse-leftover');
    expect(result.repairs[0].disruption).toBe(0);
    expect(result.leftoverReuse[0]).toMatchObject({ leftoverId: 'l1', date: '2026-09-01', slot: 'dinner' });
    // The freed slot is cleared in the patch — no invented recipe.
    expect(result.planPatch['2026-09-01'].dinner).toBeNull();
  });

  it('finds skipped slots on its own when no trigger is given', () => {
    const state = {
      ...baseState,
      mealPlanEvents: [{ id: 'm1', date: '2026-09-02', slot: 'dinner', status: 'skipped', reason: 'no-time' }],
    };
    const result = recoverWeek(state, { today: '2026-09-01', catalogue });
    expect(recoveryChanged(result)).toBe(true);
    expect(result.repairs.some((r) => r.date === '2026-09-02')).toBe(true);
    const repair = result.repairs.find((r) => r.date === '2026-09-02');
    expect(['reuse-leftover', 'pantry-swap', 'slot-freed']).toContain(repair.kind);
  });

  it('adds a wasted ingredient back when future meals need it and no swap exists', () => {
    const result = recoverWeek(
      { ...baseState, pantry: baseState.pantry.filter((p) => p.name !== 'Beans') },
      { today: '2026-09-01', trigger: { kind: 'IngredientWasted', ingredient: 'Pasta' }, catalogue: [{ ...catalogue[1] }] },
    );
    expect(result.shoppingAdd.some((r) => /pasta/i.test(r.name))).toBe(true);
    expect(result.explanations.join(' ')).toMatch(/Pasta/);
  });

  it('swaps a broken meal to a pantry-covered recipe instead of shopping', () => {
    // Rice is wasted; curry on 2026-09-03 loses its rice. The pantry still
    // covers rice-and-beans… also rice — so with rice gone the only fully
    // covered recipe is none → buy. Use a fresh pantry to force the swap path.
    const state = {
      ...baseState,
      plan: { '2026-09-03': { dinner: 'curry' } },
      pantry: [
        { id: 'p1', name: 'Rice', expiry: '2026-09-05' },
        { id: 'p3', name: 'Beans', expiry: null },
      ],
      shoppingList: [],
    };
    const result = recoverWeek(state, {
      today: '2026-09-01',
      trigger: { kind: 'IngredientWasted', ingredient: 'Chickpeas' },
      catalogue,
    });
    const repair = result.repairs[0];
    expect(repair.kind).toBe('pantry-swap');
    expect(repair.recipeId).toBe('rice-beans');
    expect(result.shoppingAdd).toEqual([]);
  });

  it('leaves the list alone when a wasted ingredient breaks nothing', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'IngredientWasted', ingredient: 'Chocolate' },
      catalogue,
    });
    expect(result.shoppingAdd).toEqual([]);
    expect(result.explanations.join(' ')).toMatch(/no remaining planned meal/i);
  });

  it('offers a saved leftover against the next open slot', () => {
    const result = recoverWeek(
      { ...baseState, plan: { '2026-09-01': { dinner: 'curry' } } },
      { today: '2026-09-01', trigger: { kind: 'LeftoverCreated', name: 'Curry portions' }, catalogue },
    );
    expect(result.leftoverReuse.length).toBeGreaterThan(0);
    expect(result.leftoverReuse[0].date).toBe('2026-09-02'); // the soonest open slot
  });

  it('links the leftover row when the portion exists, and still allocates when it does not', () => {
    const withRow = recoverWeek(
      {
        ...baseState,
        plan: { '2026-09-01': { dinner: 'curry' } },
        leftovers: [{ id: 'l1', name: 'Curry portions', expiry: '2026-09-04', portions: 1 }],
      },
      { today: '2026-09-01', trigger: { kind: 'LeftoverCreated', name: 'Curry portions' }, catalogue },
    );
    expect(withRow.leftoverReuse[0]).toMatchObject({ leftoverId: 'l1', date: '2026-09-02', slot: 'dinner' });
    // No row yet (the event arrived first): allocation still happens by name.
    const rowless = recoverWeek(
      { ...baseState, plan: { '2026-09-01': { dinner: 'curry' } }, leftovers: [] },
      { today: '2026-09-01', trigger: { kind: 'LeftoverCreated', name: 'Curry portions' }, catalogue },
    );
    expect(rowless.leftoverReuse).toEqual([{ date: '2026-09-02', slot: 'dinner', name: 'Curry portions' }]);
  });

  it('an unplanned shop clears the rows it already covered', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'UnplannedShop', items: ['Tomatoes', 'Milk'] },
      catalogue,
    });
    expect(result.shoppingRemove.map((r) => r.name)).toEqual(['Tomatoes']);
    expect(result.explanations.join(' ')).toMatch(/unplanned shop/i);
  });

  it('a cooked substitution retires the swapped-out rows', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: {
        kind: 'MealCooked', substituted: true, plannedRecipeId: 'pasta',
        substitutionIngredients: ['Pasta', 'Passata'],
      },
      catalogue,
    });
    expect(result.shoppingRemove.some((r) => r.name === 'Tomatoes')).toBe(true);
  });

  it('flags a budget overrun honestly, and counts removal savings', () => {
    const over = recoverWeek(
      { ...baseState, weeklyBudget: 5, spentThisWeek: 4.9 },
      { today: '2026-09-01', trigger: { kind: 'IngredientWasted', ingredient: 'Pasta' }, catalogue: [{ ...catalogue[1] }] },
    );
    expect(over.budgetNote.over).toBe(true);

    const saving = recoverWeek(
      { ...baseState, weeklyBudget: 60, spentThisWeek: 10 },
      { today: '2026-09-01', trigger: { kind: 'UnplannedShop', items: ['Tomatoes'] }, catalogue },
    );
    expect(saving.budgetNote.removalSavings).toBeCloseTo(1.2, 2);
    expect(saving.explanations.join(' ')).toMatch(/save/i);
  });

  it('ranks repairs least-disruptive first and reports the max disruption', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
      catalogue,
    });
    expect(result.repairs.map((r) => r.disruption)).toEqual([...result.repairs.map((r) => r.disruption)].sort((a, b) => a - b));
    expect(result.disruption).toBeLessThanOrEqual(3);
  });

  it('finds planned uses of an ingredient', () => {
    const uses = plannedUsesOf(baseState.plan, { curry: catalogue[0], pasta: catalogue[1] }, 'pasta', ['2026-09-01', '2026-09-02']);
    expect(uses).toHaveLength(1);
    expect(uses[0].recipeId).toBe('pasta');
  });
});

describe('week recovery candidates', () => {
  it('infers the newest unresolved trigger from the ledger', () => {
    const state = {
      ...baseState,
      householdLedger: [
        { id: 'e1', type: 'MealSkipped', at: '2026-09-01T10:00:00.000Z', day: '2026-09-01', origin: 'user', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
        { id: 'e2', type: 'WeekRecovered', at: '2026-09-01T11:00:00.000Z', day: '2026-09-01', origin: 'recovery' },
        { id: 'e3', type: 'IngredientWasted', at: '2026-09-01T12:00:00.000Z', day: '2026-09-01', origin: 'user', name: 'Pasta' },
      ],
    };
    expect(inferWeekRecoveryTrigger(state, catalogue)).toMatchObject({
      kind: 'IngredientWasted', ingredient: 'Pasta',
    });
  });

  it('returns every unresolved trigger since the last recovery, oldest first', () => {
    const state = {
      ...baseState,
      householdLedger: [
        { id: 'e0', type: 'MealSkipped', at: '2026-08-31T10:00:00.000Z', day: '2026-08-31', origin: 'user', date: '2026-08-31', slot: 'dinner', recipeId: 'curry' },
        { id: 'e1', type: 'WeekRecovered', at: '2026-09-01T09:00:00.000Z', day: '2026-09-01', origin: 'recovery' },
        { id: 'e2', type: 'MealSkipped', at: '2026-09-01T10:00:00.000Z', day: '2026-09-01', origin: 'user', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
        { id: 'e3', type: 'IngredientWasted', at: '2026-09-01T11:00:00.000Z', day: '2026-09-01', origin: 'user', name: 'Pasta' },
        { id: 'e4', type: 'LeftoverCreated', at: '2026-09-01T12:00:00.000Z', day: '2026-09-01', origin: 'user', name: 'Curry portions' },
      ],
    };
    const triggers = inferWeekRecoveryTriggers(state, catalogue);
    expect(triggers.map((t) => t.kind)).toEqual(['MealSkipped', 'IngredientWasted', 'LeftoverCreated']);
    // e0 is answered by the WeekRecovered at e1 — never re-processed.
    expect(triggers.some((t) => t.id === 'e0')).toBe(false);
    // The single-trigger view is the newest of them.
    expect(inferWeekRecoveryTrigger(state, catalogue)).toMatchObject({ kind: 'LeftoverCreated' });
  });

  it('recovers from every unresolved trigger in one pass, without double-repairing a slot', () => {
    const state = {
      ...baseState,
      plan: { '2026-09-02': { dinner: 'pasta' } },
      shoppingList: [],
      householdLedger: [
        { id: 'e2', type: 'MealSkipped', at: '2026-09-01T10:00:00.000Z', day: '2026-09-01', origin: 'user', date: '2026-09-02', slot: 'dinner', recipeId: 'pasta' },
        { id: 'e3', type: 'IngredientWasted', at: '2026-09-01T11:00:00.000Z', day: '2026-09-01', origin: 'user', name: 'Chickpeas' },
      ],
    };
    const result = recoverWeek(state, {
      today: '2026-09-01',
      triggers: inferWeekRecoveryTriggers(state, catalogue),
      catalogue,
    });
    // The skipped pasta slot is repaired once — not once per trigger.
    const slotRepairs = result.repairs.filter((r) => r.date === '2026-09-02' && r.slot === 'dinner');
    expect(slotRepairs).toHaveLength(1);
    // Both problems were heard: the plan moved AND the explanations name both.
    expect(result.explanations.join(' ')).toMatch(/Chickpeas/);
    expect(Object.keys(result.planPatch).length).toBeGreaterThan(0);
  });

  it('stops once a recovery has answered the latest trigger', () => {
    const state = {
      ...baseState,
      householdLedger: [
        { id: 'e1', type: 'MealSkipped', at: '2026-09-01T10:00:00.000Z', day: '2026-09-01', origin: 'user', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
        { id: 'e2', type: 'WeekRecovered', at: '2026-09-01T11:00:00.000Z', day: '2026-09-01', origin: 'recovery' },
      ],
    };
    expect(inferWeekRecoveryTrigger(state, catalogue)).toBeNull();
  });

  it('maps a substituted cooked meal to the ingredients actually used', () => {
    const state = {
      ...baseState,
      householdLedger: [{
        id: 'e1', type: 'MealCooked', at: '2026-09-01T10:00:00.000Z', day: '2026-09-01', origin: 'user',
        date: '2026-09-01', slot: 'dinner', plannedRecipeId: 'pasta', recipeId: 'curry', substituted: true,
      }],
    };
    expect(inferWeekRecoveryTrigger(state, catalogue)).toMatchObject({
      kind: 'MealCooked', plannedRecipeId: 'pasta', substitutionIngredients: ['chickpeas', 'rice'],
    });
  });

  it('uses legacy arrays when no ledger exists', () => {
    const state = {
      ...baseState,
      mealPlanEvents: [{ id: 'm1', date: '2026-09-02', slot: 'dinner', status: 'skipped', plannedRecipeId: 'pasta' }],
    };
    expect(inferWeekRecoveryTrigger(state, catalogue)).toMatchObject({
      kind: 'MealSkipped', date: '2026-09-02', slot: 'dinner', recipeId: 'pasta',
    });
  });

  it('coverage counts what the pantry already has', () => {
    const names = new Set(['rice', 'chickpeas']);
    expect(pantryCoverageOf(catalogue[0], names)).toMatchObject({ have: 2, total: 2, pct: 100, missing: [] });
    expect(pantryCoverageOf(catalogue[1], names).missing.map((m) => m.name || m)).toEqual(['Pasta', 'Tomatoes']);
  });

  it('coverage is quantity-aware: a name match with not enough is missing', () => {
    const recipe = {
      id: 'big-rice', name: 'Big rice', ingredients: [{ name: 'Rice', qty: '500 g' }],
    };
    const pantryNames = new Set(['rice']);
    // 200 g in the pantry does not cover 500 g the recipe asks for.
    const short = pantryCoverageOf(recipe, pantryNames, {
      pantry: [{ id: 'p1', name: 'Rice', qty: '200 g' }],
      today: '2026-09-01',
    });
    expect(short.have).toBe(0);
    expect(short.missing[0]).toMatchObject({ name: 'Rice', shortOf: '500 g' });
    // 750 g does cover it.
    const enough = pantryCoverageOf(recipe, pantryNames, {
      pantry: [{ id: 'p1', name: 'Rice', qty: '750 g' }],
      today: '2026-09-01',
    });
    expect(enough.have).toBe(1);
    // No readable quantity on either side → name-level truth, no invention.
    const nameOnly = pantryCoverageOf(catalogue[0], new Set(['rice', 'chickpeas']));
    expect(nameOnly.pct).toBe(100);
  });

  it('a pantry swap only picks recipes the pantry covers in quantity', () => {
    const needsLots = { id: 'hefty', name: 'Hefty beans', ingredients: [{ name: 'Beans', qty: '800 g' }] };
    const catalogue2 = [needsLots, catalogue[2]];
    const pick = bestPantrySwap({
      catalogue: catalogue2,
      pantryNames: new Set(['rice', 'beans']),
      expiringNames: new Set(),
      wasRecipe: null,
      // Pantry holds 300 g of beans — not the 800 g the hefty recipe wants.
      pantry: [{ id: 'p1', name: 'Rice' }, { id: 'p3', name: 'Beans', qty: '300 g' }],
      today: '2026-09-01',
    });
    expect(pick.recipe.id).toBe('rice-beans');
  });

  it('the best swap is fully covered, deterministic and prefers expiring use', () => {
    const pantryNames = new Set(['rice', 'beans']);
    const expiring = new Set(['rice']);
    const pick = bestPantrySwap({ catalogue, pantryNames, expiringNames: expiring, wasRecipe: catalogue[0] });
    expect(pick.recipe.id).toBe('rice-beans');
    // Same inputs, same answer.
    const again = bestPantrySwap({ catalogue, pantryNames, expiringNames: expiring, wasRecipe: catalogue[0] });
    expect(again.recipe.id).toBe(pick.recipe.id);
  });

  it('no swap exists when nothing is fully covered', () => {
    expect(bestPantrySwap({ catalogue, pantryNames: new Set(['milk']), expiringNames: new Set(), wasRecipe: null })).toBeNull();
  });
});

describe('applyWeekRecovery command', () => {
  it('applies the whole preview as one state write with one WeekRecovered event', () => {
    const result = recoverWeek(
      { ...baseState, leftovers: [{ id: 'l1', name: 'Curry portions', expiry: '2026-09-02', portions: 1 }] },
      { today: '2026-09-01', trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' }, catalogue },
    );
    const applied = applyWeekRecoveryTo({ ...baseState, leftovers: [{ id: 'l1', name: 'Curry portions', expiry: '2026-09-02', portions: 1 }], householdLedger: [] }, result);
    const event = applied.householdLedger.at(-1);
    expect(event.type).toBe('WeekRecovered');
    expect(event.origin).toBe('recovery');
    expect(event.trigger.kind).toBe('MealSkipped');
    // Leftover allocated to the suggested slot.
    expect(applied.leftovers.find((l) => l.id === 'l1').allocatedTo).toEqual({
      date: '2026-09-01', slot: 'dinner', from: 'week-recovery',
    });
    // A pantry-row leftover is earmarked through plannedMealAllocations.
    const pantryApplied = applyWeekRecoveryTo({
      ...baseState,
      pantry: [...baseState.pantry, { id: 'pl1', name: 'Curry portions', cat: 'Leftovers', expiry: '2026-09-02', portions: 1, plannedMealAllocations: [] }],
      householdLedger: [],
    }, recoverWeek({
      ...baseState,
      pantry: [...baseState.pantry, { id: 'pl1', name: 'Curry portions', cat: 'Leftovers', expiry: '2026-09-02', portions: 1 }],
    }, { today: '2026-09-01', trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' }, catalogue }));
    expect(pantryApplied.pantry.find((p) => p.id === 'pl1').plannedMealAllocations).toEqual([
      { date: '2026-09-01', slot: 'dinner', from: 'week-recovery' },
    ]);
    // The skipped slot was freed and its now-empty day was removed.
    expect(applied.plan['2026-09-01']).toBeUndefined();
  });

  it('adds and removes list rows in the same write, skipping duplicates', () => {
    const preview = {
      trigger: { kind: 'IngredientWasted' },
      repairs: [],
      planPatch: {},
      shoppingAdd: [{ name: 'Pasta', reason: 'Needed', qty: 1 }, { name: 'Tomatoes', reason: 'Needed', qty: 1 }],
      shoppingRemove: [{ id: 's1', name: 'Tomatoes' }],
      leftoverReuse: [],
      budgetNote: null,
      expiryPriority: [],
      explanations: [],
    };
    const applied = applyWeekRecoveryTo({ ...baseState, householdLedger: [] }, preview);
    // Tomatoes removed first, then the add dedupes against the surviving list.
    const names = applied.shoppingList.map((r) => r.name);
    expect(names).toContain('Pasta');
    expect(names.filter((n) => n === 'Tomatoes')).toHaveLength(1);
    const event = applied.householdLedger.at(-1);
    expect(event.addedToList).toEqual(['Pasta', 'Tomatoes']);
    expect(event.removedFromList).toEqual(['Tomatoes']);
  });

  it('a no-op preview writes nothing and logs nothing', () => {
    const preview = { trigger: { kind: 'Check' }, repairs: [], planPatch: {}, shoppingAdd: [], shoppingRemove: [], leftoverReuse: [], budgetNote: null, explanations: [] };
    const state = { ...baseState, householdLedger: [] };
    const applied = applyWeekRecoveryTo(state, preview);
    expect(applied.householdLedger).toEqual([]);
    expect(applied).not.toBe(state); // pure: a new object, same content
    expect(applied.plan).toEqual(state.plan);
  });
});

describe('reflectSkipReason command', () => {
  it('folds a reflection exactly as the planner expects', () => {
    let profile = foldSkipReflection({}, 'no-time', true, 10);
    profile = foldSkipReflection(profile, 'no-time', true, 20);
    expect(profile['no-time']).toEqual({ applies: 2, changed: 0, lastStillApplies: true, lastAt: 20 });
    expect(profile['no-time'].applies).toBe(2);
  });
});
