import { shoppingNameKey } from './shopping.js';
import { evidenceConfidence } from './confidence.js';

const DAY = 86400000;
const round = (value, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
const dateValue = (stamp) => {
  const value = new Date(`${stamp}T12:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
};
const daysBetween = (a, b) => {
  const left = dateValue(a);
  const right = dateValue(b);
  return left === null || right === null ? null : Math.max(0, Math.round((right - left) / DAY));
};

export const consumptionRateFor = (name, shops = [], { minPurchases = 2 } = {}) => {
  const key = shoppingNameKey(name);
  const purchases = [];
  for (const shop of shops || []) {
    for (const item of shop.items || []) {
      if (shoppingNameKey(item.name) !== key || !shop.date) continue;
      const quantity = Number(item.quantity ?? item.count ?? item.qtyNumber ?? 1);
      purchases.push({ date: shop.date, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, store: shop.store || null });
    }
  }
  purchases.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (purchases.length < minPurchases) return { name, purchases: purchases.length, rate: null, confidence: 'insufficient', reason: 'Need at least two dated purchases.' };
  const intervals = purchases.slice(1).map((purchase, index) => daysBetween(purchases[index].date, purchase.date)).filter((days) => days !== null && days > 0);
  if (!intervals.length) return { name, purchases: purchases.length, rate: null, confidence: 'insufficient', reason: 'Purchase dates do not show a repeat interval.' };
  const quantities = purchases.slice(-Math.max(3, intervals.length)).map((purchase) => purchase.quantity);
  const averageQuantity = quantities.reduce((sum, value) => sum + value, 0) / quantities.length;
  const averageInterval = intervals.slice(-Math.max(2, quantities.length - 1)).reduce((sum, value) => sum + value, 0) / Math.min(intervals.length, Math.max(2, quantities.length - 1));
  const unitsPerDay = averageQuantity / Math.max(1, averageInterval);
  return {
    name,
    purchases: purchases.length,
    averageQuantity: round(averageQuantity),
    averageIntervalDays: round(averageInterval, 1),
    unitsPerDay: round(unitsPerDay, 3),
    confidence: purchases.length >= 5 ? 'high' : purchases.length >= 3 ? 'medium' : 'low',
    lastPurchase: purchases.at(-1),
    intervals,
  };
};

export const runoutPredictionFor = (item = {}, shops = [], { today = '', safetyDays = 1 } = {}) => {
  const rate = consumptionRateFor(item.name, shops);
  const quantity = Number(item.quantity ?? item.count ?? item.qtyNumber);
  if (!rate.rate && !rate.unitsPerDay) return { ...rate, currentQuantity: Number.isFinite(quantity) ? quantity : null, runoutDate: null, action: 'observe' };
  const currentQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : rate.averageQuantity;
  const daysRemaining = Math.max(0, Math.ceil(currentQuantity / rate.unitsPerDay));
  const lastDate = today || rate.lastPurchase?.date;
  const runoutDate = lastDate && dateValue(lastDate) !== null ? new Date(dateValue(lastDate) + daysRemaining * DAY).toISOString().slice(0, 10) : null;
  const buyByDate = runoutDate && dateValue(runoutDate) !== null ? new Date(dateValue(runoutDate) - safetyDays * DAY).toISOString().slice(0, 10) : null;
  return {
    ...rate,
    currentQuantity,
    daysRemaining,
    runoutDate,
    buyByDate,
    action: rate.confidence === 'insufficient' ? 'observe' : 'plan',
    label: runoutDate ? `${item.name} likely runs out around ${runoutDate}.` : `${item.name} has a developing consumption pattern.`,
    caveat: 'An estimate from your purchase rhythm, not a guaranteed stock forecast.',
    confidenceEvidence: evidenceConfidence({ confidence: rate.confidence, source: 'history', inferred: true }),
  };
};

export const consumptionPredictionsFor = (items = [], shops = [], options = {}) => items.map((item) => ({ item, prediction: runoutPredictionFor(item, shops, options) }));
