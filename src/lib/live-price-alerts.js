/**
 * Rises and falls in the prices the app checked itself.
 *
 * The app already flags rises and bargains against your receipts. This asks
 * the same question of the live checks kept on the device, which answers
 * something receipts cannot: a receipt only moves when you buy the thing
 * again, so a shelf price that climbed 20% since March goes unnoticed until
 * you are standing in front of it. A daily check notices in a day.
 *
 * Everything about the judgement is borrowed rather than reinvented — the same
 * baseline (median of prior observations), the same thresholds, the same
 * per-item overrides. Two separate notions of "a big rise" in one app would be
 * one too many, and the one the user already tuned should win.
 *
 * What is not borrowed is the provenance. A live rise says it came from shop
 * pages; a receipt rise says it came from your receipts. They are different
 * claims about different evidence and must never be shown as the same thing.
 */

import { MIN_OBSERVATIONS, baselineFor, normalisePriceAlertConfig, thresholdFor } from './price-alerts.js';
import { shoppingNameKey } from './shopping.js';

export const LIVE_PROVENANCE = 'Live · from shop pages Forq checked';

/** History points as the shared baseline helper expects them. */
const asPricePoints = (entry) => ({
  points: (entry?.points || []).map((point) => ({ date: point.date, price: point.best })),
});

/** Which shop had the cheapest price at a point in the history. */
const shopAt = (point) => {
  const rows = Object.values(point?.shops || {});
  if (!rows.length) return null;
  return rows.sort((a, b) => a.price - b.price)[0]?.retailer || null;
};

/**
 * One item's movement, or null when there is not enough history to have an
 * opinion. Two observations is the floor: a single check is a price, not a
 * trend, and calling it one would make every first check look like news.
 */
export const liveMovementFor = (name, entry, rawConfig = {}) => {
  const config = normalisePriceAlertConfig(rawConfig);
  const points = entry?.points || [];
  if (points.length < MIN_OBSERVATIONS) {
    return points.length === 1
      ? {
        name,
        kind: 'watching',
        latest: points[0].best,
        reason: 'Checked once. One more check and Forq can tell you if it moved.',
        provenance: LIVE_PROVENANCE,
      }
      : null;
  }
  const baseline = baselineFor(asPricePoints(entry));
  const latestPoint = points.at(-1);
  const latest = Number(latestPoint?.best);
  if (baseline === null || baseline <= 0 || !Number.isFinite(latest) || latest <= 0) return null;

  const pct = (latest - baseline) / baseline;
  const riseThreshold = thresholdFor(name, 'rise', config);
  const fallThreshold = thresholdFor(name, 'bargain', config);
  const common = {
    name,
    baseline: Math.round(baseline * 100) / 100,
    latest: Math.round(latest * 100) / 100,
    change: Math.round((latest - baseline) * 100) / 100,
    pct: Math.round(pct * 1000) / 10,
    checks: points.length,
    store: shopAt(latestPoint),
    date: latestPoint?.date || null,
    since: points[0]?.date || null,
    provenance: LIVE_PROVENANCE,
  };
  if (pct >= riseThreshold) {
    return { ...common, kind: 'rise', threshold: Math.round(riseThreshold * 1000) / 10 };
  }
  if (pct <= -fallThreshold) {
    return { ...common, kind: 'fall', threshold: Math.round(fallThreshold * 1000) / 10 };
  }
  return { ...common, kind: 'steady' };
};

/**
 * Every movement worth telling someone about, across the whole history.
 *
 * `steady` and `watching` are computed but kept out of the alert lists — they
 * belong in the detail view, not in a warning. An app that warns about
 * everything has taught you to ignore its warnings.
 */
export const liveMovements = (store = {}, rawConfig = {}) => {
  const rises = [];
  const falls = [];
  const steady = [];
  const watching = [];
  for (const [, entry] of Object.entries(store)) {
    if (!entry?.name) continue;
    const movement = liveMovementFor(entry.name, entry, rawConfig);
    if (!movement) continue;
    if (movement.kind === 'rise') rises.push(movement);
    else if (movement.kind === 'fall') falls.push(movement);
    else if (movement.kind === 'watching') watching.push(movement);
    else steady.push(movement);
  }
  rises.sort((a, b) => b.pct - a.pct);
  falls.sort((a, b) => a.pct - b.pct);
  return {
    rises,
    falls,
    steady,
    watching,
    summary: {
      rises: rises.length,
      falls: falls.length,
      steady: steady.length,
      watching: watching.length,
      tracked: rises.length + falls.length + steady.length + watching.length,
    },
  };
};

/** Movements keyed for a shopping list, so a row can show its own warning. */
export const liveMovementsForList = (items = [], store = {}, rawConfig = {}) => {
  const byKey = {};
  for (const item of items) {
    const key = shoppingNameKey(item?.name);
    const entry = key ? store[key] : null;
    if (!entry) continue;
    const movement = liveMovementFor(entry.name || item.name, entry, rawConfig);
    if (movement && (movement.kind === 'rise' || movement.kind === 'fall')) byKey[key] = movement;
  }
  return byKey;
};

/** One line a person can read, rather than a percentage they have to decode. */
export const movementSentence = (movement) => {
  if (!movement) return null;
  if (movement.kind === 'watching') return movement.reason;
  const money = `£${Math.abs(movement.change).toFixed(2)}`;
  const where = movement.store ? ` at ${movement.store}` : '';
  if (movement.kind === 'rise') {
    return `Up ${money} (${movement.pct}%) since Forq started checking${where}.`;
  }
  if (movement.kind === 'fall') {
    return `Down ${money} (${Math.abs(movement.pct)}%)${where} — cheaper than it has been.`;
  }
  return `Steady across ${movement.checks} checks${where}.`;
};
