/**
 * Reminders: when they're due, what came due while you weren't looking, and
 * what to say when one arrives.
 *
 * All of this is arithmetic over dates and the times you chose — no timers are
 * kept, no schedule is stored twice. "Due now" is a question you can ask of the
 * clock at any moment, so it survives the app being closed, reopened, or left
 * open across midnight.
 *
 * A reminder is: {id, kind, label, times[], days[], on, createdAt, snoozeUntil}. `days` is
 * Mon-first 0–6, matching the rest of the app.
 */

import { GRACE_MINUTES, kindBy, MAX_TIMES, repeatBy } from '../data/reminders.js';
import { addDays, dayStamp, daysUntil, weekDates } from './kitchen.js';

const pad = (n) => String(n).padStart(2, '0');

/* ---------- Times ---------- */

/** "hh:mm" → minutes past midnight, or null if it isn't a time. */
export const minutesOf = (time) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const timeOf = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** Valid, unique, in order — the only shape a reminder's times are stored in. */
export const cleanTimes = (times = []) => {
  const minutes = times.map(minutesOf).filter((m) => m !== null);
  return [...new Set(minutes)].sort((a, b) => a - b).slice(0, MAX_TIMES).map(timeOf);
};

/** Mon = 0, to match WEEK_DAYS and the planner. */
export const dayIndex = (stamp) => (new Date(`${stamp}T12:00:00`).getDay() + 6) % 7;

export const daysFor = (repeat, custom = []) =>
  (repeat === 'custom' ? [...new Set(custom)].sort((a, b) => a - b) : repeatBy[repeat]?.days || []);

/* ---------- Due ---------- */

export const occursOn = (reminder, stamp) =>
  Boolean(reminder?.on) && (reminder.days || []).includes(dayIndex(stamp));

const stampOf = (now) => dayStamp(now);
const minutesNow = (now) => now.getHours() * 60 + now.getMinutes();
const createdAfterTime = (reminder, stamp, time) => {
  const createdAt = Number(reminder?.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  const created = new Date(createdAt);
  return dayStamp(created) === stamp && minutesOf(time) <= minutesNow(created);
};

/** A stable key for one firing: this reminder, this day, this time. */
export const slotKey = (reminder, stamp, time) => `${stamp}|${reminder.id}|${time}`;

/**
 * The next time this reminder will go off, looking up to a fortnight ahead.
 * Returns null for a reminder that is off or repeats on no days at all.
 */
export const nextDue = (reminder, now = new Date()) => {
  const times = cleanTimes(reminder?.times);
  if (!reminder?.on || !times.length || !(reminder.days || []).length) return null;
  for (let ahead = 0; ahead <= 14; ahead += 1) {
    const stamp = addDays(stampOf(now), ahead);
    if (!occursOn(reminder, stamp)) continue;
    const after = ahead === 0 ? minutesNow(now) : -1;
    const time = times.find((t) => minutesOf(t) > after);
    if (time) return { stamp, time, minutes: minutesOf(time) };
  }
  return null;
};

/**
 * Everything due right now: past its time, inside the grace window, not done
 * and not snoozed. Late is still due — a reminder you missed by an hour is the
 * one you most needed.
 */
export const dueNow = (reminders = [], { now = new Date(), done = {}, grace = GRACE_MINUTES } = {}) => {
  const stamp = stampOf(now);
  const mins = minutesNow(now);
  const out = [];
  for (const reminder of reminders) {
    if (!occursOn(reminder, stamp)) continue;
    if (reminder.snoozeUntil && Number(reminder.snoozeUntil) > now.getTime()) continue;
    for (const time of cleanTimes(reminder.times)) {
      const at = minutesOf(time);
      if (at > mins || mins - at > grace) continue;
      if (createdAfterTime(reminder, stamp, time)) continue;
      if (done[slotKey(reminder, stamp, time)]) continue;
      out.push({ reminder, stamp, time, lateBy: mins - at });
    }
  }
  return out.sort((a, b) => b.lateBy - a.lateBy);
};

/**
 * What came due between two moments — used to catch you up on what the app
 * couldn't tell you while it was shut, which is the honest version of a
 * background notification.
 */
export const dueBetween = (reminders = [], from, to, done = {}) => {
  if (!from || !to || from >= to) return [];
  const start = new Date(from);
  const end = new Date(to);
  const out = [];
  const lastStamp = dayStamp(end);
  for (let stamp = dayStamp(start), guard = 0; guard <= 31; guard += 1) {
    for (const reminder of reminders) {
      if (!occursOn(reminder, stamp)) continue;
      for (const time of cleanTimes(reminder.times)) {
        const at = new Date(`${stamp}T${time}:00`).getTime();
        if (at <= from || at > to) continue;
        if (Number.isFinite(Number(reminder.createdAt)) && at <= Number(reminder.createdAt)) continue;
        if (done[slotKey(reminder, stamp, time)]) continue;
        out.push({ reminder, stamp, time, at });
      }
    }
    if (stamp === lastStamp) break;
    stamp = addDays(stamp, 1);
  }
  return out.sort((a, b) => a.at - b.at);
};

/* ---------- Saying it in words ---------- */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const daysLabel = (days = []) => {
  if (days.length === 7) return 'Every day';
  if (!days.length) return 'No days — it will never go off';
  if (days.length === 5 && days.every((d) => d < 5)) return 'Weekdays';
  if (days.length === 2 && days.every((d) => d > 4)) return 'Weekends';
  return days.map((d) => DAY_NAMES[d]).join(', ');
};

export const scheduleLabel = (reminder) => {
  const times = cleanTimes(reminder?.times);
  if (!times.length) return 'No times set';
  return `${daysLabel(reminder.days)} · ${times.join(', ')}`;
};

/** How long until the next one, in words, or why there isn't one. */
export const nextLabel = (reminder, now = new Date()) => {
  if (!reminder?.on) return 'Off';
  const next = nextDue(reminder, now);
  if (!next) return 'Never — it has no days or no times';
  const at = new Date(`${next.stamp}T${next.time}:00`);
  const mins = Math.round((at - now) / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `In ${mins} min`;
  if (mins < 60 * 24) return `In ${Math.round(mins / 60)} h`;
  return `${DAY_NAMES[dayIndex(next.stamp)]} at ${next.time}`;
};

/* ---------- What the nudge actually says ---------- */

/**
 * The line a reminder arrives with, drawn from your data. A water reminder
 * that knows you're at three glasses is worth having; one that says "drink
 * water" is a sticky note. Where there's nothing to quote, it says nothing
 * extra rather than padding it out.
 */
export const reminderContext = (kind, state = {}) => {
  const reads = kindBy[kind]?.reads;
  if (!reads) return null;
  if (reads === 'water') {
    const total = Math.round(state.hydration?.total ?? 0);
    const target = state.targets?.water ?? 0;
    return target ? `You're at ${total.toLocaleString()} of ${target.toLocaleString()} ml.` : null;
  }
  if (reads === 'diary') {
    const kcal = state.kcalToday ?? 0;
    const goal = state.kcalGoal ?? 0;
    return goal ? `${kcal.toLocaleString()} of ${goal.toLocaleString()} kcal logged so far.` : null;
  }
  if (reads === 'shopping') {
    const list = state.shoppingList?.length || 0;
    const low = state.pantry?.filter((p) => p.low).length || 0;
    if (!list && !low) return 'Your list is empty and nothing is marked low.';
    return [list && `${list} item${list === 1 ? '' : 's'} on the list`, low && `${low} running low`]
      .filter(Boolean).join(' · ') + '.';
  }
  if (reads === 'weight') {
    const last = state.body_?.readings?.weight;
    if (!last) return 'No weight logged yet — this would be your first.';
    const days = Math.round((new Date(`${state.day}T12:00:00`) - new Date(`${last.date}T12:00:00`)) / 86400000);
    return days === 0 ? 'Already weighed today.' : `Last weighed ${days} day${days === 1 ? '' : 's'} ago, at ${last.value} kg.`;
  }
  if (reads === 'training') {
    const week = state.training;
    if (!week?.sessions) return 'Nothing logged this week yet.';
    return `${week.sessions} session${week.sessions === 1 ? '' : 's'} and ${week.minutes} min this week.`;
  }
  if (reads === 'sleep') {
    const nights = state.sleepSummary?.nights || 0;
    if (!nights) return 'No nights logged yet.';
    return `${state.sleepSummary.avgHours} h average over ${nights} night${nights === 1 ? '' : 's'}.`;
  }
  if (reads === 'expiry') {
    const due = (state.pantry || [])
      .filter((item) => item.expiry && daysUntil(item.expiry, state.day) <= 3)
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
    if (!due.length) return 'Nothing with a saved date expires in the next three days.';
    const first = due[0];
    const gap = daysUntil(first.expiry, state.day);
    const when = gap < 0 ? 'past its date' : gap === 0 ? 'today' : gap === 1 ? 'tomorrow' : `in ${gap} days`;
    return `${first.name} is due ${when}${due.length > 1 ? ` · ${due.length - 1} more need attention` : ''}.`;
  }
  if (reads === 'budget') {
    const budget = Number(state.weeklyBudget) || 0;
    if (!budget) return 'No weekly grocery budget set yet.';
    const spent = Number(state.spentThisWeek) || 0;
    const pace = state.basket?.over ? ' · your current basket would take you over' : '';
    return `£${spent.toFixed(2)} of £${budget.toFixed(2)} weekly budget spent${pace}.`;
  }
  if (reads === 'weeklyReport') {
    const dates = weekDates(state.day || dayStamp());
    const logged = dates.filter((date) => (state.log?.[date] || []).length).length;
    const spent = Number(state.spentThisWeek) || 0;
    return `${logged} of 7 diary days logged · £${spent.toFixed(2)} spent this week.`;
  }
  if (reads === 'dailySummary') {
    const entries = state.entries || state.log?.[state.day] || [];
    const planned = Object.keys(state.plan?.[state.day] || {}).length;
    const list = state.shoppingList?.length || 0;
    return [
      `${entries.length} food entr${entries.length === 1 ? 'y' : 'ies'}`,
      `${planned} meal${planned === 1 ? '' : 's'} planned`,
      `${list} list item${list === 1 ? '' : 's'}`,
    ].join(' · ') + '.';
  }
  if (reads === 'pantry') {
    const low = (state.pantry || []).filter((item) => item.low).length;
    const expiring = (state.pantry || []).filter(
      (item) => item.expiry && daysUntil(item.expiry, state.day) <= 7,
    ).length;
    if (!low && !expiring) return 'Nothing is marked low or expiring this week.';
    return [
      low && `${low} running low`,
      expiring && `${expiring} expiring this week`,
    ].filter(Boolean).join(' · ') + '.';
  }
  if (reads === 'sale') {
    const hits = (state.priceAlertStatus || []).filter((alert) => alert.hit);
    if (!hits.length) {
      const watched = state.priceAlertStatus?.length || 0;
      return watched ? `${watched} saved price target${watched === 1 ? '' : 's'}; none hit in recorded shops.` : 'No price targets saved yet.';
    }
    const hit = hits[0];
    return `${hit.name} is £${Number(hit.latest).toFixed(2)}${hit.store ? ` at ${hit.store}` : ''}, below your £${Number(hit.target).toFixed(2)} target in recorded shops.`;
  }
  if (reads === 'restock') {
    const due = state.restock || [];
    if (!due.length) return 'No repeat buys look due from your recorded shops.';
    return `${due.length} repeat buy${due.length === 1 ? '' : 's'} look${due.length === 1 ? 's' : ''} due: ${due.slice(0, 3).map((item) => item.name).join(', ')}.`;
  }
  return null;
};
