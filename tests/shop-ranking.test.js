import { describe, it, expect } from 'vitest';
import { bestPerRetailer, rankShops } from '../src/lib/shop-ranking.js';

describe('bestPerRetailer', () => {
  it('keeps the cheapest row per shop, sorted by price', () => {
    const out = bestPerRetailer({ cheapest: [
      { retailerId: 'a', price: 2 }, { retailerId: 'a', price: 1.5 }, { retailerId: 'b', price: 1 },
    ] });
    expect(out.map((r) => [r.retailerId, r.price])).toEqual([['b', 1], ['a', 1.5]]);
  });
  it('handles missing results', () => {
    expect(bestPerRetailer(undefined)).toEqual([]);
    expect(bestPerRetailer({})).toEqual([]);
  });
});

describe('rankShops', () => {
  it('returns an empty, honest result with no usable prices', () => {
    const out = rankShops([{ retailerId: 'a', price: 0 }, { retailerId: 'b' }]);
    expect(out.rows).toEqual([]);
    expect(out.basis).toBe('none');
  });
  it('does not mutate its input', () => {
    const input = [{ retailerId: 'a', price: 1 }];
    const copy = JSON.parse(JSON.stringify(input));
    rankShops(input);
    expect(input).toEqual(copy);
  });
});
