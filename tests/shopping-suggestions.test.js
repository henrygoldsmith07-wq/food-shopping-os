import { describe, expect, it } from 'vitest';
import {
  LEARNING_MIN_SAMPLES,
  averageBoughtByIngredient,
  deletedItemSuggestions,
  quantitySuggestions,
  skippedMealSuggestions,
} from '../src/lib/shopping-suggestions.js';

describe('household learning suggestions — transparent,_thresholded, deterministic', () => {
  it('suggests less/more only with enough samples and a material gap', () => {
    const shops = [1, 2, 3, 4].map((n) => ({
      date: `2026-09-0${n}`, items: [{ name: 'Milk', qty: '1 litre' }],
    }));
    const list = [{ id: 's1', name: 'Milk', qty: '2 litres' }];
    const found = quantitySuggestions(list, shops);
    expect(found).toHaveLength(1);
    expect(found[0].direction).toBe('less');
    expect(found[0].evidence).toMatch(/previous 4 shops averaged/);
    expect(found[0].confidence).toBe('medium');
    // Two shops is weak evidence: no suggestion.
    expect(quantitySuggestions(list, shops.slice(0, 2))).toEqual([]);
    // A 5% gap is noise: no suggestion even with samples.
    expect(quantitySuggestions([{ id: 's1', name: 'Milk', qty: '1 litre' }], shops)).toEqual([]);
  });

  it('flags repeatedly skipped meals and repeatedly deleted items', () => {
    const plan = Object.fromEntries([1, 2, 3, 4].map((n) => [`2026-09-0${n}`, { dinner: 'r-chilli' }]));
    expect(skippedMealSuggestions(plan, [])[0]).toMatchObject({ recipeId: 'r-chilli', planned: 4 });
    expect(skippedMealSuggestions(plan, [{ recipeId: 'r-chilli' }, { recipeId: 'r-chilli' }, { recipeId: 'r-chilli' }])).toEqual([]);
    const deletions = ['Coriander', 'coriander', 'CORIANDER', 'Coriander'];
    expect(deletedItemSuggestions(deletions)[0]).toMatchObject({ kind: 'repeated-deletion', samples: 4 });
    expect(deletedItemSuggestions(['Coriander'])).toEqual([]);
  });

  it('is deterministic and honours the minimum-sample floor', () => {
    expect(LEARNING_MIN_SAMPLES).toBe(3);
    const shops = [1, 2, 3].map((n) => ({ date: `2026-09-0${n}`, items: [{ name: 'Eggs', qty: '12' }] }));
    const list = [{ id: 's1', name: 'Eggs', qty: '6' }];
    const a = JSON.stringify(quantitySuggestions(list, shops));
    const b = JSON.stringify(quantitySuggestions(list, shops));
    expect(a).toBe(b);
    expect(averageBoughtByIngredient(shops).get('eggs')?.mean).toBe(12);
  });
});
