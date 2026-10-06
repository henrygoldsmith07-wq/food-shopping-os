import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PRODUCT, PRIMARY_LOOP } from '../src/data/product.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('copy honesty: one promise, three steps, no invented capability', () => {
  it('uses the same sentence and three steps in README, demo, first-run and product source', () => {
    const sentence = 'Tell Forq what you are eating; it works out what to buy; it helps you waste less.';
    expect(PRODUCT.promise).toBe(sentence);
    expect(PRIMARY_LOOP.map((s) => s.name)).toEqual([
      'Plan meals', 'Buy exactly what you need', 'Waste less food',
    ]);
    const readme = read('../README.md');
    expect(readme).toContain(sentence);
    expect(readme).toContain('1. Plan meals');
    expect(readme).toContain('2. Buy exactly what you need');
    expect(readme).toContain('3. Waste less');
    const demo = read('../src/app/demo/page.jsx');
    expect(demo).toContain(sentence);
    const onboarding = read('../src/components/Onboarding.jsx');
    expect(onboarding).toContain(sentence);
    const scope = read('../docs/SCOPE.md');
    expect(scope).toContain(sentence);
  });

  it('does not claim a complete catalogue, live stock, or all-in-one food OS', () => {
    const banned = /complete UK catalogue|full supermarket range|live stock|live availability|all-in-one|food OS/i;
    for (const file of [
      '../README.md',
      '../src/app/demo/page.jsx',
      '../src/components/Onboarding.jsx',
      '../src/data/product.js',
      '../docs/SCOPE.md',
    ]) {
      const text = read(file);
      // SCOPE.md names the forbidden claims only to forbid them.
      if (file.endsWith('SCOPE.md')) {
        expect(text).toMatch(/Must never be claimed/);
        continue;
      }
      expect(text, file).not.toMatch(banned);
    }
    // SCOPE explicitly lists what must never be claimed.
    const scope = read('../docs/SCOPE.md');
    expect(scope).toMatch(/Full supermarket range or complete UK catalogue/);
    expect(scope).toMatch(/Live stock/);
    expect(scope).toMatch(/medical/i);
    expect(scope).toMatch(/allergen-free/i);
  });
});
