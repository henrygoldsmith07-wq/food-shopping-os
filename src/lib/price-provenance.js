/**
 * Price provenance — every price carries its own receipt.
 *
 * A price value without provenance is a guess. This module normalises every
 * price-surface in Forq into a single provenance shape and labels how much to
 * trust it without ever presenting a community observation as a live shelf price.
 */

import { dayStamp, daysUntil } from './kitchen.js';

export const PRICE_SOURCES = {
  receipt: { label: 'Receipt (recorded shop)', freshness: 'definitive', confidence: 'high', live: false, authority: 5 },
  live: { label: 'Live retailer', freshness: 'live', confidence: 'high', live: true, authority: 4 },
  manual: { label: 'Manually entered', freshness: 'as typed', confidence: 'medium', live: false, authority: 3 },
  retailer: { label: 'Retailer reference', freshness: 'may change', confidence: 'medium', live: false, authority: 3 },
  historical: { label: 'Historical median', freshness: 'trend', confidence: 'medium', live: false, authority: 2 },
  observed: { label: 'Open Prices (community observed)', freshness: 'dated', confidence: 'low', live: false, authority: 1 },
  cached: { label: 'Cached', freshness: 'stale', confidence: 'low', live: false, authority: 1 },
  estimated: { label: 'Estimated', freshness: 'estimate', confidence: 'low', live: false, authority: 0 },
  // Scraper-specific methods — normalised here so flattened rows never fall
  // through to "manual". Authority rises with how directly the number was read.
  scraped: { label: 'Retailer search page', freshness: 'live', confidence: 'medium', live: false, authority: 3 },
  'ai-extracted': { label: 'Read by AI from the shop page', freshness: 'live', confidence: 'low', live: false, authority: 1 },
  monid: { label: 'Monid (paid lookup)', freshness: 'live', confidence: 'medium', live: false, authority: 2 },
  'google-shopping': { label: 'Google Shopping listing', freshness: 'listing', confidence: 'low', live: false, authority: 1 },
};

const round2 = (n) => Math.round(n * 100) / 100;

const sourceMeta = (source) => PRICE_SOURCES[source] || { label: String(source || 'Unknown'), confidence: 'low', freshness: 'unknown', live: false };

export const normaliseProvenance = (price) => {
  if (!price || typeof price !== 'object') return null;
  const candidates = [
    price.source, price.priceSource, price.method, price.via,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  // Scraper rows carry method/via rather than source: method wins over via
  // because it says how the number was read, not which ladder rung fetched it.
  const methodAlias = { 'google-shopping': 'google-shopping', 'ai-extracted': 'ai-extracted', monid: 'monid', scraped: 'scraped', direct: 'scraped', firecrawl: 'scraped', jina: 'scraped' };
  let source = 'manual';
  for (const candidate of candidates) {
    if (PRICE_SOURCES[candidate]) { source = candidate; break; }
    if (methodAlias[candidate]) { source = methodAlias[candidate]; break; }
    if (candidate === 'open-prices' || price.observedPrice) { source = 'observed'; break; }
    if (candidate === 'receipt') { source = 'receipt'; break; }
  }
  if (source === 'manual' && (price.observedPrice || String(price.source || '').toLowerCase() === 'open-prices')) source = 'observed';
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
    store: price.store?.trim() || price.retailer?.trim() || 'Store not recorded',
    retailer: price.retailer || price.store?.trim() || null,
    retailerId: price.retailerId || null,
    location: price.location || null,
    item: price.name || price.item || 'Item',
    package: price.qty || price.package || price.packageSize || '',
    packageSize: price.packageSize || price.qty || '',
    observedAt: observedAt ? String(observedAt).slice(0, 10) : null,
    checkedAt: price.checkedAt || null,
    url: price.url || null,
    source,
    sourceLabel: price.sourceLabel || meta.label,
    method: price.method || null,
    via: price.via || null,
    authority: meta.authority ?? 0,
    freshness: freshnessLabel,
    freshnessTone,
    confidence: price.confidence || meta.confidence,
    score: ({ high: 0.95, medium: 0.6, low: 0.3 }[meta.confidence] || 0.3),
    amount: typeof price.price === 'number' ? round2(price.price) : (Number(price.price) ? round2(Number(price.price)) : null),
    currency: price.currency || 'GBP',
    ageDays,
    isLive: Boolean(meta.live),
    warning: source === 'observed'
      ? 'Community observed — not a guaranteed current shelf price.'
      : source === 'ai-extracted'
        ? 'Read by AI from the shop page and checked against its text — confirm at the shelf.'
        : source === 'google-shopping'
          ? 'A store listing via Google Shopping — not a price read from the shop’s own page.'
          : source === 'estimated'
            ? 'Estimated — not observed anywhere.'
            : null,
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
    .sort((a, b) => b.score - a.score || (b.authority ?? 0) - (a.authority ?? 0) || (a.ageDays ?? 999) - (b.ageDays ?? 999));

export const priceConfidence = (price) => normaliseProvenance(price)?.confidence || 'low';

/** Receipt beats live beats reference beats community beats estimate — for "usual price" copy. */
export const mostAuthoritative = (prices = []) => sortByProvenance(prices)[0] || null;

export const distinctSources = (prices = []) => [...new Set(prices.map((p) => normaliseProvenance(p)?.source).filter(Boolean))];

/**
 * Mismatched-product detection for a row that claims to answer a query.
 * A cheap same-shop lookalike ("beans" for "baked beans") is worse than no
 * price: it reads as authoritative while answering a different question.
 * Returns null when the row matches, or { reason } describing the mismatch.
 */
export const detectPriceMismatch = (row = {}, query = '') => {
  const name = String(row.name || row.item || '').trim();
  const wanted = String(query || row.query || row.wanted || '').trim();
  if (!name || !wanted) return null;
  const tokens = (text) => String(text).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const wantedTokens = new Set(tokens(wanted));
  const nameTokens = new Set(tokens(name));
  if (!wantedTokens.size) return null;
  const overlap = [...wantedTokens].filter((token) => nameTokens.has(token));
  if (overlap.length === 0) {
    return { reason: `"${name}" does not match "${wanted}" — likely a different product.` };
  }
  // The query's distinctive token (brand, variety) missing from the row name.
  const distinctive = [...wantedTokens].filter((token) => token.length >= 4 && !nameTokens.has(token));
  if (distinctive.length && overlap.length / wantedTokens.size < 0.5) {
    return { reason: `"${name}" is missing "${distinctive[0]}" from "${wanted}" — check it is the same product.` };
  }
  return null;
};
