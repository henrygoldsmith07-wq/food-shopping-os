import { describe, it, expect } from 'vitest';
import { rowEstimate, estimateBasket } from '../src/lib/basket-estimate.js';
import { shoppingNameKey } from '../src/lib/shopping-names.js';

const key = shoppingNameKey('zzz unlisted widget');

describe('rowEstimate', () => {
  it('your own price always wins over live and observed evidence', () => {
    const live = { [key]: { best: { price: 9, retailer: 'Tesco' } } };
    expect(rowEstimate({ name: 'zzz unlisted widget', price: 2 }, { live })).toMatchObject({ price: 2, source: 'yours' });
  });
  it('prefers a live shop price over a community observation', () => {
    const ev = { live: { [key]: { best: { price: 3, retailer: 'Aldi' } } }, observed: { [key]: { price: 5, store: 'Lidl' } } };
    expect(rowEstimate({ name: 'zzz unlisted widget' }, ev)).toMatchObject({ price: 3, source: 'live', label: 'Aldi, live' });
  });
  it('falls back to an observation, ignoring errored ones', () => {
    expect(rowEstimate({ name: 'zzz unlisted widget' }, { observed: { [key]: { price: 5, store: 'Lidl' } } })).toMatchObject({ source: 'observed', label: 'seen at Lidl' });
    expect(rowEstimate({ name: 'zzz unlisted widget' }, { observed: { [key]: { price: 5, error: true } } })).toBeNull();
  });
  it('returns null when nothing is known', () => {
    expect(rowEstimate({ name: 'zzz unlisted widget' })).toBeNull();
    expect(rowEstimate(undefined)).toBeNull();
  });
});

describe('estimateBasket', () => {
  it('splits known from estimated and counts unknown rows', () => {
    const items = [
      { name: 'zzz unlisted widget', price: 1.5 },
      { name: 'zzz unlisted widget' },
      { name: 'zzz other thing' },
    ];
    const live = { [key]: { best: { price: 2.25 } } };
    const r = estimateBasket(items, { live });
    expect(r).toMatchObject({ known: 1.5, estimated: 2.25, total: 3.75, estimatedCount: 1, unknownCount: 1 });
    expect(r.sources.live).toBe(1);
  });
  it('handles an empty list', () => {
    expect(estimateBasket()).toMatchObject({ known: 0, estimated: 0, total: 0, unknownCount: 0 });
  });
});
