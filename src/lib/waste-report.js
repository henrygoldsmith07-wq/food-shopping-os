import { WASTE_REASONS } from './waste-learning.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (d) => (ISO.test(String(d || '')) ? Math.round(new Date(`${d}T12:00:00Z`) / 86400000) : null);

const REASON_TIPS = {
  expired: 'Most of it went off before you got to it. Buy less of the fresh items, or freeze them on day two.',
  'bought-too-much': 'You bought more than you used. Trim the quantities next shop.',
  'cooked-too-much': 'You cooked more than got eaten. Cook a smaller batch, or freeze portions straight away.',
  forgotten: 'It got forgotten at the back of the fridge. Check "Use first" before you plan.',
  disliked: 'It was not liked. Swap it for something the house eats.',
  'meal-cancelled': 'A planned meal fell through. Plan one fewer dinner next week.',
  'changed-plans': 'Plans changed. Keep one flexible freezer meal in the week.',
  'poor-quality': 'It was poor quality. Try a different brand or store for it.',
};
export const wasteReasonTip = (reason) => REASON_TIPS[reason] || null;

/**
 * Weekly waste report: items binned in the last 7 days against the 7 before,
 * the biggest cause, the repeat offender and one suggested change. Reports
 * only what was logged: nothing is estimated and no cost is invented.
 */
export const wasteReport = ({ waste = [], cooked = [], today = '' } = {}) => {
  const t = dayNum(today);
  if (t === null) return null;
  const inRange = (row, from, to) => { const n = dayNum(row?.date); return n !== null && n > t - from && n <= t - to; };
  const rows = (waste || []).filter((r) => r && r.name);
  const thisWeek = rows.filter((r) => inRange(r, 7, 0));
  const lastWeek = rows.filter((r) => inRange(r, 14, 7));
  const meals = (cooked || []).filter((r) => inRange(r, 7, 0)).length;
  if (!thisWeek.length && !(meals && lastWeek.length)) return null;
  const tally = (list, key) => {
    const m = new Map();
    for (const r of list) { const k = key(r); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  const reasonOf = (r) => (WASTE_REASONS.includes(r.reason) ? r.reason : 'expired');
  const topReason = tally(thisWeek, reasonOf)[0] || null;
  const repeat = tally(thisWeek, (r) => String(r.name).trim().toLowerCase()).find(([, n]) => n >= 2) || null;
  const costs = thisWeek.map((r) => Number(r.cost)).filter((n) => Number.isFinite(n) && n > 0);
  const diff = thisWeek.length - lastWeek.length;
  return {
    binned: thisWeek.length,
    lastWeek: lastWeek.length,
    cooked: meals,
    trend: !lastWeek.length ? 'none' : diff < 0 ? 'down' : diff > 0 ? 'up' : 'same',
    change: Math.abs(diff),
    cost: costs.length === thisWeek.length && costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100 : null,
    topReason: topReason ? { reason: topReason[0], count: topReason[1] } : null,
    repeat: repeat ? { name: repeat[0], count: repeat[1] } : null,
    tip: topReason ? wasteReasonTip(topReason[0]) : null,
  };
};
