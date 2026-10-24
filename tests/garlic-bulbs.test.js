import { describe, expect, it } from 'vitest';
import { shoppableQty } from '../src/lib/shoppable-qty.js';
import { shoppingItemsForRecipe } from '../src/lib/recipe-shopping.js';

describe('garlic is bought in bulbs', () => {
  it.each([
    ['3 cloves', '1 bulb'],
    ['11 cloves', '1 bulb'],
    ['14 cloves', '2 bulbs'],
    ['25', '3 bulbs'],
    ['2 to 3 cloves', '1 bulb'],
  ])('%s -> %s', (qty, want) => {
    expect(shoppableQty(qty, 'Garlic')).toBe(want);
  });

  it('a bulb plus loose cloves across lines shows bulbs, not a bare 14', () => {
    const rows = shoppingItemsForRecipe({
      id: 'r', name: 'R',
      ingredients: [{ name: 'Garlic', qty: '1 bulb' }, { name: 'Garlic clove', qty: '3' }],
    }, [], { today: '2026-09-22' });
    expect(rows).toHaveLength(1);
    // The hand-off to the list buys whole packs (shopping-list-mutations).
    expect(shoppableQty(rows[0].qty, rows[0].name)).toBe('2 bulbs');
  });
});
