import { describe, expect, it } from 'vitest';
import { pantryCoverageOf } from '../src/lib/pantry-coverage.js';

const recipe = (ingredients) => ({ ingredients });

describe('pantryCoverageOf', () => {
  it('returns zeroes for a recipe with no ingredients', () => {
    expect(pantryCoverageOf(recipe([]), new Set())).toEqual({ have: 0, total: 0, pct: 0, missing: [] });
  });
  it('uses name presence when no rows are given', () => {
    const r = pantryCoverageOf(recipe([{ name: 'Rice' }, { name: 'Eggs' }]), new Set(['rice']));
    expect(r.have).toBe(1);
    expect(r.pct).toBe(50);
    expect(r.missing.map((m) => m.name)).toEqual(['Eggs']);
  });
  it('accepts an array of names', () => {
    expect(pantryCoverageOf(recipe([{ name: 'rice' }]), ['rice']).have).toBe(1);
  });
  it('reports a quantity shortfall', () => {
    const rows = [{ name: 'Rice', qty: '200 g' }];
    const r = pantryCoverageOf(recipe([{ name: 'Rice', qty: '500 g' }]), new Set(['rice']), { pantry: rows });
    expect(r.have).toBe(0);
    expect(r.missing[0].shortOf).toBe('500 g');
  });
  it('adds two rows together to cover a need', () => {
    const rows = [{ name: 'Rice', qty: '400 g' }, { name: 'Rice', qty: '400 g' }];
    const r = pantryCoverageOf(recipe([{ name: 'Rice', qty: '700 g' }]), new Set(['rice']), { pantry: rows });
    expect(r.have).toBe(1);
  });
  it('does not claim a shortage when the row has no readable quantity', () => {
    const rows = [{ name: 'Rice', qty: 'some' }];
    const r = pantryCoverageOf(recipe([{ name: 'Rice', qty: '500 g' }]), new Set(['rice']), { pantry: rows });
    expect(r.have).toBe(1);
  });
});
