/**
 * Fasting, read off the diary you already keep.
 *
 * The gap between your last entry yesterday and your first today *is* your
 * overnight fast — no separate timer needed, no button to forget to press. A
 * running fast is the one exception: it needs a start you set, because "you
 * haven't logged since 8pm" and "you are deliberately fasting" are different
 * claims and the app shouldn't guess which.
 *
 * Nothing here prescribes a protocol. 16:8 and the rest are listed because
 * people ask for them by name, and each one is a window you chose, not a
 * recommendation the app is making.
 */

import { addDays, dayStamp } from './kitchen.js';

const HOUR = 3600000;

/** Named windows people ask for. A label for your own choice, not advice. */
export const FAST_PLANS = [
  { id: '16-8', label: '16:8', fastHours: 16, blurb: 'Eat inside an eight-hour window' },
  { id: '18-6', label: '18:6', fastHours: 18, blurb: 'A six-hour window' },
  { id: '20-4', label: '20:4', fastHours: 20, blurb: 'One long meal' },
  { id: '14-10', label: '14:10', fastHours: 14, blurb: 'A gentler overnight gap' },
  { id: 'custom', label: 'Your own', fastHours: null, blurb: 'Set the hours yourself' },
];

export const planBy = Object.fromEntries(FAST_PLANS.map((p) => [p.id, p]));

const at = (stamp, time) => new Date(`${stamp}T${time}:00`).getTime();

const timesOn = (log = {}, date) =>
  (log[date] || []).map((e) => e.time).filter((t) => /^\d{1,2}:\d{2}/.test(t || '')).sort();

/** First and last thing eaten on a day, and the window between them. */
export const eatingWindow = (log = {}, date = dayStamp()) => {
  const times = timesOn(log, date);
  if (!times.length) return { date, logged: false };
  const first = times[0];
  const last = times[times.length - 1];
  return {
    date,
    logged: true,
    first,
    last,
    hours: Math.round(((at(date, last) - at(date, first)) / HOUR) * 10) / 10,
    entries: times.length,
  };
};

/**
 * The overnight gap ending on `date`: last thing yesterday to first thing
 * today. Needs both ends — a day you didn't log can't bound a fast.
 */
export const overnightFast = (log = {}, date = dayStamp()) => {
  const yesterday = addDays(date, -1);
  const before = timesOn(log, yesterday);
  const after = timesOn(log, date);
  if (!before.length || !after.length) {
    return { date, known: false, reason: 'Needs something logged on both sides of the night.' };
  }
  const from = at(yesterday, before[before.length - 1]);
  const to = at(date, after[0]);
  return {
    date,
    known: true,
    from: before[before.length - 1],
    to: after[0],
    hours: Math.round(((to - from) / HOUR) * 10) / 10,
  };
};

/** Every overnight fast the diary can actually bound, newest first. */
export const fastHistory = (log = {}, { days = 14, today = dayStamp() } = {}) => {
  const rows = [];
  for (let i = 0; i < days; i += 1) {
    const fast = overnightFast(log, addDays(today, -i));
    if (fast.known) rows.push(fast);
  }
  return rows;
};

/**
 * The pattern your diary shows, against a plan if you named one. Silent under
 * three bounded nights — two long evenings is not a fasting habit.
 */
export const fastingSummary = (log = {}, { days = 14, today = dayStamp(), plan = null, minNights = 3 } = {}) => {
  const history = fastHistory(log, { days, today });
  if (history.length < minNights) {
    return {
      ready: false,
      nights: history.length,
      minNights,
      reason: `${minNights} nights the diary can bound either side make this readable — it has ${history.length}.`,
    };
  }
  const hours = history.map((f) => f.hours);
  const target = planBy[plan]?.fastHours || null;
  const avg = Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
  return {
    ready: true,
    nights: history.length,
    avgHours: avg,
    longest: Math.max(...hours),
    shortest: Math.min(...hours),
    target,
    met: target ? hours.filter((h) => h >= target).length : null,
    history,
    caveat: 'Read from the times on your entries. Something eaten and not logged makes this longer than it was.',
  };
};

/* ---------- A fast you're actually in ---------- */

/**
 * A running fast, from a start you set. Returns elapsed time and where that
 * sits against the plan — no notifications, no encouragement, just the clock.
 */
export const currentFast = (fast, now = Date.now()) => {
  if (!fast?.startedAt) return { running: false };
  const elapsed = Math.max(0, now - Number(fast.startedAt));
  const hours = Math.floor(elapsed / HOUR);
  const minutes = Math.floor((elapsed % HOUR) / 60000);
  const target = planBy[fast.plan]?.fastHours || Number(fast.hours) || null;
  return {
    running: true,
    startedAt: Number(fast.startedAt),
    elapsedHours: Math.round((elapsed / HOUR) * 10) / 10,
    label: `${hours}h ${String(minutes).padStart(2, '0')}m`,
    target,
    pct: target ? Math.min(100, Math.round((elapsed / (target * HOUR)) * 100)) : null,
    done: target ? elapsed >= target * HOUR : false,
    endsAt: target ? Number(fast.startedAt) + target * HOUR : null,
  };
};
