import { describe, expect, it } from 'vitest';
import { buildBatchSession, isPassiveStep } from '../src/lib/batch-session.js';

const rec = (name, steps) => ({ recipe: { id: name, name, steps } });
const pair = { id: 'x+y', shared: ['Garlic', 'Onion'], recipes: [rec('Curry', [{ text: 'Chop veg' }, { text: 'Simmer for 20 min', timerMins: 20 }, { text: 'Stir in spinach' }]), rec('Rice', [{ text: 'Rinse rice' }, 'Boil rice 12 min', 'Fluff'])] };

describe('buildBatchSession', () => {
  it('detects passive steps', () => {
    expect(isPassiveStep('Simmer gently')).toBe(true);
    expect(isPassiveStep({ text: 'Chop the onion' })).toBe(false);
  });
  it('starts with shared prep, ends with portioning, and keeps every real step once', () => {
    const s = buildBatchSession(pair);
    expect(s.steps[0].text).toContain('Garlic, Onion');
    expect(s.steps.at(-1).text).toMatch(/portion/i);
    expect(s.steps).toHaveLength(2 + 6);
    expect(s.steps.filter((x) => x.recipe === 'Curry').map((x) => x.text)).toEqual(['Chop veg', 'Simmer for 20 min', 'Stir in spinach']);
    expect(s.timedMinutes).toBe(20);
  });
  it('lets the other dish fill a simmer wait', () => {
    const s = buildBatchSession(pair).steps.map((x) => x.text);
    expect(s.indexOf('Rinse rice')).toBeGreaterThan(s.indexOf('Chop veg'));
    expect(s.indexOf('Boil rice 12 min')).toBeGreaterThan(s.indexOf('Simmer for 20 min'));
    expect(s.indexOf('Rinse rice')).toBeLessThan(s.indexOf('Stir in spinach'));
  });
  it('returns null without two recipes or steps', () => {
    expect(buildBatchSession(null)).toBeNull();
    expect(buildBatchSession({ recipes: [rec('a', []), rec('b', [])], shared: [] })).toBeNull();
  });
});
