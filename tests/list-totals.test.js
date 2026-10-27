import { describe, expect, it } from 'vitest';
import { listTotals } from '../src/lib/basket-estimate.js';

describe('listTotals', () => {
  it('splits the list into what is in the trolley and what is still to get', () => {
    const totals = listTotals([
      { name: 'Milk', price: 1.5, checked: true },
      { name: 'Bread', price: 1.2 },
      { name: 'Eggs', price: 2.3, checked: true },
    ]);
    expect(totals).toMatchObject({ total: 5, inTrolley: 3.8, toGo: 1.2, left: 1, unpriced: 0, estimated: false });
  });

  it('borrows an estimate for an unpriced row and says the total is estimated', () => {
    const totals = listTotals([{ name: 'Milk', qty: '1 pint', price: 0 }], {
      live: { milk: { best: { price: 0.95, retailer: 'Tesco' } } },
    });
    expect(totals.estimated).toBe(true);
    expect(totals.total).toBeGreaterThan(0);
  });

  it('counts a row with no evidence at all as unpriced, never as free', () => {
    const totals = listTotals([{ name: 'Zzyzx root', price: 0 }]);
    expect(totals).toMatchObject({ total: 0, unpriced: 1, left: 1 });
  });
});
