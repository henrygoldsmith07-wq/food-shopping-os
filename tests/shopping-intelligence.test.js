import { describe, expect, it } from 'vitest';
import {
  compareShoppingPrices,
  duplicatePurchaseCheck,
  orderShoppingList,
  priceChangeFor,
  priceConfidenceFor,
  substitutionPlan,
} from '../src/lib/shopping-intelligence.js';
import { retailerFallbackPlan } from '../src/data/retailers.js';

describe('shopping intelligence', () => {
  it('ranks a dietary substitution already in the pantry first', () => {
    const plan = substitutionPlan({ name: 'Milk' }, {
      diets: ['vegan'],
      pantry: [{ name: 'Oat milk' }],
      shops: [{ date: '2026-08-18', store: 'Tesco', items: [{ name: 'Oat milk', price: 1.6 }] }],
    });

    expect(plan.best).toMatchObject({ name: 'Oat milk', inPantry: true, preferenceFit: true, price: 1.6 });
    expect(plan.best.rationale).toMatch(/Already in your pantry/);
  });

  it('blocks list duplicates but leaves a recent purchase as a warning', () => {
    const list = [{ id: 'milk', name: 'Milk' }];
    expect(duplicatePurchaseCheck({ id: 'new', name: 'MILK' }, { list, today: '2026-08-19' })).toMatchObject({ level: 'blocked' });
    expect(duplicatePurchaseCheck({ name: 'Bread' }, {
      today: '2026-08-19',
      shops: [{ date: '2026-08-18', store: 'Aldi', items: [{ name: 'Bread', price: 1.1 }] }],
    })).toMatchObject({ level: 'warning', recentlyPurchased: { store: 'Aldi' } });
  });

  it('shows source and measurement confidence separately', () => {
    expect(priceConfidenceFor({ name: 'Milk', price: 1.5, qty: '2 x 500 g', priceSource: 'receipt' })).toMatchObject({
      source: 'receipt', level: 'high', unitConfidence: 'exact',
    });
    expect(priceConfidenceFor({ name: 'Unknown jar', price: 3, qty: '1 jar' })).toMatchObject({
      source: 'manual', level: 'medium', unitConfidence: 'approximate',
    });
  });

  it('tracks movement and ranks like-for-like unit value', () => {
    const shops = [
      { date: '2026-08-01', store: 'Tesco', items: [{ name: 'Pasta', price: 1.2, qty: '500 g' }] },
      { date: '2026-08-10', store: 'Aldi', items: [{ name: 'Pasta', price: 1, qty: '500 g' }] },
    ];
    expect(priceChangeFor('Pasta', shops)).toMatchObject({ direction: 'down', change: -0.2, pct: -16.7, observations: 2 });
    const comparison = compareShoppingPrices({ name: 'Pasta', price: 2.2, qty: '1 kg' }, shops);
    expect(comparison.best.store).toBe('Aldi');
    expect(comparison.best.unitPrice.unit).toBe('100g');
    expect(comparison.comparable).toBe(3);
  });

  it('keeps the learned store route as the flattened shopping order', () => {
    const rows = orderShoppingList([
      { name: 'Apples', aisle: 'Fruit & veg' },
      { name: 'Bread', aisle: 'Bakery' },
    ], { store: 'Tesco', routes: { Tesco: ['Bakery', 'Fruit & veg'] } });
    expect(rows.map((row) => row.name)).toEqual(['Bread', 'Apples']);
  });

  it('offers an explicit retailer fallback after a failed preferred shop', () => {
    const plan = retailerFallbackPlan('tesco', { failedIds: ['tesco'], items: [{ name: 'Milk' }] });
    expect(plan.preferred).toMatchObject({ id: 'tesco', status: 'unavailable' });
    expect(plan.fallback).toMatchObject({ id: expect.not.stringMatching(/^tesco$/), status: 'browse' });
    expect(plan.reason).toMatch(/unavailable/);
  });
});
