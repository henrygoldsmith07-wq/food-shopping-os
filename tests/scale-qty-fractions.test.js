import { describe, it, expect } from 'vitest';
import { scaleQty } from '../src/lib/portions.js';

describe('scaleQty with fractions and ranges', () => {
  it('scales ASCII fractions', () => {
    expect(scaleQty('1/2 cup', 2)).toBe('1 cup');
    expect(scaleQty('3/4 cup', 2)).toBe('1.5 cups');
    expect(scaleQty('1 1/2 cups', 2)).toBe('3 cups');
  });
  it('scales unicode fractions', () => {
    expect(scaleQty('½ tsp', 3)).toBe('1.5 tsp');
    expect(scaleQty('1½ cups', 2)).toBe('3 cups');
  });
  it('scales both ends of a range', () => {
    expect(scaleQty('1-2 tbsp', 2)).toBe('2-4 tbsp');
    expect(scaleQty('2-3 cloves', 2)).toBe('4-6 cloves');
  });
  it('still scales plain numbers', () => {
    expect(scaleQty('2 cups', 1.5)).toBe('3 cups');
  });
});
