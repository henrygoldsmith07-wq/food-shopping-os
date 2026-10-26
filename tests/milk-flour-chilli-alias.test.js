import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('milk, flour and chilli types stay separate lines', () => {
  it.each([
    ['whole milk', 'full fat milk'], ['skimmed milk', 'skim milk'],
    ['self raising flour', 'self-rising flour'], ['wholemeal flour', 'whole wheat flour'],
    ['chilli powder', 'chili powder'], ['chilli flakes', 'red pepper flakes'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it.each([
    ['whole milk', 'milk'], ['skimmed milk', 'milk'], ['whole milk', 'skimmed milk'],
    ['self raising flour', 'plain flour'], ['wholemeal flour', 'plain flour'],
    ['chilli powder', 'chilli flakes'],
  ])('%s is not %s', (a, b) => expect(canonicalName(a)).not.toBe(canonicalName(b)));
  it('plain milk and semi-skimmed still merge', () => expect(canonicalName('milk')).toBe(canonicalName('semi skimmed milk')));
});
