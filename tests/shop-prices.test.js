import { describe, expect, it } from 'vitest';
import { shopIndexFor, usualShop } from '../src/data/shop-index.js';
import { typicalPriceFor } from '../src/data/typical-prices.js';
import { receiptPrices, rowEstimate, estimateBasket } from '../src/lib/basket-estimate.js';
import { shoppingNameKey } from '../src/lib/shopping-names.js';
import { priceForPack, queryFor } from '../scripts/refresh-typical-prices.mjs';

describe('the shop index', () => {
  it('moves the mid-range figure to the shop people actually use', () => {
    expect(shopIndexFor('Aldi').factor).toBeLessThan(0.9);
    expect(shopIndexFor('Waitrose').factor).toBeGreaterThan(1.1);
    expect(shopIndexFor('Tesco Express')).toMatchObject({ id: 'tesco' });
    expect(shopIndexFor("Sainsbury's Local")).toMatchObject({ id: 'sainsburys' });
    expect(shopIndexFor('M&S')).toBeNull();
    expect(shopIndexFor('Tesco', { loyalty: true }).factor).toBeLessThan(shopIndexFor('Tesco').factor);
  });

  it('names the usual shop from the receipts logged', () => {
    expect(usualShop([{ store: 'Aldi' }, { store: 'Tesco' }, { store: 'Aldi' }])).toBe('Aldi');
    expect(usualShop([])).toBeNull();
  });

  it('prices a typical row at that shop and says so', () => {
    const mid = typicalPriceFor('baked beans', '2 tins');
    const aldi = typicalPriceFor('baked beans', '2 tins', { shop: 'Aldi' });
    expect(aldi.price).toBeLessThan(mid.price);
    expect(aldi.shop).toBe('Aldi');
    const key = shoppingNameKey('baked beans');
    expect(rowEstimate({ name: 'baked beans', qty: '1' }, { shop: 'Aldi', live: { [key]: null } }).label).toMatch(/^typical at Aldi/);
    // A row assigned to a shop is priced at that shop, whatever the default.
    expect(rowEstimate({ name: 'baked beans', store: 'Waitrose' }, { shop: 'Aldi' }).label).toMatch(/typical at Waitrose/);
  });
});

describe('receipts as a price source', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const shops = [
    { store: 'Tesco', date: '2026-06-01', items: [{ name: 'Baked beans', price: 0.55 }] },
    { store: 'Aldi', date: '2026-10-20', items: [
      { name: 'Baked beans', price: 0.9, qty: '2' },
      { name: 'Onions', price: 0.48, qty: '0.482 kg' },
    ] },
    { store: 'Aldi', date: '2026-01-02', items: [{ name: 'Coffee', price: 2.49 }] },
  ];

  it('keeps the latest price per item, divided back to one listing', () => {
    const paid = receiptPrices(shops);
    expect(paid[shoppingNameKey('baked beans')]).toMatchObject({ price: 0.45, store: 'Aldi', date: '2026-10-20' });
    expect(paid[shoppingNameKey('onions')]).toMatchObject({ price: 0.48, packSize: '0.482 kg' });
  });

  it('outranks a live check, and is labelled as what you paid', () => {
    const key = shoppingNameKey('baked beans');
    const evidence = { receipts: receiptPrices(shops), live: { [key]: { best: { price: 0.37, retailer: 'Morrisons' } } }, now };
    expect(rowEstimate({ name: 'baked beans', qty: '2 tins' }, evidence)).toMatchObject({ price: 0.9, source: 'receipt', label: 'you paid at Aldi' });
    expect(estimateBasket([{ name: 'baked beans' }], evidence).sources.receipt).toBe(1);
  });

  it('lets an old receipt give way to fresher evidence', () => {
    const key = shoppingNameKey('coffee');
    const evidence = { receipts: receiptPrices(shops), live: { [key]: { best: { price: 3.1, retailer: 'Morrisons' } } }, now };
    expect(rowEstimate({ name: 'coffee' }, evidence)).toMatchObject({ source: 'live' });
  });
});

describe('re-pricing the table from a shelf', () => {
  const row = (name, price, packSize = null, relevance = 1) => ({ name, price, packSize, relevance, inStock: true });

  it('derives a shop search from the pattern', () => {
    expect(queryFor('chopped tomatoes|plum tomatoes|tinned tomatoes')).toBe('chopped tomatoes');
    expect(queryFor('\\bjam\\b|marmalade')).toBe('strawberry jam');
  });

  it('scales the closest own-brand pack to the table pack', () => {
    const picked = priceForPack([
      row('Napolina Chopped Tomatoes 400g', 0.75, '400g'),
      row('Morrisons Chopped Tomatoes 400g', 0.45, '400g'),
      row('Morrisons Chopped Tomatoes 4x400g', 1.6, '4x400g'),
    ], '400 g tin');
    expect(picked.price).toBe(0.45);
  });

  it('prices a counted pack per pack and a loose item per item', () => {
    expect(priceForPack([row('Morrisons Mince Pies 6 Pack', 1.5)], '6').price).toBe(1.5);
    expect(priceForPack([row('Morrisons Lemons 4 Pack', 1.2)], 'each', { each: true }).price).toBeCloseTo(0.3);
    // A bag sold by weight says nothing reliable about one fruit.
    expect(priceForPack([row('Morrisons Grapefruit Segments 540g', 1.45, '540g')], 'each', { each: true })).toBeNull();
  });

  it('uses a refreshed figure while it is recent, and the written one after', () => {
    const refreshed = { generatedAt: '2026-10-01T00:00:00Z', prices: { 'baked beans': { price: 0.52 } } };
    expect(typicalPriceFor('baked beans', '', { refreshed, now: Date.parse('2026-10-30') })).toMatchObject({ unit: 0.52, checkedAt: '2026-10-01T00:00:00Z' });
    expect(typicalPriceFor('baked beans', '', { refreshed, now: Date.parse('2027-03-01') })).toMatchObject({ unit: 0.45, checkedAt: null });
  });

  it('refuses a listing too far from the table pack to scale honestly', () => {
    expect(priceForPack([row('Morrisons Basmati Rice 5kg', 9, '5kg')], '1 kg')).toBeNull();
  });
});
