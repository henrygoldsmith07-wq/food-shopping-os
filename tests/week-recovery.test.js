import { describe, expect, it } from 'vitest';
import { plannedUsesOf, recoverWeek, recoveryChanged, remainingWeekDates } from '../src/lib/week-recovery.js';

const catalogue = [
  { id: 'curry', name: 'Chickpea curry', ingredients: [{ name: 'Chickpeas' }, { name: 'Rice' }] },
  { id: 'pasta', name: 'Tomato pasta', ingredients: [{ name: 'Pasta' }, { name: 'Tomatoes' }] },
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

  it('repairs a skipped meal by reusing expiring food first', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'curry' },
      catalogue,
    });
    expect(recoveryChanged(result)).toBe(true);
    expect(result.repairs[0].kind).toMatch(/use-expiring|reuse-leftover|slot-freed/);
    expect(result.expiryPriority[0].name).toBe('Rice');
  });

  it('adds a wasted ingredient back when future meals need it', () => {
    const result = recoverWeek(baseState, {
      today: '2026-09-01',
      trigger: { kind: 'IngredientWasted', ingredient: 'Pasta' },
      catalogue,
    });
    expect(result.shoppingAdd.some((r) => r.name === 'Pasta')).toBe(true);
    expect(result.explanations.join(' ')).toMatch(/Pasta/);
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
  });

  it('flags a budget overrun honestly', () => {
    const result = recoverWeek(
      { ...baseState, weeklyBudget: 5, spentThisWeek: 4.9 },
      { today: '2026-09-01', trigger: { kind: 'IngredientWasted', ingredient: 'Pasta' }, catalogue },
    );
    expect(result.budgetNote.over).toBe(true);
  });

  it('finds planned uses of an ingredient', () => {
    const uses = plannedUsesOf(baseState.plan, { curry: catalogue[0], pasta: catalogue[1] }, 'pasta', ['2026-09-01', '2026-09-02']);
    expect(uses).toHaveLength(1);
    expect(uses[0].recipeId).toBe('pasta');
  });
});
