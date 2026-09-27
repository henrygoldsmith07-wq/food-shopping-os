import { describe, expect, it } from 'vitest';
import { normaliseProvenance, PRICE_SOURCES } from '../src/lib/price-provenance.js';
import { candidatesFor, resolvePrice } from '../src/lib/price-resolver.js';

/**
 * External-data provenance: the UI must always be able to say whether a
 * value was observed, typed, inferred, generated, stale or missing — never
 * present an estimate or scrape with false certainty.
 */
describe('external-data provenance travels with the value', () => {
  it('every canonical source maps to a freshness + confidence the UI can show', () => {
    for (const [key, meta] of Object.entries(PRICE_SOURCES)) {
      expect(typeof meta.label, key).toBe('string');
      expect(typeof meta.freshness, key).toBe('string');
      expect(typeof meta.confidence, key).toBe('string');
    }
  });

  it('estimates and community observations are never live quotes', () => {
    expect(normaliseProvenance({ name: 'Milk', price: 1.1, source: 'estimated' }).isLive).toBe(false);
    expect(normaliseProvenance({ name: 'Milk', price: 1.1, source: 'estimated' }).warning).toBeTruthy();
    const community = normaliseProvenance({ name: 'Milk', price: 1.0, source: 'observed', observedAt: '2020-01-01' });
    expect(community.isLive).toBe(false);
    expect(community.stale || community.freshnessLabel).toBeTruthy();
  });

  it('missing data resolves to "unavailable", never an invented price', () => {
    expect(candidatesFor('Nothing real', {})).toEqual([]);
    const resolved = resolvePrice('Nothing real', {});
    expect(resolved.resolved).toBe(false);
    expect(resolved.price ?? null).toBeNull();
  });

  it('scraped rows keep their method and URL, not a generic manual label', () => {
    const row = normaliseProvenance({
      name: 'Beans', price: 0.9, method: 'ai-extracted',
      retailer: 'Tesco', url: 'https://shop.test/beans',
    });
    expect(row.source).toBe('ai-extracted');
    expect(row.isLive).toBe(false);
  });
});
