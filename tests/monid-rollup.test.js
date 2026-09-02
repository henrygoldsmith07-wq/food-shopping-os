import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearMonidRollup, monidRollup, recordMonidOutcomes } from '../src/lib/monid-rollup.js';

/**
 * The week's worth tally.
 *
 * The counts are of items, not rows, one day at a time, trailing seven — and
 * a week in which Monid was never asked must not dress itself up as data.
 */

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

describe('recordMonidOutcomes', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => clearMonidRollup());

  it('counts items, not rows, and only what Monid was asked about', () => {
    const store = recordMonidOutcomes({
      beans: { name: 'beans', monid: { status: 'ok', rows: 3 } }, // filled
      milk: { name: 'milk', monid: { status: 'no-match', rows: 0 } }, // asked, nothing there
      eggs: { name: 'eggs', monid: null }, // never asked — invisible
      bread: { name: 'bread', monid: { status: 'disabled', paused: true, rows: 0 } }, // paused
    });
    expect(store[day(0)]).toEqual({ filled: 1, missed: 1, failed: 0, paused: 1 });
  });

  it('counts rows-without-prices as filled-nothing, and failures as the rung\u2019s fault', () => {
    const store = recordMonidOutcomes({
      beans: { name: 'beans', monid: { status: 'ok', rows: 0 } }, // answered empty = miss
      milk: { name: 'milk', monid: { status: 'timeout', rows: 0 } }, // the rung's fault
    });
    expect(store[day(0)]).toEqual({ filled: 0, missed: 1, failed: 1, paused: 0 });
  });

  it('accumulates across runs in a day and prunes past the week', () => {
    const stale = { [day(9)]: { filled: 50, missed: 0, failed: 0, paused: 0 } };
    localStorage.setItem('forq.monidRollup.v1', JSON.stringify(stale));
    recordMonidOutcomes({ beans: { monid: { status: 'ok', rows: 1 } } });
    recordMonidOutcomes({ milk: { monid: { status: 'no-match', rows: 0 } } });
    const store = recordMonidOutcomes({ eggs: { monid: { status: 'ok', rows: 2 } } });
    expect(store[day(0)]).toEqual({ filled: 2, missed: 1, failed: 0, paused: 0 });
    expect(store[day(9)]).toBeUndefined(); // outside the trailing week
  });

  it('writes nothing when Monid was never asked', () => {
    const before = localStorage.getItem('forq.monidRollup.v1');
    recordMonidOutcomes({ beans: { monid: null }, milk: { name: 'milk' } });
    expect(localStorage.getItem('forq.monidRollup.v1')).toBe(before);
  });
});

describe('monidRollup', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => clearMonidRollup());

  it('covers every day of the trailing week, oldest first, with totals', () => {
    recordMonidOutcomes(
      { beans: { monid: { status: 'ok', rows: 1 } }, milk: { monid: { status: 'no-match', rows: 0 } } },
      { date: day(2) },
    );
    const rollup = monidRollup();
    expect(rollup.days).toHaveLength(7);
    expect(rollup.days[0].date < rollup.days[6].date).toBe(true);
    expect(rollup.days[4]).toEqual({ date: day(2), filled: 1, missed: 1, failed: 0, paused: 0 });
    expect(rollup.totals).toEqual({ filled: 1, missed: 1, failed: 0, paused: 0 });
  });

  it('reports an empty, honest week when nothing was ever asked', () => {
    const rollup = monidRollup();
    expect(rollup.totals).toEqual({ filled: 0, missed: 0, failed: 0, paused: 0 });
  });
});
