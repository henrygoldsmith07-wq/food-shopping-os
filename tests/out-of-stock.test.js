import { describe, expect, it } from 'vitest';
import { carryOverSummary, isOutOfStock, outOfStockLine, outOfStockPatch, outOfStockRows, substituteChoices } from '../src/lib/out-of-stock.js';

describe('out of stock', () => {
  it('toggles and ignores ticked rows', () => {
    const on = outOfStockPatch({ name: 'Milk' }, 5);
    expect(on).toEqual({ outOfStock: true, outOfStockAt: 5 });
    expect(outOfStockPatch({ outOfStock: true })).toEqual({ outOfStock: false, outOfStockAt: null });
    expect(isOutOfStock({ outOfStock: true, checked: true })).toBe(false);
  });
  it('lists flagged rows oldest first and summarises', () => {
    const list = [{ name: 'B', outOfStock: true, outOfStockAt: 2 }, { name: 'A', outOfStock: true, outOfStockAt: 1 }, { name: 'C' }];
    expect(outOfStockRows(list).map((r) => r.name)).toEqual(['A', 'B']);
    expect(carryOverSummary(list)).toContain('2 items not found: A, B');
    expect(carryOverSummary([{ name: 'C' }])).toBeNull();
  });
  it('names the affected meal and offers table substitutes without duplicates', () => {
    expect(outOfStockLine({ name: 'Feta', fromRecipe: 'Greek bowl' })).toContain('Greek bowl');
    const choices = substituteChoices({ name: 'Feta' }, [{ name: 'Firm tofu' }]);
    expect(choices.map((c) => c.name)).toEqual(['Firm tofu']);
    expect(substituteChoices({ name: 'Zzz' })).toEqual([]);
  });
});
