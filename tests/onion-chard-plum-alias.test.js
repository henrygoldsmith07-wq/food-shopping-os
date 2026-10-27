import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('onion, chicken breast, chard and plum tomato wordings', () => {
  it('yellow onion merges with onion', () => expect(canonicalName('yellow onion')).toBe(canonicalName('onion')));
  it.each(['skinless chicken breast', 'boneless skinless chicken breasts', 'boneless chicken breast'])('%s -> chicken breast', (n) => {
    expect(canonicalName(n)).toBe('chicken breast');
  });
  it('swiss and rainbow chard merge', () => {
    expect(canonicalName('swiss chard')).toBe(canonicalName('chard'));
    expect(canonicalName('rainbow chard')).toBe(canonicalName('chard'));
  });
  it('fresh plum tomatoes are not tinned chopped tomatoes', () => {
    expect(canonicalName('plum tomatoes')).not.toBe('chopped tomatoes');
  });
});
