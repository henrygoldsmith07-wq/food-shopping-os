import { describe, expect, it } from 'vitest';
import { EMPTY_STATE } from '../src/lib/state.js';
import { hydrate } from '../src/lib/store-persistence.js';
import { shoppingActions } from '../src/lib/shopping-actions.js';
import { findShoppingDuplicate, shoppingNameKey } from '../src/lib/shopping.js';

const runAction = (state, item) => {
  let next = state;
  shoppingActions((update) => {
    const patch = update(next);
    next = { ...next, ...patch };
  }).toggleFavouriteShopping(item);
  return next;
};

describe('favourite shopping products', () => {
  it('saves a compact product snapshot and toggles it by normalised name', () => {
    const first = runAction({ ...EMPTY_STATE }, { name: 'Bananas', qty: '6', price: '1.2', emoji: '🍌', aisle: 'Fruit & veg' });
    expect(first.favouriteShopping).toEqual([expect.objectContaining({ name: 'Bananas', qty: '6', price: 1.2 })]);
    const second = runAction(first, { name: 'BANANA' });
    expect(second.favouriteShopping).toEqual([]);
  });

  it('hydrates the new collection for existing installs', () => {
    expect(hydrate({ onboarded: true }).favouriteShopping).toEqual([]);
  });

  it('keeps non-Latin product names distinct', () => {
    expect(shoppingNameKey('寿司')).toBe('寿司');
    expect(shoppingNameKey('라면')).toBe('라면');
    expect(findShoppingDuplicate('라면', [{ name: '寿司' }])).toBeNull();
  });
});
