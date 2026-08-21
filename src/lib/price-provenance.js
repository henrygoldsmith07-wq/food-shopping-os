/**
 * Price provenance — every price carries its own receipt.
 *
 * A price value without provenance is a guess. This module normalises every
 * price-surface in Forq into a single provenance shape and labels how much to
 * trust it without ever presenting a community observation as a live shelf price.
 */

import { dayStamp, daysUntil } from './kitchen.js';

export const PRICE_SOURCES = {
  receipt: { label: 'Receipt (recorded shop)', freshness: 'definitive', confidence: 'high', live: false },
  manual: { label: 'Manually entered', freshness: 'as typed', confidence: 'medium', live: false },
  retailer: { label: 'Retailer reference', freshness: 'may change', confidence: 'medium', live: false },
  observed: { label: 'Open Prices (community observed)', freshness: 'dated', confidence: 'low', live: false },
  live: { label: 'Live retailer', freshness: 'live', confidence: 'high', live: true },
  cached: { label: 'Cached', freshness: 'stale', confidence: 'low', live: false },
  historical: { label: 'Historical median', freshness: 'trend', confidence: 'medium', live: false },
  estimated: { label: 'Estimated', freshness: 'estimate', confidence: 'low', live: false },
};

const round2 = (n) => Math.round(n * 100) / 100;

const sourceMeta = (source) => PRICE_SOURCES[source] || { label: String(source || 'Unknown'), confidence: 'low', freshness: 'unknown', live: false };

export const normaliseProvenance = (price) => {
  if (!price || typeof price !== 'object') return null;
  const rawSource = String(price.source || price.priceSource || 'manual').toLowerCase();
  const source = PRICE_SOURCES[rawSource] ? rawSource : (price.observedPrice || rawSource === 'open-prices' ? 'observed' : rawSource === 'receipt' ? 'receipt' : 'manual');
  const meta = sourceMeta(source);
  const observedAt = price.observedAt || price.date || price.checkedAt || price.recordedAt || null;
  const today = dayStamp();
  const ageDays = observedAt ? (() => {
    const stamp = String(observedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
    const d = daysUntil(stamp, today);
    return d == null ? null : -d;
  })() : null;

  let freshnessLabel = meta.freshness;
  let freshnessTone = 'muted';
  if (source === 'receipt' && ageDays != null) {
    freshnessLabel = ageDays === 0 ? 'receipt today' : ageDays === 1 ? 'receipt yesterday' : `receipt ${ageDays}d ago`;
    freshnessTone = ageDays <= 7 ? 'good' : ageDays <= 30 ? 'warn' : 'danger';
  } else if (source === 'observed' && ageDays != null) {
    if (ageDays <= 7) freshnessTone = 'good';
    else if (ageDays <= 30) freshnessTone = 'warn';
    else freshnessTone = 'danger';
    freshnessLabel = ageDays === 0 ? 'observed today' : `observed ${ageDays}d ago${ageDays > 30 ? ' · may be out of date' : ''}`;
  } else if (source === 'cached') {
    freshnessTone = 'warn';
  }

  return {
    store: price.store?.trim() || 'Store not recorded',
    location: price.location || null,
    item: price.name || price.item || 'Item',
    package: price.qty || price.package || price.packageSize || '',
    packageSize: price.packageSize || price.qty || '',
    observedAt: observedAt ? String(observedAt).slice(0, 10) : null,
    checkedAt: price.checkedAt || null,
    source,
    sourceLabel: price.sourceLabel || meta.label,
    freshness: freshnessLabel,
    freshnessTone,
    confidence: price.confidence || meta.confidence,
    score: ({ high: 0.95, medium: 0.6, low: 0.3 }[meta.confidence] || 0.3),
    amount: typeof price.price === 'number' ? round2(price.price) : (Number(price.price) ? round2(Number(price.price)) : null),
    currency: price.currency || 'GBP',
    ageDays,
    isLive: Boolean(meta.live),
    warning: source === 'observed' ? 'Community observed — not a guaranteed current shelf price.' : null,
  };
};

export const provenanceLabel = (provenance) => {
  if (!provenance) return 'No price provenance.';
  const parts = [
    provenance.sourceLabel,
    provenance.store,
    provenance.packageSize ? provenance.packageSize : null,
    provenance.observedAt || null,
  ].filter(Boolean);
  return parts.join(' · ') + (provenance.warning ? ` — ${provenance.warning}` : '');
};

export const sortByProvenance = (prices = []) =>
  prices
    .map(normaliseProvenance)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (a.ageDays ?? 999) - (b.ageDays ?? 999));

export const priceConfidence = (price) => normaliseProvenance(price)?.confidence || 'low';

export const distinctSources = (prices = []) => [...new Set(prices.map((p) => normaliseProvenance(p)?.source).filter(Boolean))];
