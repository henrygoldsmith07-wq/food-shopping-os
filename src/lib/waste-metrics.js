import { addDays } from './kitchen.js';

const round = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round((Number(value) || 0) * scale) / scale;
};

const rowsBetween = (rows, from, to) => (rows || []).filter((row) => String(row.date || '').slice(0, 10) >= from && String(row.date || '').slice(0, 10) <= to);
const valueOf = (row) => Number(row.cost ?? row.value ?? 0) || 0;
const itemCountOf = (row) => Math.max(1, Number(row.quantity ?? row.count ?? 1) || 1);

const period = (waste, from, to, shops = []) => {
  const rows = rowsBetween(waste, from, to);
  const shopRows = rowsBetween(shops, from, to);
  const cost = round(rows.reduce((sum, row) => sum + valueOf(row), 0));
  const avoidable = rows.filter((row) => row.avoidable !== false && row.reason !== 'poor-quality');
  const avoidableCost = round(avoidable.reduce((sum, row) => sum + valueOf(row), 0));
  const items = rows.reduce((sum, row) => sum + itemCountOf(row), 0);
  const avoidableItems = avoidable.reduce((sum, row) => sum + itemCountOf(row), 0);
  const spend = shopRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  return {
    from, to, cost, items, avoidableCost, avoidableItems,
    avoidableRate: items ? round((avoidableItems / items) * 100, 1) : null,
    weeklyCost: round((cost * 7) / Math.max(1, dateSpan(from, to)), 2),
    estimatedWastePrevented: 0,
    wasteAsSpendRate: spend ? round((cost / spend) * 100, 1) : null,
    rows,
  };
};

const dateSpan = (from, to) => Math.max(1, Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1);
const monthStart = (date) => `${String(date).slice(0, 7)}-01`;
const monthEnd = (date) => addDays(addDays(monthStart(date), 32).slice(0, 7) + '-01', -1);

/**
 * Derived, deliberately non-gamified household waste report. Prevention is
 * estimated only from the reduction between comparable periods and never
 * presented as money saved with certainty.
 */
export const householdWasteMetrics = (state = {}, today = state.day) => {
  const currentStart = monthStart(today);
  const currentEnd = String(today).slice(0, 10);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = monthStart(previousEnd);
  const current = period(state.waste || [], currentStart, currentEnd, state.shops || []);
  const previous = period(state.waste || [], previousStart, previousEnd, state.shops || []);
  const elapsedCurrent = dateSpan(currentStart, currentEnd);
  const elapsedPrevious = dateSpan(previousStart, previousEnd);
  const currentWeekly = round((current.avoidableCost * 7) / elapsedCurrent);
  const previousWeekly = round((previous.avoidableCost * 7) / elapsedPrevious);
  const prevented = Math.max(0, round(previousWeekly - currentWeekly));
  current.estimatedWastePrevented = prevented;
  const improvements = new Map();
  for (const row of previous.rows) {
    const key = String(row.name || '').toLowerCase();
    if (!key) continue;
    improvements.set(key, (improvements.get(key) || 0) + valueOf(row));
  }
  for (const row of current.rows) {
    const key = String(row.name || '').toLowerCase();
    if (!key) continue;
    improvements.set(key, (improvements.get(key) || 0) - valueOf(row));
  }
  const mainImprovement = [...improvements.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    current: { ...current, weeklyCost: currentWeekly },
    previous: { ...previous, weeklyCost: previousWeekly },
    estimatedWastePrevented: prevented,
    mainImprovement,
    comparison: {
      currentAvoidable: currentWeekly,
      previousAvoidable: previousWeekly,
      reductionPct: previousWeekly ? round(((previousWeekly - currentWeekly) / previousWeekly) * 100, 1) : null,
      confidence: current.rows.length + previous.rows.length >= 4 ? 'observed' : 'early estimate',
    },
  };
};
