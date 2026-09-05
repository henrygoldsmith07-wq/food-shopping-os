import { describe, it, expect } from 'vitest';
import { receiptActions } from '../src/lib/receipt-actions.js';
import { EMPTY_STATE } from '../src/lib/state.js';

/** Drive receiptActions with a plain reducer-style set, like the store does. */
const run = (payload) => {
  let state = { ...EMPTY_STATE, day: '2026-09-02' };
  const set = (update) => {
    state = { ...state, ...update(state) };
  };
  receiptActions(set).saveReceipt(payload);
  return state;
};

describe('saveReceipt provenance', () => {
  it('keeps imported labelling when a pre-built imported trip is saved', () => {
    const state = run({
      store: 'Aldi',
      date: '2026-08-01',
      total: 5.39,
      imported: true,
      items: [{
        name: 'Bananas', price: 0.89, qty: '1',
        priceSource: 'receipt', recordedAt: '2026-08-01', aisle: 'Produce',
      }],
    });
    const shop = state.shops.at(-1);
    expect(shop.imported).toBe(true);
    expect(shop.items[0]).toMatchObject({
      priceSource: 'receipt',
      recordedAt: '2026-08-01',
      aisle: 'Produce',
    });
  });

  it('does not label a live recorded shop as imported', () => {
    const state = run({ store: 'Tesco', total: 3, items: [{ name: 'Bread', price: 1.35 }] });
    expect(state.shops[0].imported).toBeUndefined();
    expect(state.shops[0].items[0].priceSource).toBeUndefined();
  });

  it('marks pantry rows born from a receipt as receipt-sourced', () => {
    const state = run({ store: 'Lidl', total: 2, items: [{ name: 'Pasta', price: 0.75, qty: '500g' }] });
    expect(state.pantry.some((item) => item.name === 'Pasta' && item.purchaseSource === 'receipt')).toBe(true);
  });
});
