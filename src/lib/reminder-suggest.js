/**
 * Reminders the app can propose, and the calendar export that makes them fire
 * when Forq is closed.
 *
 * A suggestion is only made when your own records support it, and it arrives
 * with the evidence attached — "you log breakfast around 07:40, across 12 days"
 * rather than a guessed 8am. With nothing logged, nothing is suggested; the
 * blank Reminders page is the honest state of a blank diary.
 */

import { DEFAULT_TEXT, kindBy, NOTIFICATION_PRESETS } from '../data/reminders.js';
import { notificationKindsForMode } from '../data/productModes.js';
import { cleanTimes, dayIndex, minutesOf, timeOf } from './reminders.js';
import { MEAL_SLOTS } from '../data/plan.js';

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Round to the nearest five minutes — nobody eats at 07:43 on purpose. */
const toFive = (minutes) => Math.round(minutes / 5) * 5;

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/* ---------- Meals: the times you actually eat ---------- */

const mealTimes = (log = {}, minDays = 3) => {
  const byMeal = new Map();
  for (const entries of Object.values(log)) {
    const seen = new Set();
    for (const entry of entries) {
      const at = minutesOf(entry.time);
      if (at === null || seen.has(entry.meal)) continue;
      seen.add(entry.meal); // the first of a meal is when you started it
      byMeal.set(entry.meal, [...(byMeal.get(entry.meal) || []), at]);
    }
  }
  return MEAL_SLOTS
    .map(({ key, label }) => ({ key, label, times: byMeal.get(key) || [] }))
    .filter((m) => m.times.length >= minDays)
    .map((m) => ({ ...m, at: timeOf(toFive(median(m.times))), days: m.times.length }));
};

/* ---------- Weigh-in: the day you already weigh ---------- */

const weighDay = (measurements = [], minReadings = 2) => {
  const weights = measurements.filter((m) => m.key === 'weight');
  if (weights.length < minReadings) return null;
  const counts = new Map();
  for (const m of weights) counts.set(dayIndex(m.date), (counts.get(dayIndex(m.date)) || 0) + 1);
  const [day, times] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { day, times, readings: weights.length };
};

/* ---------- Exercise: the days you train ---------- */

const trainingDays = (workouts = [], minSessions = 3) => {
  if (workouts.length < minSessions) return null;
  const counts = new Map();
  for (const w of workouts) counts.set(dayIndex(w.date), (counts.get(dayIndex(w.date)) || 0) + 1);
  const days = [...counts.entries()].filter(([, n]) => n >= 2).map(([d]) => d).sort((a, b) => a - b);
  return days.length ? { days, sessions: workouts.length } : null;
};

/* ---------- Water: spread across the hours you're awake ---------- */

const waterTimes = (glassesTarget, from = 8 * 60, to = 20 * 60) => {
  const slots = Math.max(2, Math.min(6, Math.round(glassesTarget / 2) || 4));
  const step = Math.round((to - from) / (slots - 1) / 30) * 30;
  return cleanTimes(Array.from({ length: slots }, (_, i) => timeOf(from + i * step)));
};

const suggestion = (kind, times, days, why) => ({
  key: `${kind}-${times.join('-')}`,
  kind,
  label: DEFAULT_TEXT[kind],
  emoji: kindBy[kind].emoji,
  times: cleanTimes(times),
  days,
  why,
});

/**
 * What the app would set up for you, each with the record behind it. Anything
 * it can't support from your data simply isn't offered.
 */
export const suggestedReminders = (state = {}) => {
  const out = [];

  for (const meal of mealTimes(state.log)) {
    out.push(suggestion('meal', [meal.at], EVERY_DAY,
      `You usually start ${meal.label.toLowerCase()} around ${meal.at}, across ${meal.days} logged day${meal.days === 1 ? '' : 's'}.`));
  }

  const targetMl = state.targets?.water || 0;
  if (targetMl) {
    const glasses = Math.round(targetMl / 250);
    const times = waterTimes(glasses);
    out.push(suggestion('water', times, EVERY_DAY,
      `${times.length} nudges spread across the day, for the ${targetMl.toLocaleString()} ml your target asks for.`));
  }

  const weigh = weighDay(state.measurements);
  if (weigh) {
    out.push(suggestion('weighIn', ['07:30'], [weigh.day],
      `Most of your ${weigh.readings} weigh-ins land on that day — same day, same time is what makes them comparable.`));
  }

  const training = trainingDays(state.workouts);
  if (training) {
    out.push(suggestion('exercise', ['18:00'], training.days,
      `Your ${training.sessions} logged sessions cluster on those days.`));
  }

  const low = (state.pantry || []).filter((p) => p.low).length;
  if (low || (state.shoppingList || []).length) {
    out.push(suggestion('grocery', ['18:00'], [4],
      `${low ? `${low} item${low === 1 ? '' : 's'} marked low` : `${state.shoppingList.length} on your list`} — Friday evening, before the weekend shop.`));
  }

  return out;
};

/** Ready-made schedules remain a choice: return only kinds not already set. */
export const notificationPresets = (reminders = [], productMode) => {
  const configured = new Set(reminders.map((reminder) => reminder.kind));
  const allowed = productMode
    ? new Set(notificationKindsForMode(productMode))
    : null;
  return NOTIFICATION_PRESETS
    .filter((preset) => !configured.has(preset.kind))
    .filter((preset) => !allowed || allowed.has(preset.kind))
    .map((preset) => ({ ...preset, label: DEFAULT_TEXT[preset.kind] }));
};

/* ---------- Calendar export ---------- */

const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Escape the characters iCalendar treats as syntax. */
const esc = (text) => String(text || '').replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

const stampUtc = (date) => `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

/** Local floating time, so a 07:30 reminder is 07:30 wherever you are. */
const local = (stamp, time) => `${stamp.replace(/-/g, '')}T${time.replace(':', '')}00`;

/**
 * A calendar file your phone can hold alarms for. This is the one path that
 * genuinely fires with Forq closed — the alarm belongs to your phone, not to a
 * web page — so it is offered rather than a "background notifications" toggle
 * that could not work.
 */
export const icsFor = (reminders = [], { from = new Date(), now = new Date() } = {}) => {
  const start = typeof from === 'string' ? from : from.toISOString().slice(0, 10);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Forq//Reminders//EN', 'CALSCALE:GREGORIAN'];
  let count = 0;
  for (const reminder of reminders) {
    const times = cleanTimes(reminder.times);
    const days = (reminder.days || []).map((d) => ICS_DAYS[d]).filter(Boolean);
    if (!reminder.on || !times.length || !days.length) continue;
    for (const time of times) {
      count += 1;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${reminder.id}-${time.replace(':', '')}@forq.local`,
        `DTSTAMP:${stampUtc(now)}`,
        `DTSTART:${local(start, time)}`,
        'DURATION:PT10M',
        `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`,
        `SUMMARY:${esc(reminder.label || DEFAULT_TEXT[reminder.kind] || 'Reminder')}`,
        'DESCRIPTION:' + esc('From Forq. Editing it here does not change the app.'),
        'BEGIN:VALARM',
        'TRIGGER:PT0M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(reminder.label || DEFAULT_TEXT[reminder.kind] || 'Reminder')}`,
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return { text: `${lines.join('\r\n')}\r\n`, events: count };
};
