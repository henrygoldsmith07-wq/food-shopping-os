// @ts-check
/**
 * The morning reminder email.
 *
 * Reminders used to be queued by the daily job into an outbox nothing ever
 * read — and the job runs once a day (Vercel's Hobby cron limit), so it only
 * ever caught reminders due in its own 15 minutes, on the wrong weekday
 * (reminders store days Monday-first; the job counted from Sunday). A web app
 * cannot fire a notification at 13:00 with the tab closed, so what it can
 * honestly do is send one email each morning to whoever asked for it: today's
 * reminders with their times, and the plan, list and fridge facts they are
 * about.
 */

import { actionEmail } from './email.js';
import { byId } from '../data/recipes.js';
import { daysUntil } from '../lib/kitchen-dates.js';

/** The local date and Monday-first weekday in a time zone. */
export const localDay = (now, timeZone = 'UTC') => {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(now);
  } catch {
    return localDay(now, 'UTC');
  }
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday };
};

const KIND_LABELS = {
  meal: 'Meals', water: 'Water', supplement: 'Supplements', grocery: 'Groceries', weighIn: 'Weigh-in',
  exercise: 'Exercise', sleep: 'Sleep', expiry: 'Use-by check', budget: 'Budget', weeklyReport: 'Weekly report',
  dailySummary: 'Daily summary', pantry: 'Pantry', sale: 'Sale alerts', restock: 'Restock', custom: 'Reminder',
};

/** Today's reminders that are on, as "13:00 · Lunch" lines, earliest first. */
export const remindersToday = (reminders = [], weekday) => reminders
  .filter((reminder) => reminder?.on !== false)
  .filter((reminder) => !Array.isArray(reminder.days) || !reminder.days.length || reminder.days.includes(weekday))
  .flatMap((reminder) => (reminder.times || []).map((time) => ({
    time: String(time),
    label: String(reminder.label || KIND_LABELS[reminder.kind] || 'Reminder').slice(0, 80),
  })))
  .sort((a, b) => a.time.localeCompare(b.time));

/**
 * The email for one household this morning, or null when there is nothing
 * worth sending (no reminders today and nothing planned, listed or expiring).
 *
 * @param {any} state the household's synced state
 * @param {{ now?: Date, origin?: string }} [options]
 */
export function buildReminderDigest(state = {}, { now = new Date(), origin = '' } = {}) {
  const { day, weekday } = localDay(now, state.syncTimeZone || 'UTC');
  const reminders = remindersToday(state.reminders || [], weekday);
  const planned = Object.entries(state.plan?.[day] || {})
    .map(([slot, id]) => {
      const recipe = id ? byId(id) : null;
      return recipe ? `${slot[0].toUpperCase()}${slot.slice(1)}: ${recipe.name}` : null;
    })
    .filter(Boolean);
  const toBuy = (state.shoppingList || []).filter((item) => !item.checked).length;
  const expiring = (state.pantry || [])
    .filter((item) => item.expiry && daysUntil(item.expiry, day) <= 1 && daysUntil(item.expiry, day) >= 0)
    .map((item) => item.name)
    .slice(0, 6);
  if (!reminders.length && !planned.length && !expiring.length) return null;

  const lines = [
    ...(reminders.length ? ['Today’s reminders:', ...reminders.map((r) => `  ${r.time} · ${r.label}`), ''] : []),
    ...(planned.length ? ['On the plan:', ...planned.map((line) => `  ${line}`), ''] : []),
    ...(toBuy ? [`${toBuy} item${toBuy === 1 ? '' : 's'} still on the shopping list.`] : []),
    ...(expiring.length ? [`Use today or tomorrow: ${expiring.join(', ')}.`] : []),
  ];
  const email = actionEmail({
    heading: 'Your day in Forq',
    body: lines.join('\n').trim(),
    action: 'Open Forq',
    url: origin || 'https://forq.app',
    footer: 'You get this because you turned on the morning email in Forq’s reminders. Turn it off there at any time.',
  });
  return {
    day,
    subject: reminders.length
      ? `Today: ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}${planned.length ? ` · ${planned.length} meal${planned.length === 1 ? '' : 's'} planned` : ''}`
      : `Today in Forq: ${planned.length ? `${planned.length} meal${planned.length === 1 ? '' : 's'} planned` : 'food to use up'}`,
    text: email.text,
    html: email.html,
  };
}
