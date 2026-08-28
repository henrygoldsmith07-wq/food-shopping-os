import { describe, expect, it } from 'vitest';
import { classifyProductMatch, normaliseProduct, matchLabel } from '../src/lib/product-matching.js';

describe('product matching', () => {
  it('normalises branded pack quantities', () => {
    expect(normaliseProduct({ name: 'Heinz Beans 4 x 415g' })).toMatchObject({ product: 'heinz bean', packCount: 4, totalQuantity: 1660 });
  });
  it('recognises equivalent spelling across retailers', () => {
    const result = classifyProductMatch({ name: 'Heinz Beans 4 x 415g' }, { name: 'Heinz Beanz 4 Pack 415g' });
    expect(result.classification).toBe('exact');
    expect(result.equivalent).toBe(true);
    expect(matchLabel(result.classification)).toBe('Exact match');
  });
  it('does not silently cross brands or variants', () => {
    expect(classifyProductMatch({ name: 'Heinz Beans 4 x 415g' }, { name: 'Branded Beans 4 x 415g' }).classification).toBe('unknown');
    expect(classifyProductMatch({ name: 'Heinz Beans 4 x 415g' }, { name: 'Heinz Beans 4 x 415g reduced salt' }).classification).toBe('approximation');
  });
});
