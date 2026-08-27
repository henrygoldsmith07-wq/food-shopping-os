import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIVE_PROVENANCE, liveMovementFor, liveMovements, liveMovementsForList, movementSentence,
} from '../src/lib/live-price-alerts.js';
import {
  DUE_AFTER_MS, clearDailyCheckState, dailyCheckDue, dailyCheckSettings, lastCheckLabel,
  recordDailyCheck, setDailyCheckEnabled,
} from '../src/lib/daily-price-check.js';

const point = (date, best, shops = { tesco: { price: best, retailer: 'Tesco' } }) => ({ date, best, shops });
const entry = (name, points) => ({ name, points });

describe('rises and falls in the prices the app checked itself', () => {
  it('says nothing about an item checked once — a price is not a trend', () => {
    const movement = liveMovementFor('Milk', entry('Milk', [point('2026-08-01', 1.2)]));
    expect(movement.kind).toBe('watching');
    expect(movement.reason).toMatch(/one more check/i);
  });

  it('has no opinion at all with no history', () => {
    expect(liveMovementFor('Milk', entry('Milk', []))).toBeNull();
    expect(liveMovementFor('Milk', null)).toBeNull();
  });

  it('flags a rise past the threshold and names the shop the latest price came from', () => {
    const movement = liveMovementFor('Milk', entry('Milk', [
      point('2026-08-01', 1.0),
      point('2026-08-02', 1.0),
      point('2026-08-03', 1.4, { asda: { price: 1.4, retailer: 'Asda' } }),
    ]));
    expect(movement.kind).toBe('rise');
    expect(movement.baseline).toBe(1);
    expect(movement.latest).toBe(1.4);
    expect(movement.pct).toBe(40);
    expect(movement.store).toBe('Asda');
    expect(movement.checks).toBe(3);
    expect(movement.since).toBe('2026-08-01');
  });

  it('flags a fall the same way, and reads as a bargain rather than a minus sign', () => {
    const movement = liveMovementFor('Bread', entry('Bread', [
      point('2026-08-01', 2.0),
      point('2026-08-02', 1.4),
    ]));
    expect(movement.kind).toBe('fall');
    expect(movement.pct).toBe(-30);
    expect(movementSentence(movement)).toMatch(/Down £0\.60 \(30%\) at Tesco/);
  });

  it('calls a small move steady rather than news', () => {
    const movement = liveMovementFor('Eggs', entry('Eggs', [
      point('2026-08-01', 2.0),
      point('2026-08-02', 2.1),
    ]));
    expect(movement.kind).toBe('steady');
    expect(movement.pct).toBe(5);
  });

  it('obeys the thresholds the user already tuned, including per-item ones', () => {
    const points = [point('2026-08-01', 2.0), point('2026-08-02', 2.2)];
    expect(liveMovementFor('Eggs', entry('Eggs', points), { risePct: 5 }).kind).toBe('rise');
    expect(liveMovementFor('Eggs', entry('Eggs', points), {
      // Overrides are keyed the way the rest of the app keys item names.
      risePct: 5, overrides: { egg: { risePct: 40 } },
    }).kind).toBe('steady');
  });

  it('measures against the median of earlier checks, not just the previous one', () => {
    // One freak cheap day should not make an ordinary price look like a rise.
    const movement = liveMovementFor('Milk', entry('Milk', [
      point('2026-08-01', 1.2),
      point('2026-08-02', 0.6),
      point('2026-08-03', 1.2),
      point('2026-08-04', 1.25),
    ]));
    expect(movement.baseline).toBe(1.2);
    expect(movement.kind).toBe('steady');
  });

  it('never presents a live movement as a receipt', () => {
    const movement = liveMovementFor('Milk', entry('Milk', [point('2026-08-01', 1.0), point('2026-08-02', 1.5)]));
    expect(movement.provenance).toBe(LIVE_PROVENANCE);
    expect(movement.provenance).toMatch(/shop pages/i);
    expect(movement.provenance).not.toMatch(/receipt/i);
  });

  it('sorts the biggest rise and the deepest fall to the top and counts the rest', () => {
    const store = {
      milk: entry('Milk', [point('2026-08-01', 1.0), point('2026-08-02', 1.3)]),
      bread: entry('Bread', [point('2026-08-01', 1.0), point('2026-08-02', 2.0)]),
      jam: entry('Jam', [point('2026-08-01', 2.0), point('2026-08-02', 1.0)]),
      eggs: entry('Eggs', [point('2026-08-01', 2.0), point('2026-08-02', 2.02)]),
      tea: entry('Tea', [point('2026-08-01', 2.0)]),
    };
    const moved = liveMovements(store);
    expect(moved.rises.map((r) => r.name)).toEqual(['Bread', 'Milk']);
    expect(moved.falls.map((f) => f.name)).toEqual(['Jam']);
    expect(moved.summary).toEqual({
      rises: 2, falls: 1, steady: 1, watching: 1, tracked: 5,
    });
  });

  it('keys movements to a shopping list, and only the ones worth warning about', () => {
    const store = {
      milk: entry('Milk', [point('2026-08-01', 1.0), point('2026-08-02', 1.5)]),
      eggs: entry('Eggs', [point('2026-08-01', 2.0), point('2026-08-02', 2.02)]),
    };
    const byKey = liveMovementsForList([{ name: 'Milk' }, { name: 'Eggs' }, { name: 'Ham' }], store);
    expect(Object.keys(byKey)).toEqual(['milk']);
    expect(byKey.milk.kind).toBe('rise');
  });
});

describe('checking once a day without anyone remembering to', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDailyCheckState();
  });

  it('is off until it is switched on', () => {
    expect(dailyCheckSettings().enabled).toBe(false);
    expect(dailyCheckDue({ itemCount: 3 })).toMatchObject({ due: false, reason: 'off' });
    expect(setDailyCheckEnabled(true).enabled).toBe(true);
    expect(dailyCheckDue({ itemCount: 3 })).toMatchObject({ due: true, reason: 'never-run' });
  });

  it('never fires into a dead connection, offline mode, or an empty list', () => {
    setDailyCheckEnabled(true);
    expect(dailyCheckDue({ itemCount: 0 })).toMatchObject({ due: false, reason: 'empty-list' });
    expect(dailyCheckDue({ itemCount: 3, offlineMode: true })).toMatchObject({ due: false, reason: 'offline-mode' });
    expect(dailyCheckDue({ itemCount: 3, online: false })).toMatchObject({ due: false, reason: 'offline' });
  });

  it('waits for the day to pass, then goes again', () => {
    setDailyCheckEnabled(true);
    const now = Date.parse('2026-08-20T09:00:00Z');
    recordDailyCheck({ priced: 4, total: 5 }, now);
    expect(dailyCheckDue({ itemCount: 3, now: now + 3600000 })).toMatchObject({ due: false, reason: 'too-soon' });
    expect(dailyCheckDue({ itemCount: 3, now: now + DUE_AFTER_MS })).toMatchObject({ due: true, reason: 'due' });
  });

  it('comes due before a full day so the check does not drift later each morning', () => {
    // A 09:05 check that waited a full 24h would miss tomorrow's 09:00 open,
    // then the next day's, until "daily" had slid into the afternoon.
    expect(DUE_AFTER_MS).toBeLessThan(24 * 60 * 60 * 1000);
    setDailyCheckEnabled(true);
    const now = Date.parse('2026-08-20T09:05:00Z');
    recordDailyCheck({}, now);
    const tomorrow = Date.parse('2026-08-21T09:00:00Z');
    expect(dailyCheckDue({ itemCount: 3, now: tomorrow }).due).toBe(true);
  });

  it('remembers what the last check found, and says how long ago in words', () => {
    setDailyCheckEnabled(true);
    const now = Date.parse('2026-08-20T09:00:00Z');
    const settings = recordDailyCheck({ priced: 4, total: 5 }, now);
    expect(settings.lastResult).toMatchObject({ priced: 4, total: 5 });
    expect(lastCheckLabel(settings, now + 60000)).toMatch(/within the hour/i);
    expect(lastCheckLabel(settings, now + 5 * 3600000)).toBe('Checked 5h ago.');
    expect(lastCheckLabel(settings, now + 50 * 3600000)).toBe('Checked 2 days ago.');
    expect(lastCheckLabel({ lastRunAt: null })).toMatch(/not checked automatically/i);
  });

  it('keeps the switch across a recorded check', () => {
    setDailyCheckEnabled(true);
    recordDailyCheck({ priced: 1, total: 1 });
    expect(dailyCheckSettings().enabled).toBe(true);
  });

  it('survives unreadable stored state rather than failing the app boot', () => {
    localStorage.setItem('forq.dailyPriceCheck.v1', '{not json');
    expect(dailyCheckSettings()).toMatchObject({ enabled: false, lastRunAt: null });
  });
});
