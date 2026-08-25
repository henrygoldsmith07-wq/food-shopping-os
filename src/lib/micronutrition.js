/**
 * Micronutrient reading: what a day, and a week, actually delivered.
 *
 * Three questions this answers, and nothing more:
 *   - is today short of, or over, a nutrient's published levels?
 *   - across the logged period, which gaps keep coming back?
 *   - what food would close the biggest ones?
 *
 * The answers are food-only by design. A shortfall names ingredients you could
 * cook, never a supplement — a shopping app has no business prescribing pills,
 * and "eat more spinach" is a thing this app can actually help you buy.
 *
 * Unknown is never zero. A nutrient with no measured entries all day reads as
 * `unmeasured` and is kept out of the deficiency ranking, because a food
 * catalogue that has not been asked about folate is not evidence of a folate
 * gap.
 */

import {
  MICRONUTRIENT_KEYS, nutrientBy, NUTRIENTS, UPPER_LIMITS,
} from '../data/nutrients.js';
import { CATALOGUE } from '../data/foods.js';
import { dayTotals } from './nutrition.js';

/** Status bands, worst first — the order deficiencies are ranked in. */
export const MICRO_STATUS = ['excess', 'deficient', 'low', 'adequate', 'ample', 'unmeasured'];

/** Below this share of the reference intake counts as a deficiency. */
export const DEFICIENT_PCT = 50;
/** Between deficient and this is "low" — short, but not starkly so. */
export const LOW_PCT = 80;
/** Past this share of the published upper level, an intake is flagged. */
export const EXCESS_PCT = 100;

const statusFor = (pct, upperPct, measured) => {
  if (!measured) return 'unmeasured';
  if (upperPct !== null && upperPct >= EXCESS_PCT) return 'excess';
  if (pct < DEFICIENT_PCT) return 'deficient';
  if (pct < LOW_PCT) return 'low';
  if (pct < 100) return 'adequate';
  return 'ample';
};

export const statusTone = (status) => ({
  excess: 'danger',
  deficient: 'danger',
  low: 'warn',
  adequate: 'muted',
  ample: 'good',
  unmeasured: 'faint',
}[status] || 'muted');

export const statusLabel = (status) => ({
  excess: 'Over the upper level',
  deficient: 'Well short',
  low: 'A little short',
  adequate: 'Nearly there',
  ample: 'Target met',
  unmeasured: 'Not measured',
}[status] || status);

/**
 * One micronutrient's standing for a set of totals.
 *
 * `pct` is against the reference intake, `upperPct` against the published
 * tolerable upper level where one exists. A nutrient with no upper level can
 * never read as excess — silence from the authorities is not a limit.
 */
export const microRow = (key, totals = {}, targets = {}) => {
  const nutrient = nutrientBy[key];
  if (!nutrient) return null;
  const detail = totals.detail?.[key];
  const value = detail ? detail.value : (totals[key] ?? null);
  const measured = value !== null && value !== undefined;
  const target = targets[key] ?? nutrient.target;
  const upper = UPPER_LIMITS[key] ?? null;
  const pct = measured && target ? Math.round((value / target) * 100) : 0;
  const upperPct = measured && upper ? Math.round((value / upper) * 100) : null;
  const status = statusFor(pct, upperPct, measured);
  return {
    key,
    label: nutrient.label,
    unit: nutrient.unit,
    group: nutrient.group,
    value: measured ? value : null,
    target,
    upper,
    pct,
    upperPct,
    status,
    tone: statusTone(status),
    /** How much of the reference intake is still missing, in the unit shown. */
    shortfall: measured && target && value < target
      ? Math.round((target - value) * 100) / 100
      : 0,
    coverage: detail?.coverage ?? (measured ? 100 : 0),
    confidence: detail?.confidence ?? 'low',
  };
};

/** Every deep-tracked micronutrient's standing, in catalogue order. */
export const microRows = (totals = {}, targets = {}) =>
  MICRONUTRIENT_KEYS.map((key) => microRow(key, totals, targets)).filter(Boolean);

/**
 * A day's micronutrient report: the rows, plus the flags worth acting on.
 *
 * `deficient` and `low` are the gaps; `excess` is the far rarer other end,
 * and only ever names nutrients with a published upper level.
 */
export const dailyMicroReport = (entries = [], targets = {}) => {
  const totals = dayTotals(entries);
  const rows = microRows(totals, targets);
  return {
    rows,
    deficient: rows.filter((row) => row.status === 'deficient'),
    low: rows.filter((row) => row.status === 'low'),
    excess: rows.filter((row) => row.status === 'excess'),
    met: rows.filter((row) => row.status === 'ample'),
    unmeasured: rows.filter((row) => row.status === 'unmeasured'),
    entryCount: entries.length,
  };
};

const dayEntries = (log = {}, date) => (Array.isArray(log[date]) ? log[date] : []);

/**
 * Micronutrients across a run of days.
 *
 * Only days that were actually logged count towards an average — an untouched
 * day is a day with no diary, not a day of eating nothing, and averaging zeros
 * into the week would invent deficiencies the user never had.
 */
export const weeklyMicroTrend = (log = {}, dates = [], targets = {}) => {
  const days = dates.map((date) => {
    const entries = dayEntries(log, date);
    return { date, logged: entries.length > 0, report: dailyMicroReport(entries, targets) };
  });
  const logged = days.filter((day) => day.logged);

  const nutrients = MICRONUTRIENT_KEYS.map((key) => {
    const rows = logged.map((day) => day.report.rows.find((row) => row.key === key)).filter(Boolean);
    const measured = rows.filter((row) => row.value !== null);
    const target = measured[0]?.target ?? rows[0]?.target ?? nutrientBy[key]?.target ?? 0;
    const total = measured.reduce((sum, row) => sum + row.value, 0);
    const average = measured.length ? total / measured.length : null;
    const shortDays = rows.filter((row) => row.status === 'deficient' || row.status === 'low').length;
    const excessDays = rows.filter((row) => row.status === 'excess').length;
    return {
      key,
      label: nutrientBy[key]?.label || key,
      unit: nutrientBy[key]?.unit || '',
      target,
      average: average === null ? null : Math.round(average * 100) / 100,
      averagePct: average !== null && target ? Math.round((average / target) * 100) : 0,
      measuredDays: measured.length,
      loggedDays: logged.length,
      shortDays,
      excessDays,
      /** The daily percentages, in date order, for a sparkline. */
      series: days.map((day) => (day.logged
        ? day.report.rows.find((row) => row.key === key)?.pct ?? 0
        : null)),
    };
  });

  return {
    dates,
    loggedDays: logged.length,
    days,
    nutrients,
    /** Nutrients short on at least half the logged days, worst first. */
    persistentGaps: nutrients
      .filter((n) => n.measuredDays > 0 && n.shortDays * 2 >= logged.length && n.shortDays > 0)
      .sort((a, b) => b.shortDays - a.shortDays || a.averagePct - b.averagePct),
  };
};

/**
 * Foods that would move a nutrient most, ranked by what one ordinary serving
 * delivers rather than by the per-100 g figure — 100 g of parsley wins every
 * table and nobody eats it.
 */
export const foodSourcesFor = (key, {
  catalogue = CATALOGUE, limit = 3, exclude = () => false, targets = {},
} = {}) => {
  const target = targets[key] ?? nutrientBy[key]?.target ?? 0;
  return catalogue
    .filter((food) => !exclude(food))
    .map((food) => {
      const per100 = food.per100?.[key];
      if (per100 === null || per100 === undefined || !(per100 > 0)) return null;
      const grams = food.servings?.[0]?.grams || 100;
      const amount = (per100 * grams) / 100;
      return {
        id: food.id,
        name: food.name,
        emoji: food.emoji,
        serving: food.servings?.[0]?.label || `${grams} ${food.unit || 'g'}`,
        amount: Math.round(amount * 100) / 100,
        pct: target ? Math.round((amount / target) * 100) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

/**
 * The three gaps most worth doing something about, each with food to close it.
 *
 * Ranked by how far short the day fell, then by how often the week fell short,
 * so a nutrient missed every day outranks one missed once. Nutrients with no
 * measured data are never ranked — see the note at the top of this file.
 */
export const topDeficiencies = (report, {
  trend = null, catalogue = CATALOGUE, limit = 3, exclude = () => false, targets = {},
} = {}) => {
  const short = [...(report?.deficient || []), ...(report?.low || [])];
  const daysShort = (key) => trend?.nutrients?.find((n) => n.key === key)?.shortDays ?? 0;
  return short
    .sort((a, b) => a.pct - b.pct || daysShort(b.key) - daysShort(a.key))
    .slice(0, limit)
    .map((row) => ({
      ...row,
      shortDays: daysShort(row.key),
      sources: foodSourcesFor(row.key, { catalogue, exclude, targets }),
    }));
};

/** A plain sentence for a gap, naming food and never a supplement. */
export const deficiencyAdvice = (gap) => {
  if (!gap) return '';
  if (!gap.sources?.length) {
    return `${gap.label} came to ${gap.pct}% of the reference intake. Nothing in your catalogue is recorded as a source, so log what you ate more precisely before reading much into it.`;
  }
  const names = gap.sources.map((source) => source.name.toLowerCase());
  const list = names.length > 1
    ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
    : names[0];
  const best = gap.sources[0];
  return `${gap.label} came to ${gap.pct}% of the reference intake. ${list} would close it — ${best.serving} of ${best.name.toLowerCase()} is about ${best.pct}% on its own.`;
};

/** Micronutrient groups, for laying the rows out the way the panel reads. */
const GROUP_LABELS = {
  mineral: 'Minerals',
  vitamin: 'Vitamins',
  bvitamin: 'B vitamins',
  fat: 'Fatty acids',
};

export const MICRO_GROUPS = ['mineral', 'vitamin', 'bvitamin', 'fat'].map((id) => ({
  id,
  label: GROUP_LABELS[id],
  keys: NUTRIENTS
    .filter((n) => n.group === id && MICRONUTRIENT_KEYS.includes(n.key))
    .map((n) => n.key),
})).filter((group) => group.keys.length > 0);
