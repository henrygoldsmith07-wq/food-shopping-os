import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('more wordings merge on the shopping list', () => {
  it.each([
    ['boneless chicken thighs', 'chicken thighs'], ['dried spaghetti', 'penne'],
    ['broccoli florets', 'broccoli'], ['root ginger', 'fresh ginger'],
    ['juice of lemon', 'lemon'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('does not merge different things', () => {
    expect(canonicalName('dried pasta')).not.toBe(canonicalName('rice'));
    expect(canonicalName('chicken thighs')).not.toBe(canonicalName('chicken breast'));
  });
});
