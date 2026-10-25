import { describe, it, expect } from 'vitest';
import { DENSITIES, parseQuantity } from '../src/lib/measure-parse.js';
import { convert } from '../src/lib/measure-ops.js';

describe('extra staple densities', () => {
  it('has plausible values', () => {
    for (const k of ['cornflour', 'couscous', 'ketchup', 'cream cheese']) {
      expect(DENSITIES[k]).toBeGreaterThan(0.3);
      expect(DENSITIES[k]).toBeLessThan(1.5);
    }
  });
  it('converts a cup of couscous to grams, approximately', () => {
    const q = convert(parseQuantity('1 cup'), 'mass', { ingredient: 'couscous' });
    expect(q.unit).toBe('g');
    expect(q.amount).toBe(175);
    expect(q.confidence).toBe('approximate');
  });
});
