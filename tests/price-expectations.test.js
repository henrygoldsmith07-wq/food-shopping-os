import { describe, expect, it } from 'vitest';
import { priceDistributionFor, priceExpectationFor } from '../src/lib/price-expectations.js';

const shops = [1, 2, 3, 4, 5].map((price, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, store: 'Tesco', items: [{ name: 'Olive oil', price }] }));

describe('price expectations', () => {
  it('builds a distribution rather than a single asserted normal price', () => {
    expect(priceDistributionFor('Olive oil', shops)).toMatchObject({ observations: 5, median: 3, low: 2, high: 4, confidence: 'high' });
  });
  it('flags an unusually expensive current price without claiming a forecast', () => {
    const result = priceExpectationFor({ name: 'Olive oil', price: 7 }, shops);
    expect(result.decision).toBe('wait');
    expect(result.deviationPct).toBeGreaterThan(100);
    expect(result.caveat).toMatch(/not a forecast/);
  });
  it('stays cautious when there is not enough evidence', () => {
    expect(priceExpectationFor({ name: 'Olive oil', price: 7 }, shops.slice(0, 2)).decision).toBe('buy now');
  });
});
