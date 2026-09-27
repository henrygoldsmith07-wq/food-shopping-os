import { describe, expect, it } from 'vitest';
import { adaptationMayApply, isValidPantryRow, isValidShoppingRow } from '../../src/typed/core.js';

describe('strict domain contracts actually check critical logic', () => {
  it('rejects invalid shopping and pantry rows', () => {
    expect(isValidShoppingRow({ id: 's1', name: 'Milk' })).toBe(true);
    expect(isValidShoppingRow({ name: 'Milk' })).toBe(false);
    expect(isValidShoppingRow({ id: 's1', name: '  ' })).toBe(false);
    expect(isValidShoppingRow(null)).toBe(false);
    expect(isValidPantryRow({ id: 'p1', name: 'Flour' })).toBe(true);
    expect(isValidPantryRow({ id: 'p1' })).toBe(false);
  });

  it('withholds adaptation on weak evidence or repeated rejection', () => {
    expect(adaptationMayApply({ observations: 2, rejections: 0 })).toBe(false);
    expect(adaptationMayApply({ observations: 3, rejections: 0 })).toBe(true);
    expect(adaptationMayApply({ observations: 9, rejections: 2 })).toBe(false);
  });
});
