import { describe, expect, it } from 'vitest';
import { canonicalName } from '../src/lib/aliases.js';

describe('parmesan and sweetcorn wordings', () => {
  it.each([
    ['parmesan', 'parmigiano reggiano'], ['grated parmesan', 'parmesan shavings'],
    ['sweetcorn', 'maize'], ['sweet corn', 'corn kernels'],
  ])('%s merges with %s', (a, b) => expect(canonicalName(a)).toBe(canonicalName(b)));
  it('parmesan is not cheddar', () => expect(canonicalName('parmesan')).not.toBe(canonicalName('cheddar')));
  it('sweetcorn is not cornflour', () => expect(canonicalName('sweetcorn')).not.toBe(canonicalName('cornflour')));
});
