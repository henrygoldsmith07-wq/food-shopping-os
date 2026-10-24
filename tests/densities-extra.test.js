import { describe, it, expect } from 'vitest';
import { subtractQuantities } from '../src/lib/measure-ops.js';
import { parseQuantity } from '../src/lib/measure-parse.js';

describe('shop-name densities bridge cups/spoons and grams', () => {
  it.each(['plain flour', 'caster sugar', 'basmati rice', 'brown sugar', 'porridge oats'])(
    'subtracts a cup of %s from a 500 g pack', (name) => {
      const left = subtractQuantities(parseQuantity('500 g'), parseQuantity('1 cup'), { ingredient: name, allowDensity: true });
      expect(left).toBeTruthy();
      expect(left.amount).toBeGreaterThan(250);
      expect(left.amount).toBeLessThan(500);
    });
});
