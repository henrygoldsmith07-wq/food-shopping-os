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

describe('more everyday wordings merge on the shopping list', () => {
  it.each([
    ['spinach leaves', 'baby spinach'], ['cherry tomato', 'cherry tomatoes'],
    ['canned diced tomatoes', 'chopped tomatoes'], ['thyme sprigs', 'fresh thyme'], ['thyme', 'sprigs of thyme'],
    ['rosemary sprigs', 'fresh rosemary'], ['mint leaves', 'fresh mint'], ['tinned tuna', 'tuna chunks'],
    ['french beans', 'green beans'], ['whole wheat bread', 'wholemeal bread'], ['juice of lime', 'lime juice'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('keeps different things apart', () => {
    expect(canonicalName('runner beans')).not.toBe(canonicalName('green beans'));
    expect(canonicalName('tuna')).not.toBe(canonicalName('salmon'));
  });
});
