import { describe, expect, it } from 'vitest';
import { parseQuantity } from '../src/lib/measure.js';
import { mergeQtys } from '../src/lib/pantry.js';
import { scaleQty } from '../src/lib/portions.js';

describe('"N whole" reads back as a plain count', () => {
  it('parses as a count of N', () => {
    expect(parseQuantity('2 whole')).toMatchObject({ amount: 2, dim: 'count' });
    expect(parseQuantity('1 whole')).toMatchObject({ amount: 1, dim: 'count' });
  });
  it('adds to a bare count instead of trailing on', () => {
    expect(mergeQtys('2', '1 whole', { ingredient: 'lemon' })).toBe('3');
    expect(mergeQtys('1 whole', '2', { ingredient: 'lemon' })).toBe('3');
  });
  it('still keeps a count next to a weight as two parts', () => {
    expect(mergeQtys('500 g', '2 whole', { ingredient: 'chicken breast' })).toBe('500 g + 2 whole');
  });
  it('scales', () => {
    expect(scaleQty('2 whole', 2)).toBeTruthy();
  });
});
