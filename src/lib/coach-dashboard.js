import { entryNumbers } from './nutrition.js';

const round = (value) => Math.round(value);

const average = (rows, key) => (rows.length
  ? round(rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length)
  : 0);

const percentage = (value, total) => (total ? Math.round((value / total) * 100) : 0);

const dayRow = (date, entries = []) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const totals = safeEntries.reduce((sum, entry) => {
    const macros = entryNumbers(entry);
    return {
      kcal: sum.kcal + (macros.kcal || 0),
      protein: sum.protein + (macros.protein || 0),
    };
  }, { kcal: 0, protein: 0 });
  return { date, entries: safeEntries.length, ...totals };
};

/**
 * A deliberately small, aggregate-only view for the shared coaching page.
 * The page renders no food names or raw diary entries.
 */
export const coachPulse = (log = {}, targets = {}, limit = 14) => {
  const source = log && typeof log === 'object' && !Array.isArray(log) ? log : {};
  const count = Math.max(0, Number(limit) || 0);
  const rows = (count ? Object.keys(source).sort().slice(-count) : [])
    .map((date) => dayRow(date, source[date]));
  const logged = rows.filter((row) => row.entries > 0);
  const kcalTarget = Number(targets.kcal) || 0;
  const proteinTarget = Number(targets.protein) || 0;
  const kcalHits = kcalTarget
    ? logged.filter((row) => Math.abs(row.kcal - kcalTarget) <= kcalTarget * 0.1).length
    : 0;
  const proteinHits = proteinTarget
    ? logged.filter((row) => row.protein >= proteinTarget).length
    : 0;

  return {
    rows,
    loggedDays: logged.length,
    avgKcal: average(logged, 'kcal'),
    avgProtein: average(logged, 'protein'),
    kcalTarget,
    proteinTarget,
    kcalHits,
    proteinHits,
    kcalHitPct: percentage(kcalHits, logged.length),
    proteinHitPct: percentage(proteinHits, logged.length),
  };
};

export const coachFocus = (pulse) => {
  if (!pulse.loggedDays || pulse.loggedDays < 3) {
    return 'A few more logged days will make this picture useful. The first goal is simply a reliable record.';
  }
  if (pulse.proteinTarget && pulse.proteinHitPct < 50) {
    return `Protein reached target on ${pulse.proteinHits} of ${pulse.loggedDays} logged days. Review meal balance before changing the target.`;
  }
  if (pulse.kcalTarget && pulse.kcalHitPct < 50) {
    return `Calories landed near target on ${pulse.kcalHits} of ${pulse.loggedDays} logged days. Look for a repeatable meal pattern rather than chasing one day.`;
  }
  return 'The recent record is consistent enough to review together. Keep the next change small and observable.';
};
