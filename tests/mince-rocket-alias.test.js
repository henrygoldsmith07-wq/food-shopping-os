import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('mince and rocket wordings', () => {
  it.each(['rocket', 'arugula', 'wild rocket'])('%s -> Rocket, not Lettuce', (n) => {
    expect(canonicalName(n)).toBe('rocket');
  });
  it.each([['mince', 'beef mince'], ['ground beef', 'beef mince'], ['ground chicken', 'chicken mince'], ['ground turkey', 'turkey mince'], ['ground pork', 'pork mince'], ['minced pork', 'pork mince']])('%s -> %s', (a, b) => {
    expect(canonicalName(a)).toBe(b);
  });
});
