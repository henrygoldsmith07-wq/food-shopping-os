import { describe, it, expect } from 'vitest';
import { shoppingExplanationFor, addShoppingExplanations } from '../src/lib/shopping-explanations.js';

describe('shopping explanations', () => {
  it('returns null without an item', () => {
    expect(shoppingExplanationFor(null)).toBeNull();
  });
  it('explains planned items from their meals', () => {
    const e = shoppingExplanationFor({ name: 'Rice', qty: '500 g', allocations: [{ meal: 'Curry', date: '2026-10-21', qty: '200 g' }, { qty: '' }] });
    expect(e.reasons).toEqual(['Curry (2026-10-21): 200 g', 'Planned meal: needed']);
    expect(e.confidence).toBe('planned');
    expect(e.mealCount).toBe(2);
  });
  it('falls back through meal dependency, staple, manual, then generic', () => {
    expect(shoppingExplanationFor({ name: 'a', mealDependency: 'Soup' }).text).toBe('Needed for Soup');
    expect(shoppingExplanationFor({ name: 'a', staple: true })).toMatchObject({ text: 'Predicted household staple restock', confidence: 'predicted' });
    expect(shoppingExplanationFor({ name: 'a', manual: true }).text).toBe('Added by you');
    expect(shoppingExplanationFor({ name: 'a' }).text).toBe('Shopping list item');
  });
  it('keeps items unchanged when there is no plan', () => {
    const out = addShoppingExplanations([{ name: 'Milk' }], {});
    expect(out[0].allocations).toEqual([]);
    expect(out[0].shoppingExplanation.confidence).toBe('manual');
  });
  it('tolerates an empty list', () => {
    expect(addShoppingExplanations(undefined, {})).toEqual([]);
  });
});
