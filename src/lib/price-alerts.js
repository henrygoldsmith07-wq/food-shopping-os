/**
 * Receipt-only price alerts.
 *
 * Honest by design: every alert is computed from shops you recorded, never
 * from a live retailer feed. "Real" prices are your receipts, so a rise or
 * bargain is a comparison of what you actually paid last time vs before.
 *
 * Default threshold is 15% — user-tunable globally and per item, as the
 * recommended controls require.
 */

import { priceHistory } from './kitchen.js';
import { shoppingNameKey } from './shopping.js';

export const DEFAULT_RISE_PCT = 15;
export const DEFAULT_BARGAIN_PCT = 15;
export const MIN_OBSERVATIONS = 2;

const clampPct = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(50, Math.round(n)));
};

export const normalisePriceAlertConfig = (raw = {}) => {
  const overrides = raw?.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides) ? raw.overrides : {};
  const cleanOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    const key = String(k).trim().toLowerCase();
    if (!key) continue;
    const rise = v?.risePct != null ? clampPct(v.risePct, DEFAULT_RISE_PCT) : null;
    const bargain = v?.bargainPct != null ? clampPct(v.bargainPct, DEFAULT_BARGAIN_PCT) : null;
    if (rise != null || bargain != null) cleanOverrides[key] = { ...(rise != null ? { risePct: rise } : {}), ...(bargain != null ? { bargainPct: bargain } : {}) };
  }
  return {
    risePct: clampPct(raw?.risePct, DEFAULT_RISE_PCT),
    bargainPct: clampPct(raw?.bargainPct, DEFAULT_BARGAIN_PCT),
    overrides: cleanOverrides,
  };
};

const thresholdFor = (name, kind, config) => {
  const key = shoppingNameKey(name);
  const perItem = config?.overrides?.[key];
  if (kind === 'rise') return (perItem?.risePct ?? config?.risePct ?? DEFAULT_RISE_PCT) / 100;
  return (perItem?.bargainPct ?? config?.bargainPct ?? DEFAULT_BARGAIN_PCT) / 100;
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
};

/**
 * Baseline for an item: median of all prices before the latest, or previous
 * price when only 2 observations. Returns null when not enough history.
 */
export const baselineFor = (entry) => {
  if (!entry || !Array.isArray(entry.points) || entry.points.length < MIN_OBSERVATIONS) return null;
  const prices = entry.points.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length < MIN_OBSERVATIONS) return null;
  const latest = prices[prices.length - 1];
  const previous = prices.slice(0, -1);
  if (previous.length === 1) return previous[0];
  return median(previous);
};

/**
 * Receipt-only rise and bargain detectors.
 * Each hit includes baseline, latest, pct, and an honest provenance note.
 */
export const derivePriceAnomalies = (shops = [], rawConfig = {}) => {
  const config = normalisePriceAlertConfig(rawConfig);
  const history = priceHistory(shops);
  const rises = [];
  const bargains = [];
  const watchable = [];

  for (const entry of history) {
    if (entry.points.length < MIN_OBSERVATIONS) {
      if (entry.points.length === 1) watchable.push({ name: entry.name, times: 1, latest: entry.latest, reason: 'Need one more receipt for this item to spot rises or bargains.' });
      continue;
    }
    const baseline = baselineFor(entry);
    if (baseline == null || baseline <= 0) continue;
    const latest = Number(entry.latest);
    if (!Number.isFinite(latest) || latest <= 0) continue;
    const pct = (latest - baseline) / baseline;
    const riseThresh = thresholdFor(entry.name, 'rise', config);
    const bargainThresh = thresholdFor(entry.name, 'bargain', config);
    const latestPoint = entry.points[entry.points.length - 1];
    const common = {
      name: entry.name,
      emoji: entry.emoji,
      baseline: Math.round(baseline * 100) / 100,
      latest: Math.round(latest * 100) / 100,
      pct: Math.round(pct * 1000) / 10,
      times: entry.times,
      store: latestPoint?.store || entry.bestStore || null,
      date: latestPoint?.date || null,
      risePct: config.overrides[shoppingNameKey(entry.name)]?.risePct ?? config.risePct,
      bargainPct: config.overrides[shoppingNameKey(entry.name)]?.bargainPct ?? config.bargainPct,
      provenance: 'Receipt-only · from your recorded shops',
    };
    if (pct >= riseThresh) {
      rises.push({ ...common, kind: 'rise', threshold: riseThresh, overBy: Math.round((pct - riseThresh) * 1000) / 10 });
    } else if (pct <= -bargainThresh) {
      bargains.push({ ...common, kind: 'bargain', threshold: bargainThresh, underBy: Math.round((-pct - bargainThresh) * 1000) / 10 });
    }
    // watchable always for tuning surface
    if (!rises.some((r) => r.name === entry.name) && !bargains.some((b) => b.name === entry.name)) {
      watchable.push({ name: entry.name, times: entry.times, baseline: common.baseline, latest: common.latest, pct: common.pct, store: common.store, date: common.date, risePct: common.risePct, bargainPct: common.bargainPct, provenance: common.provenance });
    }
  }

  rises.sort((a, b) => b.pct - a.pct);
  bargains.sort((a, b) => a.pct - b.pct);
  watchable.sort((a, b) => (b.times || 0) - (a.times || 0));

  return {
    config,
    rises,
    bargains,
    watchable,
    summary: {
      riseThreshold: config.risePct,
      bargainThreshold: config.bargainPct,
      rises: rises.length,
      bargains: bargains.length,
      watchable: watchable.length,
    },
  };
};

export const priceAnomalyForList = (items = [], shops = [], rawConfig = {}) => {
  const anomalies = derivePriceAnomalies(shops, rawConfig);
  const byKey = new Map();
  for (const r of anomalies.rises) byKey.set(shoppingNameKey(r.name), { ...r, tone: 'danger' });
  for (const b of anomalies.bargains) byKey.set(shoppingNameKey(b.name), { ...b, tone: 'good' });
  return items
    .map((item) => {
      const hit = byKey.get(shoppingNameKey(item.name));
      return hit ? { item, anomaly: hit } : null;
    })
    .filter(Boolean);
};
