/**
 * What a reminder can be about, and what a web app can honestly promise.
 *
 * Nothing here is user data — your reminders start empty. These are the kinds
 * one can be, the times a sensible default would pick, and the plain truth
 * about when a notification will and won't reach you.
 */

import { PRIVACY_COPY } from './privacy.js';

const kind = (key, label, emoji, blurb, times, reads = null) =>
  ({ key, label, emoji, blurb, times, reads });

/**
 * `reads` names the part of your data the reminder can quote back at you, so
 * a nudge arrives with the number attached rather than as a bare "drink water".
 */
export const REMINDER_KINDS = [
  kind('meal', 'Meals', '🍽️', 'A nudge at the times you usually eat', ['08:00', '13:00', '19:00'], 'diary'),
  kind('water', 'Water', '💧', 'Spread across the day, with where you are', ['10:00', '13:00', '16:00', '19:00'], 'water'),
  kind('supplement', 'Supplements', '💊', 'Whatever you take, when you take it', ['08:00'], null),
  kind('grocery', 'Groceries', '🛒', 'Before the shop, with what is low', ['18:00'], 'shopping'),
  kind('weighIn', 'Weigh-in', '⚖️', 'The same time on the same day, which is what makes it comparable', ['07:30'], 'weight'),
  kind('exercise', 'Exercise', '🏋️', 'On the days you train', ['18:00'], 'training'),
  kind('sleep', 'Sleep', '🌙', 'A wind-down, and a nudge to log the night', ['22:30'], 'sleep'),
  kind('expiry', 'Expiry', '⏳', 'Food that is nearing its saved expiry date', ['18:00'], 'expiry'),
  kind('budget', 'Budget', '£', 'Your recorded grocery spend against the limits you set', ['20:00'], 'budget'),
  kind('weeklyReport', 'Weekly report', '📊', 'A weekly summary with its diary coverage stated', ['19:00'], 'weeklyReport'),
  kind('dailySummary', 'Daily summary', '🗓️', 'Today’s food, meal plan and shopping list in one line', ['20:30'], 'dailySummary'),
  kind('pantry', 'Pantry alerts', '🥫', 'Items running low or expiring this week', ['18:00'], 'pantry'),
  kind('sale', 'Sale alerts', '🏷️', 'Saved price targets checked against recorded shops', ['17:00'], 'sale'),
  kind('restock', 'Restock', '🔁', 'Repeat buys that your own shop history says are due', ['17:00'], 'restock'),
  kind('custom', 'Something else', '🔔', 'Your words, your times', ['12:00'], null),
];

export const kindBy = Object.fromEntries(REMINDER_KINDS.map((k) => [k.key, k]));

/** Mon-first, matching the rest of the app's week. */
export const REPEATS = [
  { key: 'daily', label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'weekdays', label: 'Weekdays', days: [0, 1, 2, 3, 4] },
  { key: 'weekends', label: 'Weekends', days: [5, 6] },
  { key: 'custom', label: 'Pick days', days: [] },
];

export const repeatBy = Object.fromEntries(REPEATS.map((r) => [r.key, r]));

export const MAX_TIMES = 8;
export const MAX_REMINDERS = 24;
/** How late a reminder still counts as "due now" rather than missed. */
export const GRACE_MINUTES = 90;
export const SNOOZE_MINUTES = [10, 30, 60];

const preset = (kind, days, times = kindBy[kind].times) => ({
  key: `notification-${kind}`,
  kind,
  label: null,
  emoji: kindBy[kind].emoji,
  times,
  days,
  why: kindBy[kind].blurb,
});

/** Opt-in schedules for the notification centre; none are installed silently. */
export const NOTIFICATION_PRESETS = [
  preset('expiry', [0, 1, 2, 3, 4, 5, 6]),
  preset('grocery', [4]),
  preset('meal', [0, 1, 2, 3, 4, 5, 6]),
  preset('budget', [0, 1, 2, 3, 4, 5, 6]),
  preset('weeklyReport', [6]),
  preset('dailySummary', [0, 1, 2, 3, 4, 5, 6]),
  preset('pantry', [2, 5]),
  preset('sale', [4]),
  preset('restock', [3]),
];

/**
 * The honest limits of notifications in this local-first web app.
 *
 * A browser can show a notification while the page is running. Firing one
 * when the app is closed needs a device Web Push subscription or the
 * Notification Triggers API. Synced households have server-side reminder jobs,
 * but this app does not register the browser for Web Push. It therefore
 * notifies while open, reports missed reminders on return, and can export the
 * schedule to the phone's calendar.
 */
export const NOTIFY_TRUTH = {
  open: 'While Forq is open, a due reminder shows as a notification.',
  closed: PRIVACY_COPY.reminders,
  caughtUp: 'What came due while it was shut is waiting for you when you open it.',
  calendar: 'For alarms that fire with the app closed, send these to your calendar. Your phone already does that job properly.',
};

/** A reminder's text when you haven't written your own. */
export const DEFAULT_TEXT = {
  meal: 'Time to eat — and to log it',
  water: 'Have a glass',
  supplement: 'Supplements',
  grocery: 'Shopping list',
  weighIn: 'Step on the scales',
  exercise: 'Training today',
  sleep: 'Wind down — and log last night',
  expiry: 'Check what needs using soon',
  budget: 'Grocery budget check',
  weeklyReport: 'Your weekly report',
  dailySummary: 'Today in Forq',
  pantry: 'Pantry check',
  sale: 'Price target check',
  restock: 'Repeat buys due',
  custom: 'Reminder',
};
