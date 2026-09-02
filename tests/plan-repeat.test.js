import { describe, it, expect } from 'vitest';
import { repeatLastWeek, lastWeekDinners, lastWeekDinnerCount, thisWeekDinnerCount, lastWeekSummary } from '../src/lib/plan-repeat.js';

/**
 * Copying last week must mean the previous Monday–Sunday — not the trailing
 * seven days, which would silently skip Monday's dinner on any mid-week day.
 * It must never overwrite a slot this week already holds, and it must say
 * honestly how many dinners moved.
 */
const MONDAY = '2026-08-31';
const TUESDAY = '2026-09-01';
const LAST_WEEK = {
  '2026-08-24': { dinner: 'r-mon' },
  '2026-08-25': { dinner: 'r-tue' },
  '2026-08-30': { dinner: 'r-sun' },
};

describe('copying last week\'s plan', () => {
  it('maps the previous Monday–Sunday, so a Tuesday still gets Monday\'s dinner', () => {
    const result = repeatLastWeek(LAST_WEEK, TUESDAY);
    expect(result.count).toBe(3);
    expect(result.plan[MONDAY].dinner).toBe('r-mon');
    expect(result.plan[TUESDAY].dinner).toBe('r-tue');
    expect(result.plan['2026-09-06'].dinner).toBe('r-sun');
  });

  it('never overwrites a dinner this week already holds', () => {
    const plan = { ...LAST_WEEK, [TUESDAY]: { dinner: 'already-decided' } };
    const result = repeatLastWeek(plan, TUESDAY);
    expect(result.plan[TUESDAY].dinner).toBe('already-decided');
  });

  it('leaves other slots on the target day untouched', () => {
    const plan = { ...LAST_WEEK, [MONDAY]: { lunch: 'kept' } };
    const result = repeatLastWeek(plan, TUESDAY);
    expect(result.plan[MONDAY].dinner).toBe('r-mon');
    expect(result.plan[MONDAY].lunch).toBe('kept');
  });

  it('says nothing is available when last week was empty', () => {
    const result = repeatLastWeek({}, TUESDAY);
    expect(result.count).toBe(0);
    expect(result.status).toBeNull();
    expect(result.plan).toEqual({});
  });

  it('counts and summarise honestly, pluralising only real plurals', () => {
    expect(lastWeekDinnerCount(LAST_WEEK, TUESDAY)).toBe(3);
    expect(lastWeekSummary(LAST_WEEK, TUESDAY)).toContain('3 dinners');
    expect(lastWeekSummary({ [LAST_WEEK && '2026-08-24']: { dinner: 'r' } }, TUESDAY)).toContain('1 dinner ');
    expect(lastWeekSummary({}, TUESDAY)).toBeNull();
  });

  it('counts a week in progress for the offer guard', () => {
    expect(thisWeekDinnerCount({ [MONDAY]: { dinner: 'r' }, [TUESDAY]: {} }, [MONDAY, TUESDAY, '2026-09-02'])).toBe(1);
    expect(lastWeekDinners(LAST_WEEK, TUESDAY)).toHaveLength(3);
  });
});
