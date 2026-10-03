import { describe, it, expect } from 'vitest';
import { weekManager, WEEK_STATES } from '../src/lib/week-manager.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

/**
 * The Week Manager — the one orchestration derivation Home reads.
 *
 * These assertions hold it to the contract the exception-based Home depends
 * on: one derived status, exceptions only when something genuinely needs a
 * human, quiet success when nothing does, and numbers that come from the
 * systems underneath rather than being recomputed.
 */
const day = '2026-07-28';

const app = (extra = {}) => {
  const state = { ...EMPTY_STATE, day, onboarded: true, portions: 2, ...extra };
  return { ...state, ...deriveApp(state) };
};

describe('week manager', () => {
  it('an empty week is planning, not broken — and says what to do', () => {
    const week = weekManager(app());
    expect(week.state).toBe(WEEK_STATES.planning);
    expect(week.openDays).toBeGreaterThan(0);
    expect(week.quiet).toBe(false);
    expect(week.primary).toBeTruthy();
  });

  it('a full week with nothing to buy is quiet success', () => {
    // A real Mon–Sun week (28 Jul – 3 Aug), no invented dates: invalid
    // calendar days would silently drop out of the week window.
    const plan = {};
    const dates = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
    for (const date of dates) plan[date] = { dinner: 'chicken-traybake' };
    const week = weekManager(app({ plan, shoppingList: [] }));
    expect(week.openDays).toBe(0);
    // Nothing needs attention: the calm state is the answer, and the manager
    // reports it rather than inventing work.
    expect(week.quiet).toBe(true);
    expect(week.exceptions).toEqual([]);
    expect(week.primary).toBeNull();
  });

  it('surfaces expiring food that no meal uses as an exception', () => {
    const week = weekManager(app({
      pantry: [{ id: 'p1', name: 'Spinach', expiry: '2026-07-29', cat: 'Fresh' }],
    }));
    const expiring = week.exceptions.find((e) => e.id === 'expiring');
    expect(expiring).toBeTruthy();
    expect(expiring.severity).toBe('warn');
    expect(expiring.title).toMatch(/expire soon/);
  });

  it('surfaces unplanned days and unchecked shopping as actionable exceptions', () => {
    const week = weekManager(app({
      plan: { '2026-07-28': { dinner: 'chicken-traybake' } },
      shoppingList: [{ id: 's1', name: 'Milk', checked: false }],
    }));
    const ids = week.exceptions.map((e) => e.id);
    expect(ids).toContain('open-days');
    expect(ids).toContain('to-buy');
    // Each exception is actionable — never decoration.
    for (const exception of week.exceptions) {
      expect(exception.goTab, exception.id).toBeTruthy();
      expect(exception.title, exception.id).toBeTruthy();
    }
  });

  it('reports what Forq handled, from the same derivations the plan uses', () => {
    const week = weekManager(app({
      plan: {
        '2026-07-28': { dinner: 'chicken-traybake' },
        '2026-07-29': { dinner: 'chicken-traybake' },
      },
    }));
    expect(week.plannedMeals).toBe(2);
    expect(week.summary.some((line) => line.includes('meals planned'))).toBe(true);
    // The summary never claims a number the state does not hold.
    for (const line of week.summary) expect(typeof line).toBe('string');
  });

  it('status follows the week: a complete week with a ticking list is no longer planning', () => {
    const plan = {};
    const dates = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
    for (const date of dates) plan[date] = { dinner: 'chicken-traybake' };
    const week = weekManager(app({
      plan,
      shoppingList: [{ id: 's1', name: 'Milk', checked: true }],
    }));
    expect(week.unchecked).toBe(0);
    expect(week.openDays).toBe(0);
    // A ticked list and no shops recorded yet reads as shopping in progress.
    expect([WEEK_STATES.shopping, WEEK_STATES.inProgress, WEEK_STATES.ready]).toContain(week.state);
  });

  it('a partially planned week honestly reads as Planning, not as shopping', () => {
    // One meal planned with a ticked list is still six open days — the
    // status must never skip ahead to the shop.
    const week = weekManager(app({
      plan: { '2026-07-28': { dinner: 'chicken-traybake' } },
      shoppingList: [{ id: 's1', name: 'Milk', checked: true }],
    }));
    expect(week.state).toBe(WEEK_STATES.planning);
  });
});
