import { describe, it, expect } from 'vitest';
import { mergeQtys } from '../src/lib/pantry.js';
import { shortfallQuantity } from '../src/lib/pantry-intelligence.js';

describe('loose counts share a scale', () => {
  it('adds a dozen to loose eggs', () => {
    expect(mergeQtys('2 eggs', '1 dozen', { ingredient: 'eggs' })).toBe('14 eggs');
  });
  it('shortfall of a dozen with 2 eggs at home is 10 eggs', () => {
    expect(shortfallQuantity('2 eggs', '1 dozen', { ingredient: 'eggs' })).toMatch(/^10/);
  });
  it('does not mix tins with eggs', () => {
    expect(mergeQtys('2 tins', '2 eggs', { ingredient: 'x' })).toContain('+');
  });
});
