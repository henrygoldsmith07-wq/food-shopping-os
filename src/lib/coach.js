/**
 * What the coach knows.
 *
 * Every figure here is computed locally from your diary, plan and kitchen.
 * This module does not call Forq's server or its OpenAI relay. Each answer
 * carries how many days it was computed from, and anything the data cannot
 * support comes back as `null` with a reason rather than a confident sentence.
 */

import { dayTotals, entryNumbers, mealLabel, MEAL_KEYS } from './nutrition.js';
import { addDays, dayStamp } from './kitchen.js';
import { resolveMaintenance } from './goals.js';
import { isUnderEighteen, YOUTH_COPY } from './youth.js';

const round = (n, dp = 0) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Roughly the energy in a kilo of body weight, used for pace estimates. */
export const KCAL_PER_KG = 7700;

/** Days that actually have entries, newest last. */
export const loggedDays = (log = {}) =>
  Object.keys(log)
    .filter((d) => (log[d] || []).length)
    .sort()
    .map((date) => ({ date, entries: log[date], totals: dayTotals(log[date]) }));

/** The last `days` calendar days, whether or not you logged them. */
export const recentDays = (log = {}, { days = 14, today = dayStamp() } = {}) =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(today, -(days - 1 - i));
    const entries = log[date] || [];
    return { date, entries, totals: dayTotals(entries), logged: entries.length > 0 };
  });

/* ---------- Adherence ---------- */

/**
 * How often you landed near your targets. "Near" is ±10% on calories and at
 * or above target on protein — only days you logged are counted, and the count
 * is returned so nothing reads as a percentage of a week you didn't record.
 */
export const adherence = (log = {}, targets = {}, { days = 14, today = dayStamp() } = {}) => {
  const rows = recentDays(log, { days, today }).filter((d) => d.logged);
  if (!rows.length) return { days: 0, kcalHit: 0, proteinHit: 0, avgKcal: 0, avgProtein: 0 };
  const kcalHit = rows.filter((d) => targets.kcal && Math.abs(d.totals.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  const proteinHit = rows.filter((d) => targets.protein && d.totals.protein >= targets.protein).length;
  return {
    days: rows.length,
    kcalHit,
    proteinHit,
    kcalHitPct: pct(kcalHit, rows.length),
    proteinHitPct: pct(proteinHit, rows.length),
    avgKcal: Math.round(rows.reduce((s, d) => s + d.totals.kcal, 0) / rows.length),
    avgProtein: Math.round(rows.reduce((s, d) => s + d.totals.protein, 0) / rows.length),
  };
};

/** Direction of travel: the second half of a run against the first. */
export const trend = (log = {}, key = 'kcal', { days = 14, today = dayStamp() } = {}) => {
  const rows = recentDays(log, { days, today }).filter((d) => d.logged);
  if (rows.length < 4) return null;
  const half = Math.floor(rows.length / 2);
  const mean = (list) => list.reduce((s, d) => s + (d.totals[key] || 0), 0) / list.length;
  const before = mean(rows.slice(0, half));
  const after = mean(rows.slice(half));
  const change = round(after - before);
  return {
    key,
    before: Math.round(before),
    after: Math.round(after),
    change,
    direction: Math.abs(change) < before * 0.05 ? 'steady' : change > 0 ? 'up' : 'down',
    days: rows.length,
  };
};

/* ---------- Habits ---------- */

const minutesOf = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

const WEEKEND = new Set([0, 6]);

/**
 * The shape of how you eat: when the day starts and ends, how much of it is
 * snacks, which meals you actually log, weekdays against weekends, and what
 * you eat most. Everything is counted, never characterised.
 */
export const habitAnalysis = (log = {}, { today = dayStamp(), days = 28 } = {}) => {
  const rows = recentDays(log, { days, today }).filter((d) => d.logged);
  const entries = rows.flatMap((d) => d.entries);
  if (!entries.length) return { days: 0, entries: 0 };

  const times = entries.map((e) => minutesOf(e.time)).filter((m) => m !== null).sort((a, b) => a - b);
  const kcalOf = (e) => entryNumbers(e).kcal || 0;
  const snackKcal = entries.filter((e) => e.meal === 'snack').reduce((s, e) => s + kcalOf(e), 0);
  const totalKcal = entries.reduce((s, e) => s + kcalOf(e), 0);

  const byMeal = Object.fromEntries(MEAL_KEYS.map((key) => [
    key,
    rows.filter((d) => d.entries.some((e) => e.meal === key)).length,
  ]));
  // "You skip breakfast" needs more than one day behind it.
  const skipped = rows.length < 3 ? [] : MEAL_KEYS
    .filter((key) => key !== 'snack' && byMeal[key] < rows.length * 0.5)
    .map((key) => ({ key, label: mealLabel(key), days: byMeal[key] }));

  const weekend = rows.filter((d) => WEEKEND.has(new Date(`${d.date}T12:00:00`).getDay()));
  const weekday = rows.filter((d) => !WEEKEND.has(new Date(`${d.date}T12:00:00`).getDay()));
  const avg = (list) => (list.length ? Math.round(list.reduce((s, d) => s + d.totals.kcal, 0) / list.length) : 0);

  const counts = new Map();
  for (const e of entries) {
    if (!e.name) continue;
    counts.set(e.name, (counts.get(e.name) || 0) + 1);
  }

  return {
    days: rows.length,
    entries: entries.length,
    perDay: round(entries.length / rows.length, 1),
    window: times.length >= 2
      ? {
        first: `${String(Math.floor(times[0] / 60)).padStart(2, '0')}:${String(times[0] % 60).padStart(2, '0')}`,
        last: `${String(Math.floor(times[times.length - 1] / 60)).padStart(2, '0')}:${String(times[times.length - 1] % 60).padStart(2, '0')}`,
        hours: round((times[times.length - 1] - times[0]) / 60, 1),
      }
      : null,
    snackShare: pct(snackKcal, totalKcal),
    mealsLogged: byMeal,
    skipped,
    weekday: avg(weekday),
    weekend: avg(weekend),
    weekendGap: weekday.length && weekend.length ? avg(weekend) - avg(weekday) : null,
    topFoods: [...counts.entries()]
      .map(([name, times2]) => ({ name, times: times2 }))
      .filter((f) => f.times > 1)
      .sort((a, b) => b.times - a.times)
      .slice(0, 5),
    consistency: pct(rows.length, Math.min(days, 14)),
  };
};

/* ---------- Progress ---------- */

const GOAL_DIRECTION = { lose: -1, gain: 1, muscle: 1, recomp: 0, maintain: 0 };

/**
 * Where the current pace puts you.
 *
 * The estimate is arithmetic, not a promise: average logged intake against the
 * maintenance figure the app already derives, converted at ~7,700 kcal a kilo.
 * It refuses to run on fewer than five logged days, and says out loud that it
 * assumes your logging is complete.
 */
export const predictProgress = (state, { days = 14, today = dayStamp() } = {}) => {
  // Under 18 there is no estimate to give: growth breaks the arithmetic, and a
  // dated weight projection is not something this app should hand a child.
  if (isUnderEighteen(state)) {
    return { ready: false, youth: true, reason: YOUTH_COPY.prediction, days: 0 };
  }
  const rows = recentDays(state.log, { days, today }).filter((d) => d.logged);
  const maintenance = resolveMaintenance(state);
  if (rows.length < 5) {
    return { ready: false, reason: `Five logged days gives an honest estimate — you have ${rows.length}.`, days: rows.length };
  }
  if (!maintenance) {
    return { ready: false, reason: 'I need your maintenance calories: add your body stats, or type a figure, under Goals.', days: rows.length };
  }
  const avgKcal = Math.round(rows.reduce((s, d) => s + d.totals.kcal, 0) / rows.length);
  const balance = avgKcal - maintenance;
  const perWeekKg = round((balance * 7) / KCAL_PER_KG, 2);
  const weight = state.body?.weightKg || null;
  const target = state.body?.targetWeightKg || null;
  const wanted = GOAL_DIRECTION[state.goal] ?? 0;

  let toTarget = null;
  if (weight && target && perWeekKg !== 0) {
    const gap = target - weight;
    const weeks = gap / perWeekKg;
    toTarget = weeks > 0 && weeks < 260
      ? { gapKg: round(gap, 1), weeks: Math.round(weeks), date: addDays(today, Math.round(weeks * 7)) }
      : { gapKg: round(gap, 1), weeks: null, date: null };
  }

  return {
    ready: true,
    days: rows.length,
    avgKcal,
    maintenance,
    balance,
    perWeekKg,
    direction: perWeekKg < -0.05 ? 'losing' : perWeekKg > 0.05 ? 'gaining' : 'holding',
    // Whether the pace is going the way the goal wants.
    onCourse: wanted === 0 ? Math.abs(perWeekKg) < 0.25 : Math.sign(perWeekKg) === Math.sign(wanted),
    toTarget,
    caveat: 'Assumes everything you ate is logged and that the maintenance figure is about right.',
  };
};

/* ---------- The day in one place ---------- */

/** A plain reading of today: what landed, what's left, what's planned. */
export const dailySummary = (state, { today = dayStamp() } = {}) => {
  const entries = state.log[today] || [];
  const totals = dayTotals(entries);
  const targets = state.targets || {};
  const left = {
    kcal: Math.round((targets.kcal || 0) - totals.kcal),
    protein: Math.round((targets.protein || 0) - totals.protein),
  };
  const meals = MEAL_KEYS
    .filter((key) => entries.some((e) => e.meal === key))
    .map((key) => ({
      key,
      label: mealLabel(key),
      kcal: Math.round(entries.filter((e) => e.meal === key).reduce((s, e) => s + (entryNumbers(e).kcal || 0), 0)),
    }));
  const planned = state.plan?.[today] || {};

  return {
    logged: entries.length,
    totals,
    left,
    meals,
    plannedMeals: Object.keys(planned).length,
    fibre: Math.round(totals.fibre || 0),
    water: state.hydration?.glasses ?? null,
    complete: entries.length > 0 && left.kcal <= (targets.kcal || 0) * 0.15,
  };
};
