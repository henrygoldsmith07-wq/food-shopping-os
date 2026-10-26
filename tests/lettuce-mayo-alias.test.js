import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('lettuce and mayonnaise wordings', () => {
  it.each([['romaine lettuce', 'lettuce'], ['cos lettuce', 'lettuce'], ['baby gem', 'lettuce'], ['mayo', 'mayonnaise'], ['Real Mayonnaise', 'mayonnaise']])('%s -> %s', (a, b) => {
    expect(canonicalName(a)).toBe(b);
  });
});
