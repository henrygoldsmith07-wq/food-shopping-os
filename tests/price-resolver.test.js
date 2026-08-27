import { describe, it, expect } from 'vitest';
import {
  ageInDays, candidatesFor, confidenceOf, freshnessFactor, receiptsByKey,
  resolveList, resolvePrice, scoreCandidate,
} from '../src/lib/price-resolver.js';
import { shoppingNameKey } from '../src/lib/shopping.js';

const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const k = shoppingNameKey;
const at = (days) => new Date(NOW - days * 86400000).toISOString().slice(0, 10);

const scraped = (price, days = 0) => ({
  best: { price, retailer: 'Tesco', name: 'Tesco thing', url: 'https://t.test/p' },
  checkedAt: new Date(NOW - days * 86400000).toISOString(),
});
const receipt = (price, days) => ({ points: [{ date: at(days), price, store: 'Aldi' }] });
const checked = (price, days) => ({
  points: [{ date: at(days), best: price, shops: { aldi: { price, retailer: 'Aldi' } } }],
});
const observed = (price, days) => ({ price, store: 'Asda', observedAt: at(days) });

describe('how old a price is', () => {
  it('reads a date-only and a full timestamp alike', () => {
    expect(ageInDays(at(7), NOW)).toBe(7);
    expect(ageInDays(new Date(NOW - 3 * 86400000).toISOString(), NOW)).toBe(3);
  });

  it('says nothing rather than guessing when there is no date', () => {
    expect(ageInDays(null, NOW)).toBeNull();
    expect(ageInDays('not a date', NOW)).toBeNull();
  });
});

describe('what age does to worth', () => {
  it('decays smoothly rather than falling off a cliff', () => {
    expect(freshnessFactor(0)).toBe(1);
    expect(freshnessFactor(90)).toBeCloseTo(0.5, 5);
    expect(freshnessFactor(365)).toBeLessThan(0.2);
    // Monotonic: an older price is never worth more than a newer one.
    const points = [0, 7, 30, 90, 180, 365].map(freshnessFactor);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it('treats an unknown age as a season old, not as fresh', () => {
    expect(freshnessFactor(null)).toBe(0.5);
    expect(freshnessFactor(null)).toBeLessThan(freshnessFactor(0));
  });
});

describe('which source wins', () => {
  it('prefers a live scrape when everything is equally fresh', () => {
    const sources = {
      scraped: { milk: scraped(2) },
      receipts: { milk: receipt(1, 0) },
      history: { milk: checked(1, 0) },
      observed: { milk: observed(1, 0) },
    };
    const out = resolvePrice('milk', sources, { now: NOW });
    expect(out.source).toBe('scraped');
    // The others are kept, because seeing the disagreement is the point.
    expect(out.alternatives).toHaveLength(3);
  });

  it('lets a fresh receipt beat a stale community report', () => {
    const sources = {
      receipts: { milk: receipt(1.1, 3) },
      observed: { milk: observed(1.8, 200) },
    };
    expect(resolvePrice('milk', sources, { now: NOW }).source).toBe('recorded');
  });

  it('lets a recent check beat a very old receipt', () => {
    const sources = {
      receipts: { milk: receipt(1.1, 400) },
      history: { milk: checked(1.5, 2) },
    };
    expect(resolvePrice('milk', sources, { now: NOW }).source).toBe('checked');
  });

  it('ranks a receipt above an earlier check at the same age', () => {
    // Your own receipt is certainly the product you meant; a scrape is a
    // search result that merely looked right.
    const sources = { receipts: { milk: receipt(1, 10) }, history: { milk: checked(1, 10) } };
    expect(resolvePrice('milk', sources, { now: NOW }).source).toBe('recorded');
  });

  it('scores by weight and freshness together, not by rank alone', () => {
    const fresh = scoreCandidate({ source: 'observed', date: at(0) }, NOW);
    const old = scoreCandidate({ source: 'scraped', date: at(1000) }, NOW);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe('saying how much to trust it', () => {
  it('calls a live scrape checked just now, whatever its timestamp', () => {
    expect(confidenceOf({ source: 'scraped', date: at(0) }, NOW))
      .toMatchObject({ level: 'high', label: 'checked just now' });
  });

  it.each([
    [3, 'high'],
    [30, 'medium'],
    [120, 'low'],
    [400, 'stale'],
  ])('grades a %i-day-old recorded price as %s', (days, level) => {
    expect(confidenceOf({ source: 'recorded', date: at(days) }, NOW).level).toBe(level);
  });

  it('never lets an old price present itself as a fresh one', () => {
    const out = resolvePrice('milk', { receipts: { milk: receipt(1, 200) } }, { now: NOW });
    expect(out.confidence.level).toBe('stale');
    expect(out.sourceLabel).toBe('You paid this');
    expect(out.sourceLabel).not.toMatch(/live/i);
  });
});

describe('refusing to invent a price', () => {
  it('reports nothing known rather than filling the gap', () => {
    const out = resolvePrice('saffron', {}, { now: NOW });
    expect(out).toMatchObject({ resolved: false, price: null });
    expect(out.reason).toMatch(/No price known/i);
    expect(out.candidates).toEqual([]);
  });

  it('ignores a zero or negative price rather than treating it as free', () => {
    const sources = { receipts: { milk: receipt(0, 1) }, observed: { milk: observed(-2, 1) } };
    expect(resolvePrice('milk', sources, { now: NOW }).resolved).toBe(false);
  });

  it('needs a usable name', () => {
    expect(candidatesFor('', {}, { now: NOW })).toEqual([]);
  });
});

describe('flagging sources that disagree', () => {
  it('raises a flag when two sources are more than half apart', () => {
    // Usually a mis-matched product rather than a real price move.
    const sources = { scraped: { milk: scraped(12) }, receipts: { milk: receipt(1.1, 1) } };
    expect(resolvePrice('milk', sources, { now: NOW }).disagreement).toBe(true);
  });

  it('stays quiet when they broadly agree', () => {
    const sources = { scraped: { milk: scraped(1.45) }, receipts: { milk: receipt(1.3, 1) } };
    expect(resolvePrice('milk', sources, { now: NOW }).disagreement).toBe(false);
  });

  it('has nothing to disagree with on a single source', () => {
    expect(resolvePrice('milk', { scraped: { milk: scraped(2) } }, { now: NOW }).disagreement).toBe(false);
  });
});

describe('resolving a whole list', () => {
  const items = [{ name: 'Milk' }, { name: 'Bread' }, { name: 'Eggs' }, { name: 'Rice' }, { name: 'Saffron' }];
  const sources = {
    scraped: { [k('Milk')]: scraped(1.45) },
    receipts: { [k('Bread')]: receipt(1, 180) },
    history: { [k('Eggs')]: checked(2.2, 2) },
    observed: { [k('Rice')]: observed(1.8, 57) },
  };

  it('prices everything any source knows about, from four different sources', () => {
    const out = resolveList(items, sources, { now: NOW });
    expect(out.resolved).toBe(4);
    expect(out.total).toBe(5);
    expect(out.coverage).toBe(80);
    expect(out.bySource).toEqual({ scraped: 1, recorded: 1, checked: 1, observed: 1 });
  });

  it('totals only what it actually knows', () => {
    const out = resolveList(items, sources, { now: NOW });
    expect(out.estimatedTotal).toBe(6.45);
  });

  it('says how much of the total is genuinely live', () => {
    // The total must not borrow the authority of its freshest row.
    expect(resolveList(items, sources, { now: NOW }).liveShare).toBe(25);
  });

  it('reaches full coverage once a source covers every item', () => {
    const full = Object.fromEntries(items.map((item) => [k(item.name), receipt(1, 5)]));
    const out = resolveList(items, { receipts: full }, { now: NOW });
    expect(out.coverage).toBe(100);
    expect(out.resolved).toBe(out.total);
    expect(out.liveShare).toBe(0);
  });

  it('handles an empty list without dividing by zero', () => {
    expect(resolveList([], sources, { now: NOW })).toMatchObject({ coverage: 0, liveShare: 0, estimatedTotal: 0 });
  });

  it('keys receipts the way every other source is keyed', () => {
    // Plural on the list, singular in the store: a mismatch here silently
    // loses a whole source.
    const byKey = receiptsByKey([{ name: 'Eggs', points: [{ date: at(1), price: 2 }] }]);
    expect(byKey[k('Eggs')]).toBeTruthy();
    expect(resolvePrice('Eggs', { receipts: byKey }, { now: NOW }).price).toBe(2);
  });
});
