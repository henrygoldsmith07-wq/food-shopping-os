/**
 * Reports: your diary, added up over a day, a week or a month.
 *
 * Every figure here is a sum or an average of entries you logged, and every
 * report says how many days it saw. That last part is the whole point — an
 * "average" over two days of a thirty-day month is not a monthly trend, and a
 * report that hides its own sample size is a report that flatters you.
 *
 * Days with nothing logged are excluded from averages and counted separately,
 * because a blank day is a day you didn't record, not a day you ate nothing.
 */

import { dayTotals, entryNumbers, MEALS, nutrientCoverage } from './nutrition.js';
import { addDays, dayStamp, weekDates } from './kitchen.js';
import { HEADLINE_KEYS, NUTRIENTS, nutrientBy } from '../data/nutrients.js';
import { series } from './health.js';

const round = (n, dp = 0) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

/** The dates of a calendar month containing `stamp`, in order. */
export const monthDates = (stamp = dayStamp()) => {
  const [y, m] = stamp.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
};

/* ---------- One day ---------- */

/**
 * A day's report: what you ate, against what you were aiming at, split by meal
 * and by when you ate it. Empty is reported as empty.
 */
export const dailyReport = (state, stamp = state.day) => {
  const entries = state.log?.[stamp] || [];
  const targets = state.targets || {};
  const totals = dayTotals(entries);
  const byMeal = MEALS.map(({ key, label }) => {
    const rows = entries.filter((e) => e.meal === key);
    const kcal = rows.reduce((sum, e) => sum + (entryNumbers(e).kcal || 0), 0);
    return {
      key,
      label,
      entries: rows.length,
      kcal: round(kcal),
      share: totals.kcal ? round((kcal / totals.kcal) * 100) : 0,
    };
  }).filter((m) => m.entries > 0);

  const times = entries.map((e) => e.time).filter(Boolean).sort();
  return {
    date: stamp,
    logged: entries.length > 0,
    entries: entries.length,
    totals,
    targets,
    macros: HEADLINE_KEYS.map((key) => ({
      key,
      label: nutrientBy[key]?.label || key,
      value: round(totals[key]),
      target: round(targets[key] || 0),
      pct: targets[key] ? round((totals[key] / targets[key]) * 100) : null,
    })),
    byMeal,
    first: times[0] || null,
    last: times[times.length - 1] || null,
    coverage: nutrientCoverage(entries),
  };
};

/* ---------- A span of days ---------- */

const spanTotals = (log = {}, dates = []) => {
  const days = dates.map((date) => ({ date, entries: log[date] || [] }));
  const logged = days.filter((d) => d.entries.length > 0);
  const totals = logged.map((d) => ({ date: d.date, ...dayTotals(d.entries) }));
  return { days, logged, totals };
};

/**
 * A period summarised: the days it actually saw, the averages over those, and
 * the best and worst against your calorie target.
 */
export const periodReport = (state, dates, label = 'Period') => {
  const { days, logged, totals } = spanTotals(state.log, dates);
  const target = state.targets?.kcal || 0;
  const kcals = totals.map((t) => t.kcal);

  const withinTarget = target
    ? totals.filter((t) => Math.abs(t.kcal - target) <= target * 0.1).length
    : 0;

  return {
    label,
    from: dates[0],
    to: dates[dates.length - 1],
    days: days.length,
    loggedDays: logged.length,
    // The figure a reader needs before believing any of the rest.
    coverage: days.length ? round((logged.length / days.length) * 100) : 0,
    totalKcal: round(kcals.reduce((a, b) => a + b, 0)),
    avgKcal: round(mean(kcals)),
    macros: HEADLINE_KEYS.map((key) => ({
      key,
      label: nutrientBy[key]?.label || key,
      avg: round(mean(totals.map((t) => t[key])), 1),
      target: round(state.targets?.[key] || 0),
    })),
    onTargetDays: withinTarget,
    adherence: logged.length ? round((withinTarget / logged.length) * 100) : 0,
    highest: totals.length ? totals.reduce((a, b) => (b.kcal > a.kcal ? b : a)) : null,
    lowest: totals.length ? totals.reduce((a, b) => (b.kcal < a.kcal ? b : a)) : null,
    series: days.map((d) => ({ date: d.date, kcal: d.entries.length ? round(dayTotals(d.entries).kcal) : null })),
  };
};

export const weeklyReport = (state, today = state.day) =>
  periodReport(state, weekDates(today), 'This week');

export const monthlyReport = (state, today = state.day) =>
  periodReport(state, monthDates(today), 'This month');

/* ---------- Trends across months ---------- */

/** The last `months` calendar months, each summarised, oldest first. */
export const monthlyTrend = (state, { months = 6, today = state.day } = {}) => {
  const out = [];
  const [y, m] = today.split('-').map(Number);
  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(y, m - 1 - back, 1);
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    const report = periodReport(state, monthDates(stamp), stamp.slice(0, 7));
    if (report.loggedDays) out.push(report);
  }
  return out;
};

/* ---------- Weight ---------- */

/** Your weight readings as a chart-ready series, with the movement across it. */
export const weightChart = (state, { days = 90, today = state.day } = {}) => {
  const from = addDays(today, -days);
  const points = series(state.measurements, 'weight').filter((m) => m.date >= from);
  if (!points.length) return { points: [], readings: 0 };
  const first = points[0];
  const last = points[points.length - 1];
  return {
    points: points.map((p) => ({ date: p.date, value: p.value })),
    readings: points.length,
    from: first.value,
    to: last.value,
    change: round(last.value - first.value, 1),
    min: Math.min(...points.map((p) => p.value)),
    max: Math.max(...points.map((p) => p.value)),
    // One reading is a number, not a line, and the chart should say so.
    enough: points.length >= 2,
  };
};

/* ---------- Nutrient shortfalls ---------- */

/**
 * Nutrients your logged days came up short on, averaged over the days that
 * actually had food in them. Needs a week of records before it will say
 * anything — one thin Tuesday is not a deficiency.
 */
export const deficiencyAlerts = (state, { days = 14, today = state.day, minDays = 7 } = {}) => {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i));
  const { logged } = spanTotals(state.log, dates);
  if (logged.length < minDays) {
    return {
      ready: false,
      loggedDays: logged.length,
      minDays,
      reason: `${minDays} logged days make this worth reading — you have ${logged.length}.`,
      alerts: [],
    };
  }
  const targets = state.targets || {};
  // Only nutrients you're meant to *reach*. Being under a limit — sodium,
  // saturated fat — is the goal, not a shortfall.
  const wanted = NUTRIENTS.filter((n) => n.kind === 'goal' && !HEADLINE_KEYS.includes(n.key) && targets[n.key] > 0);
  const alerts = wanted.map(({ key, label, unit }) => {
    const avg = mean(logged.map((d) => dayTotals(d.entries)[key] || 0));
    const pct = round((avg / targets[key]) * 100);
    return { key, label, avg: round(avg, 1), target: targets[key], pct, unit };
  })
    .filter((row) => row.pct < 70)
    .sort((a, b) => a.pct - b.pct);

  return {
    ready: true,
    loggedDays: logged.length,
    alerts,
    // What the number can and cannot mean.
    caveat: 'Computed from the foods you logged, which is not everything you ate. A low figure here is a prompt to look, not a diagnosis.',
  };
};

/* ---------- Patterns ---------- */

/** When you eat, over the window: the hour each meal usually lands. */
export const timingReport = (state, { days = 28, today = state.day } = {}) => {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i));
  const byMeal = new Map();
  let logged = 0;
  for (const date of dates) {
    const entries = state.log?.[date] || [];
    if (entries.length) logged += 1;
    const seen = new Set();
    for (const entry of entries) {
      const match = /^(\d{1,2}):(\d{2})/.exec(entry.time || '');
      if (!match || seen.has(entry.meal)) continue;
      seen.add(entry.meal);
      const minutes = Number(match[1]) * 60 + Number(match[2]);
      byMeal.set(entry.meal, [...(byMeal.get(entry.meal) || []), minutes]);
    }
  }
  const rows = MEALS.map(({ key, label }) => {
    const list = byMeal.get(key) || [];
    if (!list.length) return null;
    const avg = Math.round(mean(list));
    const spread = Math.round(Math.max(...list) - Math.min(...list));
    return {
      key,
      label,
      days: list.length,
      usualAt: `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`,
      spreadMinutes: spread,
      // Wide spread is the interesting finding, not a failure.
      regular: spread <= 90,
    };
  }).filter(Boolean);
  return { loggedDays: logged, meals: rows };
};

/** How often you hit each target, day by day. */
export const adherenceReport = (state, { days = 28, today = state.day } = {}) => {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i)).reverse();
  const { logged } = spanTotals(state.log, dates);
  const targets = state.targets || {};
  return {
    days,
    loggedDays: logged.length,
    rows: HEADLINE_KEYS.filter((key) => targets[key] > 0).map((key) => {
      const totals = logged.map((d) => dayTotals(d.entries)[key] || 0);
      const within = totals.filter((v) => Math.abs(v - targets[key]) <= targets[key] * 0.1).length;
      const under = totals.filter((v) => v < targets[key] * 0.9).length;
      return {
        key,
        label: nutrientBy[key]?.label || key,
        target: targets[key],
        avg: round(mean(totals), 1),
        within,
        under,
        over: totals.length - within - under,
        pct: totals.length ? round((within / totals.length) * 100) : 0,
      };
    }),
  };
};
