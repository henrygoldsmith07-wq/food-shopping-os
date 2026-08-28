import { shoppingNameKey } from './shopping.js';

const round = (value, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
const percentile = (values, p) => {
  if (!values.length) return null;
  const index = (values.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
};

export const priceDistributionFor = (name, shops = []) => {
  const key = shoppingNameKey(name);
  const observations = [];
  for (const shop of shops || []) {
    for (const item of shop.items || []) {
      if (shoppingNameKey(item.name) !== key) continue;
      const price = Number(item.price);
      if (Number.isFinite(price) && price > 0) observations.push({ price, date: shop.date || null, store: shop.store || null });
    }
  }
  const prices = observations.map((row) => row.price).sort((a, b) => a - b);
  if (!prices.length) return { name, observations: 0, prices: [], median: null, low: null, high: null, mean: null, confidence: 'none' };
  const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  return {
    name,
    observations: prices.length,
    prices,
    median: round(percentile(prices, 0.5)),
    low: round(percentile(prices, 0.25)),
    high: round(percentile(prices, 0.75)),
    mean: round(mean),
    confidence: prices.length >= 5 ? 'high' : prices.length >= 3 ? 'medium' : 'low',
    lastObserved: observations.at(-1) || null,
  };
};

export const priceExpectationFor = (item = {}, shops = [], options = {}) => {
  const distribution = priceDistributionFor(item.name, shops);
  const current = Number(item.price);
  if (!distribution.observations || !Number.isFinite(current) || current <= 0) return { ...distribution, current: Number.isFinite(current) ? current : null, deviationPct: null, decision: 'unknown', label: 'Not enough price history to judge this yet.' };
  const deviationPct = round(((current - distribution.median) / distribution.median) * 100, 1);
  const threshold = Number(options.thresholdPct) || 10;
  let decision = 'buy now';
  if (distribution.observations >= 3 && deviationPct >= threshold) decision = options.substituteAvailable ? 'substitute' : 'wait';
  else if (distribution.observations >= 3 && deviationPct <= -threshold) decision = 'stock up';
  const direction = deviationPct > 0 ? 'above' : deviationPct < 0 ? 'below' : 'around';
  return {
    ...distribution,
    current,
    deviationPct,
    decision,
    label: `£${current.toFixed(2)} is approximately ${Math.abs(deviationPct)}% ${direction} your usual observed price of £${distribution.median.toFixed(2)}.`,
    caveat: 'Based on your recorded prices; it describes a range, not a forecast.',
  };
};

export const priceExpectationsForList = (items = [], shops = [], options = {}) => items.map((item) => ({ item, expectation: priceExpectationFor(item, shops, options) }));
