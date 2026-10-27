import { describe, expect, it } from 'vitest';
import { applyShopCheck, shopChecks, SHOP_CHECK_LIMIT } from '../src/lib/shop-checks.js';

const TODAY = '2026-10-27';
const row = (id, name, qty, extra = {}) => ({ id, name, qty, checked: false, ...extra });
const stock = (id, name, qty, extra = {}) => ({
  id, name, qty, confidence: 'definite', lastConfirmedAt: TODAY, ...extra,
});

describe('which list rows need a look in the cupboard', () => {
  it('asks when the pantry amount cannot be weighed against the need', () => {
    const checks = shopChecks(
      [row('l1', 'Couscous', '300 g', { requiredQty: '300 g' })],
      [stock('p1', 'Couscous', '1 box')],
      { today: TODAY },
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ itemId: 'l1', kind: 'amount', pantryIds: ['p1'] });
    expect(checks[0].reason).toBe('Pantry has 1 box; the plan needs 300 g');
  });

  it('does not ask when the amounts compare (the list already bought only the shortfall)', () => {
    expect(shopChecks(
      [row('l1', 'Rice', '50 g', { requiredQty: '300 g' })],
      [stock('p1', 'Rice', '250 g')],
      { today: TODAY },
    )).toEqual([]);
  });

  it('asks about stock marked running low and stock last seen weeks ago', () => {
    const checks = shopChecks(
      [row('l1', 'Olive oil', '1 bottle'), row('l2', 'Pasta', '500 g')],
      [
        stock('p1', 'Olive oil', '', { low: true }),
        stock('p2', 'Pasta', '1 kg', { lastConfirmedAt: '2026-10-02' }),
      ],
      { today: TODAY },
    );
    expect(checks.map((c) => [c.name, c.kind])).toEqual([['Olive oil', 'low'], ['Pasta', 'stale']]);
    expect(checks[1].reason).toBe('Last checked 25 days ago');
  });

  it('never asks about rows with no pantry match, ticked rows, or rows already answered', () => {
    expect(shopChecks(
      [
        row('l1', 'Lemons', '2'),
        row('l2', 'Couscous', '300 g', { checked: true }),
        row('l3', 'Couscous', '300 g', { shopCheck: 'buy' }),
      ],
      [stock('p1', 'Couscous', '1 box')],
      { today: TODAY },
    )).toEqual([]);
  });

  it('ignores leftovers and pantry rows with no evidence at all', () => {
    expect(shopChecks(
      [row('l1', 'Couscous', '300 g')],
      [stock('p1', 'Couscous', '1 box', { cat: 'Leftovers' }), stock('p2', 'Couscous', '1 box', { confidence: 'unknown' })],
      { today: TODAY },
    )).toEqual([]);
  });

  it('matches across aliases and caps the number of questions', () => {
    const list = Array.from({ length: 9 }, (_, i) => row(`l${i}`, `Thing ${i}`, '300 g'));
    const pantry = Array.from({ length: 9 }, (_, i) => stock(`p${i}`, `Thing ${i}`, '1 box'));
    expect(shopChecks(list, pantry, { today: TODAY })).toHaveLength(SHOP_CHECK_LIMIT);
    expect(shopChecks([row('l1', 'Chickpeas', '2 tins')], [stock('p1', 'Tinned chickpeas', '', { low: true })], { today: TODAY }))
      .toHaveLength(1);
  });
});

describe('answering a check', () => {
  const state = () => ({
    day: TODAY,
    shoppingList: [row('l1', 'Couscous', '300 g'), row('l2', 'Milk', '1 pint')],
    pantry: [stock('p1', 'Couscous', '1 box', { confidence: 'probable', lastConfirmedAt: '2026-10-20', low: true })],
  });

  it('"Got enough" drops the row and confirms the pantry row today', () => {
    const change = applyShopCheck(state(), 'l1', 'have');
    expect(change.shoppingList.map((r) => r.id)).toEqual(['l2']);
    expect(change.pantry[0]).toMatchObject({
      confidence: 'definite', low: false, lastConfirmedAt: TODAY, confirmationSource: 'shop-check',
    });
    expect(change.confirmedPantryIds).toEqual(['p1']);
  });

  it('"Buy it" keeps the row, leaves the pantry alone and stops asking', () => {
    const before = state();
    const change = applyShopCheck(before, 'l1', 'buy');
    expect(change.pantry).toBeUndefined();
    expect(change.shoppingList).toHaveLength(2);
    expect(change.shoppingList[0].shopCheck).toBe('buy');
    expect(shopChecks(change.shoppingList, before.pantry, { today: TODAY })).toEqual([]);
  });

  it('refuses an unknown row or answer', () => {
    expect(applyShopCheck(state(), 'nope', 'have')).toBeNull();
    expect(applyShopCheck(state(), 'l1', 'maybe')).toBeNull();
  });
});
