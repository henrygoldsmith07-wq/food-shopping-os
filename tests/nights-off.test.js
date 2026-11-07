import { describe, expect, it } from 'vitest';
import {
  NIGHT_OFF_SOURCE, busyDateSet, mergeImportedBusy, nightOff, toggleNightOff,
} from '../src/lib/nights-off.js';
import { openDinnerDates } from '../src/lib/swipe-week.js';

const now = new Date('2026-11-07T10:00:00Z');

describe('nights off', () => {
  it('marks and unmarks a night, leaving calendar rows alone', () => {
    const calendar = [{ date: '2026-11-10', source: 'google' }];
    const marked = toggleNightOff(calendar, '2026-11-09', { now });
    expect(marked).toEqual([
      { date: '2026-11-09', source: NIGHT_OFF_SOURCE, label: 'Night off', importedAt: '2026-11-07T10:00:00.000Z' },
      calendar[0],
    ]);
    expect(nightOff(marked, '2026-11-09')).toBeTruthy();
    expect(nightOff(marked, '2026-11-10')).toBeNull();
    expect(toggleNightOff(marked, '2026-11-09')).toEqual(calendar);
    // Toggling a calendar-busy date adds a manual mark, never removes the calendar's.
    expect(toggleNightOff(calendar, '2026-11-10', { now })).toHaveLength(2);
    expect(toggleNightOff(calendar, 'not a date')).toBe(calendar);
    expect(toggleNightOff(undefined, '2026-11-09', { now })).toHaveLength(1);
  });

  it('survives a calendar re-import of the same range', () => {
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
    const before = [
      { date: '2026-11-09', source: NIGHT_OFF_SOURCE, label: 'Night off' },
      { date: '2026-11-10', source: 'google' },
      { date: '2026-12-01', source: 'google' },
    ];
    const after = mergeImportedBusy(before, [{ date: '2026-11-11', source: 'google' }, { date: '2026-12-25', source: 'google' }], dates);
    expect(after.map((row) => `${row.date}:${row.source}`)).toEqual([
      '2026-11-09:manual', '2026-11-11:google', '2026-12-01:google',
    ]);
  });

  it('keeps nights off out of the swipe builder', () => {
    const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
    const plan = { '2026-11-10': { dinner: 'curry' } };
    const busy = busyDateSet([{ date: '2026-11-11', source: NIGHT_OFF_SOURCE }]);
    expect(openDinnerDates(plan, dates, '2026-11-09')).toEqual(['2026-11-09', '2026-11-11']);
    expect(openDinnerDates(plan, dates, '2026-11-09', busy)).toEqual(['2026-11-09']);
  });
});
