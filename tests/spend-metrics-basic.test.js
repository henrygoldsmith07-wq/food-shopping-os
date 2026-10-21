import { describe, it, expect } from 'vitest';
import { shoppingQuantityError } from '../src/lib/spend-metrics.js';

const TODAY = '2026-10-20';

describe('shoppingQuantityError honest silence and exclusions', () => {
  it('returns no number and no samples for an empty or missing state', () => {
    for (const state of [undefined, {}, { shops: null }, { shops: [] }]) {
      const r = shoppingQuantityError(state, { today: TODAY });
      expect(r.version).toBe(3);
      expect(r.value).toBeNull();
      expect(r.samples).toBe(0);
      expect(r.confidence).toBe('none');
      expect(r.excluded).toEqual([]);
    }
  });

  it('counts a purchase with no frozen prediction instead of scoring it', () => {
    const state = { shops: [{ id: 's1', date: '2026-10-18', items: [{ id: 'a', name: 'Rice', qty: '500 g' }] }] };
    const r = shoppingQuantityError(state, { today: TODAY });
    expect(r.value).toBeNull();
    expect(r.excludedReasons['no-frozen-prediction']).toBe(1);
  });

  it('excludes future shops and rows with no recorded quantity', () => {
    const state = {
      shops: [
        { id: 'f', date: '2026-12-01', items: [{ id: 'a', name: 'Rice', qty: '1 kg' }] },
        { id: 'n', date: '2026-10-18', items: [{ id: 'b', name: 'Oats', qty: '' }] },
      ],
    };
    const r = shoppingQuantityError(state, { today: TODAY });
    expect(r.samples).toBe(0);
    expect(r.excludedReasons['future-shop']).toBe(1);
    expect(r.excludedReasons['unrecorded-purchase-quantity']).toBe(1);
  });

  it('scores nothing when today is malformed', () => {
    const state = { shops: [{ id: 's', date: '2026-10-18', items: [{ id: 'a', name: 'Rice', qty: '1 kg' }] }] };
    const r = shoppingQuantityError(state, { today: 'nonsense' });
    expect(r.samples).toBe(0);
    expect(r.value).toBeNull();
  });
});
