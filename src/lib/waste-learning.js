import { canonicalName } from './aliases.js';

export const WASTE_REASONS = [
  'expired', 'bought-too-much', 'disliked', 'meal-cancelled',
  'forgotten', 'poor-quality', 'cooked-too-much', 'changed-plans',
];

const dateAge = (from, to) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ''))) return null;
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
};

const keyFor = (name, aliases = {}) => canonicalName(String(name || '').trim(), aliases) || String(name || '').trim().toLowerCase();

const empty = (key, name) => ({ key, name, purchases: 0, wasteEvents: 0, wastedQty: 0, reasons: {}, dates: [] });

/** Aggregate purchase and waste evidence, retaining the reason distribution. */
export const wasteLearningProfile = ({ purchases = [], waste = [], today, learnedAliases = {}, lookbackDays = 70 } = {}) => {
  const rows = new Map();
  const ensure = (name) => {
    const key = keyFor(name, learnedAliases);
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, empty(key, String(name).trim()));
    return rows.get(key);
  };
  for (const purchase of purchases || []) {
    for (const item of purchase.items || []) {
      const row = ensure(item.name);
      const age = dateAge(purchase.date, today);
      if (!row || (age !== null && (age < 0 || age > lookbackDays))) continue;
      row.purchases += Math.max(1, Number(item.quantity || item.qtyNumber || 1) || 1);
      if (purchase.date) row.dates.push(purchase.date);
    }
  }
  for (const item of waste || []) {
    const row = ensure(item.name || item.item?.name);
    const date = item.date || item.discardedAt;
    const age = dateAge(date, today);
    if (!row || (age !== null && (age < 0 || age > lookbackDays))) continue;
    const reason = WASTE_REASONS.includes(item.reason) ? item.reason : 'expired';
    row.wasteEvents += 1;
    row.wastedQty += Math.max(1, Number(item.quantity || item.qtyNumber || 1) || 1);
    row.reasons[reason] = (row.reasons[reason] || 0) + 1;
    if (date) row.dates.push(date);
  }
  return [...rows.values()].map((row) => {
    const topReason = Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const wasteRate = row.purchases ? row.wasteEvents / row.purchases : 0;
    const quantityReduction = topReason === 'bought-too-much' || topReason === 'expired' || topReason === 'cooked-too-much'
      ? Math.min(0.5, 0.15 + wasteRate * 0.35)
      : 0;
    return {
      ...row,
      topReason,
      wasteRate: Math.round(wasteRate * 100) / 100,
      quantityReduction: Math.round(quantityReduction * 100) / 100,
      learned: row.wasteEvents >= 2 && row.purchases >= 3,
      lastWasteDate: [...row.dates].sort().at(-1) || null,
    };
  }).sort((a, b) => b.wasteEvents - a.wasteEvents || b.purchases - a.purchases);
};

const reduceQty = (qty, factor) => {
  const match = String(qty || '').trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match || !factor) return null;
  const unit = match[2].trim();
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 1 || /^(?:g|kg|ml|l|cl|oz|lb|grams?|kilograms?|millilitres?|litres?)$/i.test(unit)) return null;
  const next = Math.max(1, Math.ceil(value * (1 - factor)));
  return unit ? `${next} ${unit}` : String(next);
};

/** Apply learned quantity reductions only where repeated evidence supports it. */
export const applyWasteLearning = (items = [], profile = []) => {
  const byKey = new Map(profile.map((row) => [row.key, row]));
  return (items || []).map((item) => {
    const row = byKey.get(keyFor(item.name));
    if (!row?.learned) return item;
    const qty = reduceQty(item.qty, row.quantityReduction);
    const reason = row.topReason === 'expired' ? 'expired too often' : row.topReason === 'bought-too-much' ? 'bought too much' : row.topReason === 'cooked-too-much' ? 'cooked too much' : row.topReason;
    return {
      ...item,
      qty: qty || item.qty,
      wasteLearning: {
        reduced: Boolean(qty),
        reduction: row.quantityReduction,
        purchases: row.purchases,
        wasteEvents: row.wasteEvents,
        reason,
        note: `Bought ${row.purchases} time${row.purchases === 1 ? '' : 's'} recently; wasted on ${row.wasteEvents} occasion${row.wasteEvents === 1 ? '' : 's'}. ${qty ? 'Suggested quantity reduced.' : 'Consider a smaller pack.'}`,
      },
    };
  });
};

export const learnedWasteInsights = (profile = []) => profile.filter((row) => row.learned).map((row) => ({
  ...row,
  message: `You bought ${row.name} ${row.purchases} times recently and wasted some on ${row.wasteEvents} occasions. I'm reducing future suggested quantities.`,
}));
