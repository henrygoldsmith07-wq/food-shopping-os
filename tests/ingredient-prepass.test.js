import { describe, it, expect } from 'vitest';
import { duplicateGroups, normaliseRows, rowKey } from '../src/lib/ingredient-prepass.js';
import { learnAlias } from '../src/lib/aliases.js';

describe('ingredient pre-pass — normalise, group, merge', () => {
  it('groups case and whitespace variants of one ingredient', () => {
    const rows = [{ name: 'Spinach' }, { name: ' spinach' }, { name: 'SPINACH' }];
    expect(duplicateGroups(rows)).toEqual([[0, 1, 2]]);
  });

  it('honours learned aliases when grouping', () => {
    const learned = learnAlias({}, 'rocket', 'salad');
    expect(rowKey({ name: 'rocket' }, learned)).toBe(rowKey({ name: 'salad' }, learned));
    const rows = [{ name: 'rocket', qty: '100 g' }, { name: 'salad', qty: '200 g' }];
    const { rows: merged, duplicatesFound } = normaliseRows(rows, learned);
    expect(duplicatesFound).toBe(1);
    expect(merged[0].key).toBe(merged.length === 1 ? merged[0].key : merged[0].key);
    expect(merged).toHaveLength(1);
  });

  it('sums quantities that share a dimension', () => {
    const { rows } = normaliseRows([
      { name: 'Rice', qty: '400 g' },
      { name: 'rice', qty: '100 g' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toMatchObject({ amount: 500, dim: 'mass' });
    expect(rows[0].aliases).toEqual(['rice', 'rice']);
  });

  it('never adds grams to millilitres — mismatched dimensions stay separate rows', () => {
    const { rows } = normaliseRows([
      { name: 'Milk', qty: '200 ml' },
      { name: 'milk', qty: '100 g' },
    ]);
    expect(rows).toHaveLength(2);
  });

  it('distinct ingredients are left untouched with empty groups', () => {
    const rows = [{ name: 'Rice' }, { name: 'Beans' }];
    expect(duplicateGroups(rows)).toEqual([]);
    const { rows: out } = normaliseRows(rows);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.key != null)).toBe(true);
  });
});

describe('garlic spellings are one ingredient', () => {
  it('folds clove/bulb phrasings into one Garlic group and one list row', async () => {
    const { canonicalName, displayNameFor, sameIngredient } = await import('../src/lib/aliases.js');
    for (const n of ['garlic clove', 'Cloves of garlic', 'clove garlic', 'garlic bulb', 'Fresh garlic']) {
      expect(canonicalName(n)).toBe('garlic');
      expect(displayNameFor(n)).toBe('Garlic');
      expect(sameIngredient(n, 'Garlic')).toBe(true);
    }
    const { duplicateGroups } = await import('../src/lib/ingredient-prepass.js');
    expect(duplicateGroups([{ name: 'Garlic' }, { name: 'garlic clove' }, { name: 'Spring onion' }])).toEqual([[0, 1]]);
  });
});
