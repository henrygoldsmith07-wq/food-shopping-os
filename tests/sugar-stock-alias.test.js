import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('sugar types and stock/broth wordings', () => {
  it.each([
    ['caster sugar', 'superfine sugar'], ['brown sugar', 'light soft brown sugar'],
    ['dark brown sugar', 'brown sugar'], ['granulated sugar', 'sugar'],
    ['chicken stock', 'chicken broth'], ['vegetable stock', 'veg stock'],
    ['beef stock cube', 'beef broth'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it.each([
    ['caster sugar', 'brown sugar'], ['brown sugar', 'sugar'], ['caster sugar', 'sugar'],
    ['chicken stock', 'beef stock'],
  ])('%s is not %s', (a, b) => expect(canonicalName(a)).not.toBe(canonicalName(b)));
});
