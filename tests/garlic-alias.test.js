import { describe, it, expect } from 'vitest';
import { canonicalName, sameIngredient } from '../src/lib/aliases.js';

describe('garlic spellings resolve to one ingredient', () => {
  it.each(['garlic clove', 'Garlic cloves', 'clove of garlic', 'cloves garlic', 'fresh garlic', 'garlic bulb'])('%s -> Garlic', (n) => {
    expect(canonicalName(n)).toBe('garlic');
    expect(sameIngredient(n, 'Garlic')).toBe(true);
  });
});
