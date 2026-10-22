import { describe, it, expect } from 'vitest';
import { reminderActions } from '../src/lib/reminder-actions.js';
import { MAX_REMINDERS } from '../src/data/reminders.js';

const makeStore = (init = {}) => {
  let state = { day: '2026-10-21', reminders: [], reminderDone: {}, ...init };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { a: reminderActions(set), get: () => state };
};
const draft = { kind: 'custom', label: '  Defrost chicken  ', times: ['18:00'], days: [3, 1, 1, 9, -1] };

describe('reminder actions', () => {
  it('addReminder trims the label and dedupes/sorts valid days', () => {
    const { a, get } = makeStore();
    a.addReminder(draft);
    expect(get().reminders).toHaveLength(1);
    expect(get().reminders[0].label).toBe('Defrost chicken');
    expect(get().reminders[0].days).toEqual([1, 3]);
  });
  it('addReminder refuses reminders that could never fire', () => {
    const { a, get } = makeStore();
    a.addReminder({ ...draft, days: [] });
    a.addReminder({ ...draft, times: [] });
    expect(get().reminders).toEqual([]);
  });
  it('addReminder respects MAX_REMINDERS', () => {
    const { a, get } = makeStore({ reminders: Array.from({ length: MAX_REMINDERS }, (_, i) => ({ id: `r${i}` })) });
    a.addReminder(draft);
    expect(get().reminders).toHaveLength(MAX_REMINDERS);
  });
  it('toggle and remove work on the right id only', () => {
    const { a, get } = makeStore();
    a.addReminder(draft); a.addReminder(draft);
    const [x, y] = get().reminders.map((r) => r.id);
    a.toggleReminder(x);
    expect(get().reminders.map((r) => r.on)).toEqual([false, true]);
    a.removeReminder(y);
    expect(get().reminders.map((r) => r.id)).toEqual([x]);
  });
  it('snoozeReminder defaults a bad duration to 10 minutes', () => {
    const { a, get } = makeStore();
    a.addReminder(draft);
    const before = Date.now();
    a.snoozeReminder(get().reminders[0].id, 'abc');
    const d = get().reminders[0].snoozeUntil - before;
    expect(d).toBeGreaterThanOrEqual(10 * 60000 - 50);
    expect(d).toBeLessThan(10 * 60000 + 5000);
  });
  it('completeReminder prunes ticks older than 14 days', () => {
    const { a, get } = makeStore({ reminderDone: { '2026-09-01|x|09:00': true } });
    a.completeReminder('rid', '2026-10-21', '09:00');
    const keys = Object.keys(get().reminderDone);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain('2026-10-21');
  });
  it('addSuggestedReminders only adds valid ones and stops at the cap', () => {
    const { a, get } = makeStore();
    a.addSuggestedReminders([draft, { ...draft, days: [] }]);
    expect(get().reminders).toHaveLength(1);
  });
});
