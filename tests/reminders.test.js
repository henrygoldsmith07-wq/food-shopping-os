import { describe, it, expect } from 'vitest';
import {
  cleanTimes, dayIndex, daysFor, daysLabel, dueBetween, dueNow, minutesOf, nextDue, nextLabel,
  occursOn, reminderContext, scheduleLabel, slotKey, timeOf,
} from '../src/lib/reminders.js';
import { icsFor, suggestedReminders } from '../src/lib/reminder-suggest.js';
import { GRACE_MINUTES, NOTIFY_TRUTH, REMINDER_KINDS } from '../src/data/reminders.js';

const TODAY = '2026-07-28'; // a Tuesday
const at = (time, stamp = TODAY) => new Date(`${stamp}T${time}:00`);
const remind = (over = {}) => ({
  id: 'r1', kind: 'water', label: 'Have a glass', times: ['09:00', '13:00'],
  days: [0, 1, 2, 3, 4, 5, 6], on: true, snoozeUntil: 0, ...over,
});

describe('times and days', () => {
  it('reads a time, and refuses one that is not a time', () => {
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('9:05')).toBe(545);
    expect(minutesOf('24:00')).toBe(null);
    expect(minutesOf('12:60')).toBe(null);
    expect(minutesOf('lunchtime')).toBe(null);
    expect(minutesOf('')).toBe(null);
    expect(timeOf(570)).toBe('09:30');
  });

  it('stores times sorted, deduplicated, and free of nonsense', () => {
    expect(cleanTimes(['13:00', '9:00', '13:00', 'noon', '25:00'])).toEqual(['09:00', '13:00']);
    expect(cleanTimes([])).toEqual([]);
    expect(cleanTimes(Array.from({ length: 20 }, (_, i) => `0${i % 10}:0${i % 6}`)).length).toBeLessThanOrEqual(8);
  });

  it('counts the week from Monday, like everything else here', () => {
    expect(dayIndex('2026-07-27')).toBe(0); // Monday
    expect(dayIndex(TODAY)).toBe(1);
    expect(dayIndex('2026-08-02')).toBe(6); // Sunday
    expect(daysFor('weekdays')).toEqual([0, 1, 2, 3, 4]);
    expect(daysFor('weekends')).toEqual([5, 6]);
    expect(daysFor('custom', [3, 1, 1])).toEqual([1, 3]);
  });

  it('says the schedule in words, including when it says nothing at all', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(daysLabel([0, 1, 2, 3, 4])).toBe('Weekdays');
    expect(daysLabel([5, 6])).toBe('Weekends');
    expect(daysLabel([1, 3])).toBe('Tue, Thu');
    expect(daysLabel([])).toMatch(/never go off/);
    expect(scheduleLabel(remind())).toBe('Every day · 09:00, 13:00');
    expect(scheduleLabel(remind({ times: [] }))).toBe('No times set');
  });
});

describe('when the next one is', () => {
  it('finds the next time today, then rolls to the next day it runs', () => {
    expect(nextDue(remind(), at('07:00'))).toMatchObject({ stamp: TODAY, time: '09:00' });
    expect(nextDue(remind(), at('10:00'))).toMatchObject({ stamp: TODAY, time: '13:00' });
    expect(nextDue(remind(), at('14:00'))).toMatchObject({ stamp: '2026-07-29', time: '09:00' });
  });

  it('skips the days it does not run on', () => {
    const weekends = remind({ days: [5, 6] });
    expect(nextDue(weekends, at('10:00'))).toMatchObject({ stamp: '2026-08-01', time: '09:00' });
  });

  it('has no next one when it is off, or has no days, or no times', () => {
    expect(nextDue(remind({ on: false }), at('07:00'))).toBe(null);
    expect(nextDue(remind({ days: [] }), at('07:00'))).toBe(null);
    expect(nextDue(remind({ times: [] }), at('07:00'))).toBe(null);
    expect(nextLabel(remind({ on: false }), at('07:00'))).toBe('Off');
    expect(nextLabel(remind({ days: [] }), at('07:00'))).toMatch(/Never/);
  });

  it('counts down in the unit that suits the wait', () => {
    expect(nextLabel(remind(), at('08:30'))).toBe('In 30 min');
    expect(nextLabel(remind(), at('06:00'))).toBe('In 3 h');
    expect(nextLabel(remind({ days: [5] }), at('10:00'))).toBe('Sat at 09:00');
  });
});

describe('what is due right now', () => {
  it('is nothing before the time, and the reminder once it passes', () => {
    expect(dueNow([remind()], { now: at('08:59') })).toHaveLength(0);
    const due = dueNow([remind()], { now: at('09:05') });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ stamp: TODAY, time: '09:00', lateBy: 5 });
  });

  it('does not fire a newly added reminder for a time that already passed', () => {
    const reminder = remind({ createdAt: at('09:05').getTime() });
    expect(dueNow([reminder], { now: at('09:10') })).toHaveLength(0);
    expect(dueNow([reminder], { now: at('13:05') })).toHaveLength(1);
  });

  it('treats late as still due, until it is too late to be useful', () => {
    expect(dueNow([remind()], { now: at('10:29') })).toHaveLength(1); // 89 min late
    expect(dueNow([remind()], { now: at('10:31') })).toHaveLength(0); // past the grace window
    expect(GRACE_MINUTES).toBe(90);
  });

  it('drops one you have ticked off, and only that firing', () => {
    const reminder = remind();
    const done = { [slotKey(reminder, TODAY, '09:00')]: true };
    expect(dueNow([reminder], { now: at('09:30'), done })).toHaveLength(0);
    expect(dueNow([reminder], { now: at('13:30'), done })).toHaveLength(1);
  });

  it('respects a snooze, and comes back after it', () => {
    const snoozed = remind({ snoozeUntil: at('09:30').getTime() });
    expect(dueNow([snoozed], { now: at('09:10') })).toHaveLength(0);
    expect(dueNow([snoozed], { now: at('09:31') })).toHaveLength(1);
  });

  it('ignores one that is off, or that does not run today', () => {
    expect(dueNow([remind({ on: false })], { now: at('09:30') })).toHaveLength(0);
    expect(dueNow([remind({ days: [0] })], { now: at('09:30') })).toHaveLength(0);
    expect(occursOn(remind({ days: [1] }), TODAY)).toBe(true);
    expect(occursOn(remind({ days: [1], on: false }), TODAY)).toBe(false);
  });

  it('puts the most overdue first, because that is the one you needed', () => {
    const due = dueNow([remind({ times: ['09:00', '10:00'] })], { now: at('10:15') });
    expect(due.map((d) => d.time)).toEqual(['09:00', '10:00']);
  });
});

describe('what came due while the app was shut', () => {
  it('lists the firings inside the gap, oldest first', () => {
    const from = at('08:00', '2026-07-27').getTime();
    const to = at('12:00').getTime();
    const missed = dueBetween([remind()], from, to);
    expect(missed.map((m) => `${m.stamp} ${m.time}`)).toEqual([
      '2026-07-27 09:00', '2026-07-27 13:00', '2026-07-28 09:00',
    ]);
  });

  it('leaves out what you had already ticked off', () => {
    const reminder = remind();
    const done = { [slotKey(reminder, '2026-07-27', '09:00')]: true };
    const missed = dueBetween([reminder], at('08:00', '2026-07-27').getTime(), at('12:00').getTime(), done);
    expect(missed.map((m) => m.time)).toEqual(['13:00', '09:00']);
  });

  it('is empty on a first run, when there is no gap to report', () => {
    expect(dueBetween([remind()], 0, at('12:00').getTime())).toEqual([]);
    expect(dueBetween([remind()], at('12:00').getTime(), at('08:00').getTime())).toEqual([]);
  });

  it('is honest in the copy about why it could not tell you sooner', () => {
    expect(NOTIFY_TRUTH.closed).toMatch(/household sync/);
    expect(NOTIFY_TRUTH.closed).toMatch(/Web Push/);
    expect(NOTIFY_TRUTH.closed).toMatch(/not sent to OpenAI/);
    expect(NOTIFY_TRUTH.calendar).toMatch(/calendar/);
  });
});

describe('the line a reminder arrives with', () => {
  it('quotes your own figure back at you', () => {
    expect(reminderContext('water', { hydration: { total: 750 }, targets: { water: 2000 } }))
      .toBe("You're at 750 of 2,000 ml.");
    expect(reminderContext('meal', { kcalToday: 1200, kcalGoal: 2000 })).toMatch(/1,200 of 2,000 kcal/);
    expect(reminderContext('grocery', { shoppingList: [1, 2], pantry: [{ low: true }] }))
      .toBe('2 items on the list · 1 running low.');
    expect(reminderContext('exercise', { training: { sessions: 2, minutes: 75 } }))
      .toBe('2 sessions and 75 min this week.');
  });

  it('says there is nothing behind it rather than padding it out', () => {
    expect(reminderContext('water', { hydration: { total: 0 }, targets: {} })).toBe(null);
    expect(reminderContext('meal', {})).toBe(null);
    expect(reminderContext('supplement', {})).toBe(null); // nothing in your data to quote
    expect(reminderContext('custom', {})).toBe(null);
    expect(reminderContext('weighIn', { body_: { readings: {} } })).toMatch(/No weight logged yet/);
    expect(reminderContext('grocery', { shoppingList: [], pantry: [] })).toMatch(/list is empty/);
  });

  it('measures the weigh-in gap from the last reading', () => {
    const state = { day: TODAY, body_: { readings: { weight: { value: 82, date: '2026-07-21' } } } };
    expect(reminderContext('weighIn', state)).toBe('Last weighed 7 days ago, at 82 kg.');
    expect(reminderContext('weighIn', { ...state, body_: { readings: { weight: { value: 82, date: TODAY } } } }))
      .toBe('Already weighed today.');
  });

  it('survives an empty app for every kind, saying either something true or nothing', () => {
    for (const kind of REMINDER_KINDS) {
      const line = reminderContext(kind.key, {});
      expect(line === null || typeof line === 'string').toBe(true);
      if (typeof line === 'string') expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe('suggestions, and only where the records support them', () => {
  it('suggests nothing at all from an empty app', () => {
    expect(suggestedReminders({ log: {}, targets: { water: 0 }, pantry: [], shoppingList: [] })).toEqual([]);
  });

  it('takes meal times from when you actually eat, rounded to something human', () => {
    const entry = (meal, time) => ({ id: `${meal}${time}`, meal, time });
    const log = {
      '2026-07-25': [entry('breakfast', '07:38'), entry('breakfast', '07:55')],
      '2026-07-26': [entry('breakfast', '07:42')],
      '2026-07-27': [entry('breakfast', '07:50')],
    };
    const [meal] = suggestedReminders({ log, targets: { water: 0 }, pantry: [], shoppingList: [] });
    expect(meal.kind).toBe('meal');
    expect(meal.times).toEqual(['07:40']); // the median first-bite, to the nearest 5
    expect(meal.why).toMatch(/across 3 logged days/);
  });

  it('will not guess a meal time off one or two days', () => {
    const log = { '2026-07-27': [{ id: 'a', meal: 'lunch', time: '12:30' }] };
    expect(suggestedReminders({ log, targets: { water: 0 }, pantry: [], shoppingList: [] })).toEqual([]);
  });

  it('spaces water across the day for the target you actually have', () => {
    const [water] = suggestedReminders({ log: {}, targets: { water: 2000 }, pantry: [], shoppingList: [] });
    expect(water.kind).toBe('water');
    expect(water.times.length).toBe(4);
    expect(water.why).toMatch(/2,000 ml/);
  });

  it('puts the weigh-in on the day you already weigh, and says why', () => {
    const measurements = [
      { key: 'weight', date: '2026-07-13', value: 82 }, // Monday
      { key: 'weight', date: '2026-07-20', value: 81 }, // Monday
      { key: 'waist', date: '2026-07-21', value: 90 },
    ];
    const [weigh] = suggestedReminders({ log: {}, targets: { water: 0 }, measurements, pantry: [], shoppingList: [] });
    expect(weigh.kind).toBe('weighIn');
    expect(weigh.days).toEqual([0]);
    expect(weigh.why).toMatch(/2 weigh-ins/);
  });

  it('needs a real pattern before it names your training days', () => {
    const one = [{ date: '2026-07-21', type: 'running' }, { date: '2026-07-23', type: 'running' }];
    const state = { log: {}, targets: { water: 0 }, pantry: [], shoppingList: [] };
    expect(suggestedReminders({ ...state, workouts: one })).toEqual([]);
    const pattern = [
      { date: '2026-07-21', type: 'running' }, { date: '2026-07-28', type: 'running' },
      { date: '2026-07-23', type: 'strength' }, { date: '2026-07-30', type: 'strength' },
    ];
    const [exercise] = suggestedReminders({ ...state, workouts: pattern });
    expect(exercise.kind).toBe('exercise');
    expect(exercise.days).toEqual([1, 3]);
  });
});

describe('the calendar export', () => {
  const parse = (text) => text.split('\r\n');

  it('writes a repeating alarm per time, on the right days', () => {
    const { text, events } = icsFor([remind({ days: [0, 2] })], { from: TODAY, now: at('09:00') });
    const lines = parse(text);
    expect(events).toBe(2);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(lines).toContain('DTSTART:20260728T090000'); // floating local time
    expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(2);
  });

  it('leaves out anything switched off or with nothing to fire', () => {
    const { events } = icsFor([
      remind({ on: false }),
      remind({ id: 'r2', times: [] }),
      remind({ id: 'r3', days: [] }),
    ], { from: TODAY });
    expect(events).toBe(0);
  });

  it('escapes the characters iCalendar treats as syntax', () => {
    const { text } = icsFor([remind({ label: 'Vitamin D, B12; morning' })], { from: TODAY });
    expect(text).toContain('SUMMARY:Vitamin D\\, B12\\; morning');
  });
});
