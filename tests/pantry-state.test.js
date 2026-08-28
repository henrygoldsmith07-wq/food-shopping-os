import { describe, expect, it } from 'vitest';
import { normalisePantryItem, pantryQuantityRange, quantityRangeLabel } from '../src/lib/pantry-intelligence.js';

describe('proper pantry state', () => {
  it('keeps operational inventory metadata without losing the original amount', () => {
    const item = normalisePantryItem({
      name: 'Milk', qty: '600 ml', unit: 'ml', confidence: 'probable', amountConfidence: 'approximate',
      opened: true, purchaseDate: '2026-08-20', expiry: '2026-08-27', location: 'Fridge',
      purchaseSource: 'Tesco', cost: 1.8, expectedConsumptionRate: '300 ml/day', plannedMealAllocations: ['2026-08-27|breakfast'],
    });
    expect(item).toMatchObject({ name: 'Milk', qty: '600 ml', unit: 'ml', opened: true, purchaseSource: 'Tesco' });
    expect(item.plannedMealAllocations).toEqual(['2026-08-27|breakfast']);
  });

  it('represents approximate stock as a range instead of false precision', () => {
    const item = { name: 'Milk', qty: '400 ml', unit: 'ml', amountConfidence: 'approximate' };
    expect(pantryQuantityRange(item)).toMatchObject({ min: 300, max: 500, unit: 'ml', source: 'estimated' });
    expect(quantityRangeLabel(item)).toBe('300–500 ml estimated');
  });

  it('preserves explicit household estimates', () => {
    expect(quantityRangeLabel({ name: 'Milk', quantityMin: 300, quantityMax: 600, unit: 'ml' }))
      .toBe('300–600 ml estimated');
  });
});
