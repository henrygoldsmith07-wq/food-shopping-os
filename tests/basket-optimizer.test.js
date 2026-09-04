import { describe, expect, it } from 'vitest';
import { buildBasketOffers, compareBaskets, optimiseLiveBasket } from '../src/lib/basket-optimizer.js';

describe('practical basket optimization', () => {
  it('does not choose a deceptively cheap store with missing items', () => {
    const result = compareBaskets(
      [{ name: 'Chicken' }, { name: 'Tomatoes' }, { name: 'Rice' }, { name: 'Milk' }],
      {
        Tesco: { chicken: { price: 10 }, tomatoes: { price: 5 }, rice: { price: 8 }, milk: { price: 25 } },
        Aldi: { chicken: { price: 8 }, tomatoes: { price: 4 }, rice: { price: 7 } },
      },
      { unmatchedPenalty: 30 },
    );
    expect(result.rows.find((row) => row.store === 'Aldi')).toMatchObject({ total: 19, unavailable: 1, availability: 75 });
    expect(result.best.store).toBe('Tesco');
  });

  it('includes delivery, travel, and explicit substitutions in the practical comparison', () => {
    const result = compareBaskets(
      [{ name: 'Milk' }, { name: 'Bread' }],
      { Tesco: { milk: { price: 2 }, bread: { price: 2, substitution: 'Wholemeal bread' } } },
      { delivery: { Tesco: 3 }, travel: { Tesco: 1.5 } },
    );
    expect(result.best).toMatchObject({ total: 8.5, productTotal: 4, delivery: 3, travel: 1.5, substitutions: 1 });
    expect(result.best.explanation).toMatch(/Tesco.*£8\.50/);
  });

  it('compares detailed equivalent products and chooses the cheapest complete basket', () => {
    const result = optimiseLiveBasket(
      [{ name: 'Milk', qty: '1 litre' }, { name: 'Bread', qty: '1 loaf' }],
      {
        liveResults: {
          milk: {
            name: 'Milk',
            perRetailer: [
              { retailerId: 'tesco', retailer: 'Tesco', name: 'Tesco Semi-Skimmed Milk 2.27L', packSize: '2.27L', price: 1.5 },
              { retailerId: 'aldi', retailer: 'Aldi', name: 'Aldi Semi-Skimmed Milk 2L', packSize: '2L', price: 1.2 },
            ],
          },
          bread: {
            name: 'Bread',
            perRetailer: [
              { retailerId: 'tesco', retailer: 'Tesco', name: 'Tesco White Bread 800g', packSize: '800g', price: 1 },
              { retailerId: 'aldi', retailer: 'Aldi', name: 'Aldi White Bread 800g', packSize: '800g', price: 0.8 },
            ],
          },
        },
      },
    );

    expect(result.complete).toBe(true);
    expect(result.best.store).toBe('Aldi');
    expect(result.best.total).toBe(2);
    expect(result.best.matched).toBe(2);
  });

  it('keeps a non-equivalent variant out of a complete-basket total', () => {
    const result = compareBaskets(
      [{ name: 'Heinz Beans 4 x 415g' }],
      {
        'Shop A': {
          'heinz beans 4 x 415g': { name: 'Heinz Beans 4 x 415g reduced salt', price: 2 },
        },
        'Shop B': {
          'heinz beans 4 x 415g': { name: 'Heinz Beans 4 x 415g', price: 2.5 },
        },
      },
      { requireComplete: true },
    );

    const partial = result.rows.find((row) => row.store === 'Shop A');
    expect(partial).toMatchObject({ complete: false, unavailable: 1, productTotal: 0 });
    expect(partial.excludedItems[0]).toMatchObject({ item: 'Heinz Beans 4 x 415g', reason: 'different variant' });
    expect(result.best).toMatchObject({ store: 'Shop B', complete: true, total: 2.5 });
  });

  it('charges for the packs needed, not just one ticket price', () => {
    const result = compareBaskets(
      [{ name: 'Rice', qty: '1 kg' }],
      {
        Tesco: { rice: { name: 'Tesco Rice 500g', packSize: '500g', price: 1 } },
        Aldi: { rice: { name: 'Aldi Rice 1kg', packSize: '1kg', price: 1.8 } },
      },
      { requireComplete: true },
    );

    const tesco = result.rows.find((row) => row.store === 'Tesco');
    expect(tesco).toMatchObject({ total: 2, productTotal: 2 });
    expect(tesco.matchedItems[0]).toMatchObject({ packsNeeded: 2, quantityNote: '2 × 500g' });
    expect(result.best).toMatchObject({ store: 'Aldi', total: 1.8, complete: true });
  });

  it('prefers an equivalent hit over a cheaper unrelated hit for one store', () => {
    const result = compareBaskets(
      [{ name: 'Milk' }],
      {
        Tesco: {
          milk: [
            { name: 'Tesco Almond Milk 1L', packSize: '1L', price: 0.8 },
            { name: 'Tesco Semi-Skimmed Milk 2L', packSize: '2L', price: 1.5 },
          ],
        },
      },
    );

    expect(result.best.matchedItems[0]).toMatchObject({ product: 'Tesco Semi-Skimmed Milk 2L', price: 1.5 });
    expect(result.best.complete).toBe(true);
  });

  it('builds retailer offers from the newest receipt per shop without duplicating stores', () => {
    const prepared = buildBasketOffers(
      [{ name: 'Milk' }],
      {
        shops: [
          { store: 'Tesco', date: '2026-08-01', items: [{ name: 'Milk', price: 1.8 }] },
          { store: 'Tesco', date: '2026-08-08', items: [{ name: 'Milk', price: 1.5 }] },
          { store: 'Aldi', date: '2026-08-07', items: [{ name: 'Milk', price: 1.2 }] },
        ],
      },
    );

    expect(prepared.stores.sort()).toEqual(['Aldi', 'Tesco']);
    expect(prepared.offersByStore.Tesco.milk.price).toBe(1.5);
    expect(prepared.offersByStore.Aldi.milk.price).toBe(1.2);
  });

  it('returns no recommendation for empty or invalid input', () => {
    const result = optimiseLiveBasket([], {
      liveResults: { milk: { name: 'Milk', perRetailer: [{ retailerId: 'tesco', retailer: 'Tesco', price: 1 }] } },
      shops: [{ store: 'Aldi', date: '2026-08-01', items: [{ name: 'Milk', price: 1 }] }],
    });

    expect(result).toMatchObject({ rows: [], best: null, complete: false, recommendation: null });
    expect(result.stores).toEqual([]);
    expect(compareBaskets([null, {}, { name: '' }], { Tesco: { milk: { price: 1 } } }).rows[0]).toMatchObject({ matched: 0, availability: 100 });
  });
});
