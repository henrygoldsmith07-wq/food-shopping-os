import { describe, expect, it } from 'vitest';
import { mergeQtys } from '../src/lib/pantry.js';

describe('summed imperial amounts read as whole grams', () => {
  it('1 oz + 50 g is 78 g, not 78.35 g', () => {
    expect(mergeQtys('1 oz', '50 g', { ingredient: 'cheese' })).toBe('78 g');
  });
  it('2 oz + 1 oz is 85 g', () => {
    expect(mergeQtys('2 oz', '1 oz', { ingredient: 'cheese' })).toBe('85 g');
  });
  it('small amounts keep one decimal', () => {
    expect(mergeQtys('2 g', '0.25 oz', { ingredient: 'salt' })).toBe('9.1 g');
  });
});
