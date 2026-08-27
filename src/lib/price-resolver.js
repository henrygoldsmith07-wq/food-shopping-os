/**
 * One price for every item, and the truth about where it came from.
 *
 * The live scraper cannot have a 100% hit rate. Several shops forbid their
 * search pages in robots.txt, several more return 403 to anything that is not
 * a browser, and many UK grocers publish no price at all until a store is
 * chosen. Those are not parser bugs to fix — they are the shape of the web,
 * and the honest ways round them are all off the table.
 *
 * What the app can do is stop treating the scraper as the only source. Four
 * sources already exist, each right about something slightly different:
 *
 *   scraped   — read from a shop's page just now. Most current, least certain
 *               it is the same product you meant.
 *   recorded  — what YOU actually paid, from a receipt. Certainly the right
 *               product; possibly months old.
 *   checked   — what a previous live check found, kept on this device.
 *   observed  — a dated community report from Open Prices, often another town.
 *
 * So every item gets a price. What varies is which source answered and how
 * much it is worth, and both are always stated. The rule underneath is that a
 * six-month-old receipt must never be able to look like a live quote, because
 * a number without its provenance is worse than no number: it gets trusted.
 *
 * Where nothing at all is known, that is reported as nothing known. This
 * module never invents a price to fill a gap.
 */

import { shoppingNameKey } from './shopping.js';

/**
 * How much each kind of evidence is worth before age is considered.
 *
 * Recorded sits above checked on purpose: your own receipt is certainly the
 * product you meant, where a scrape is a search result that merely looked
 * right. Freshness then moves them relative to each other, which is the point
 * of scoring rather than ranking.
 */
export const SOURCE_WEIGHT = {
  scraped: 1,
  recorded: 0.92,
  checked: 0.8,
  observed: 0.6,
};

export const SOURCE_LABEL = {
  scraped: 'Live from the shop',
  recorded: 'You paid this',
  checked: 'From an earlier check',
  observed: 'Community observed',
};

/** Age in days, or null when there is no usable date. */
export const ageInDays = (date, now = Date.now()) => {
  if (!date) return null;
  const stamp = new Date(String(date).length <= 10 ? `${date}T12:00:00Z` : date).getTime();
  if (!Number.isFinite(stamp)) return null;
  return Math.max(0, Math.round((now - stamp) / 86400000));
};

/**
 * What a price is still worth, given its age.
 *
 * Halves roughly every three months rather than falling off a cliff: a
 * six-week-old receipt is worth a lot, a year-old one very little, and there
 * is no single day on which it stops counting. An undated price is treated as
 * a season old, because an unknown age is not the same as a fresh one.
 */
export const freshnessFactor = (days) => {
  if (days === null || days === undefined) return 0.5;
  return 1 / (1 + days / 90);
};

/** Weight × freshness. Higher wins. */
export const scoreCandidate = (candidate, now = Date.now()) => {
  const weight = SOURCE_WEIGHT[candidate.source] ?? 0.3;
  return Math.round(weight * freshnessFactor(ageInDays(candidate.date, now)) * 1000) / 1000;
};

/** Words for how much to trust it, so the UI never has to invent them. */
export const confidenceOf = (candidate, now = Date.now()) => {
  const days = ageInDays(candidate.date, now);
  if (candidate.source === 'scraped') return { level: 'high', label: 'checked just now' };
  if (days === null) return { level: 'low', label: 'date unknown' };
  if (days <= 14) return { level: 'high', label: days <= 1 ? 'from today' : `${days} days old` };
  if (days <= 60) return { level: 'medium', label: `${days} days old` };
  if (days <= 180) return { level: 'low', label: `${Math.round(days / 30)} months old` };
  return { level: 'stale', label: `over ${Math.floor(days / 30)} months old` };
};

const priceOf = (value) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null;
};

/** The live check's answer for one item, if it found one. */
const fromScrape = (entry) => {
  const price = priceOf(entry?.best?.price);
  if (price === null) return null;
  return {
    source: 'scraped',
    price,
    date: entry.checkedAt || new Date().toISOString(),
    where: entry.best.retailer || null,
    detail: entry.best.name || null,
    url: entry.best.url || null,
    method: entry.best.method || null,
  };
};

/** The cheapest thing a previous live check saw, from the on-device history. */
const fromHistory = (history) => {
  const points = history?.points || [];
  const latest = points.at(-1);
  const price = priceOf(latest?.best);
  if (price === null) return null;
  const cheapest = Object.values(latest.shops || {}).sort((a, b) => a.price - b.price)[0];
  return {
    source: 'checked',
    price,
    date: latest.date,
    where: cheapest?.retailer || null,
    detail: null,
  };
};

/** What the shopper actually paid, most recently, from their own receipts. */
const fromReceipts = (row) => {
  const points = row?.points || [];
  const latest = points.at(-1);
  const price = priceOf(latest?.price);
  if (price === null) return null;
  return {
    source: 'recorded',
    price,
    date: latest.date,
    where: latest.store || null,
    detail: points.length > 1 ? `${points.length} receipts` : 'one receipt',
  };
};

/** A dated community report, where one exists. */
const fromObserved = (entry) => {
  const price = priceOf(entry?.price);
  if (price === null) return null;
  return {
    source: 'observed',
    price,
    date: entry.observedAt || entry.checkedAt || null,
    where: entry.store || null,
    detail: entry.location || null,
  };
};

/**
 * Every price known for one item, best first.
 *
 * Returning all of them rather than only the winner is deliberate: seeing that
 * a live scrape says £1.45 and your last receipt says £1.10 is more useful
 * than either number alone, and it is the only way to notice the scraper
 * matched the wrong product.
 */
export const candidatesFor = (name, sources = {}, { now = Date.now() } = {}) => {
  const key = shoppingNameKey(name);
  if (!key) return [];
  const {
    scraped = {}, history = {}, receipts = {}, observed = {},
  } = sources;
  const found = [
    fromScrape(scraped[key]),
    fromHistory(history[key]),
    fromReceipts(receipts[key]),
    fromObserved(observed[key]),
  ].filter(Boolean);
  return found
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, now),
      confidence: confidenceOf(candidate, now),
      sourceLabel: SOURCE_LABEL[candidate.source] || candidate.source,
    }))
    .sort((a, b) => b.score - a.score || a.price - b.price);
};

/**
 * The single price to show for one item.
 *
 * `resolved: false` with a reason is a valid, deliberate answer. Nothing here
 * fabricates a number to avoid an empty cell — an invented price would be
 * indistinguishable from a real one at a glance, which is exactly the failure
 * this module exists to prevent.
 */
export const resolvePrice = (name, sources = {}, options = {}) => {
  const candidates = candidatesFor(name, sources, options);
  if (!candidates.length) {
    return {
      name,
      resolved: false,
      price: null,
      reason: 'No price known yet — record a shop, or check the shops for this item.',
      candidates: [],
    };
  }
  const [best, ...rest] = candidates;
  return {
    name,
    resolved: true,
    price: best.price,
    source: best.source,
    sourceLabel: best.sourceLabel,
    confidence: best.confidence,
    where: best.where,
    detail: best.detail,
    url: best.url || null,
    date: best.date,
    candidates,
    alternatives: rest,
    // A disagreement worth surfacing: two sources far apart usually means the
    // scraper matched a different product, not that the price moved.
    disagreement: rest.length && best.price > 0
      ? Math.max(...rest.map((row) => Math.abs(row.price - best.price) / best.price)) >= 0.5
      : false,
  };
};

/** Resolve a whole list, and report how completely it was covered. */
export const resolveList = (items = [], sources = {}, options = {}) => {
  const rows = items
    .filter((item) => item?.name)
    .map((item) => ({ item, ...resolvePrice(item.name, sources, options) }));
  const resolved = rows.filter((row) => row.resolved);
  const bySource = resolved.reduce((acc, row) => {
    acc[row.source] = (acc[row.source] || 0) + 1;
    return acc;
  }, {});
  return {
    rows,
    total: rows.length,
    resolved: resolved.length,
    coverage: rows.length ? Math.round((resolved.length / rows.length) * 100) : 0,
    bySource,
    estimatedTotal: Math.round(resolved.reduce((sum, row) => sum + row.price, 0) * 100) / 100,
    // Only the live rows can be called a current basket cost; saying so keeps
    // the total from quietly borrowing the authority of the freshest row in it.
    liveShare: resolved.length
      ? Math.round(((bySource.scraped || 0) / resolved.length) * 100)
      : 0,
  };
};

/** Receipts keyed the way the resolver wants them. */
export const receiptsByKey = (history = []) => {
  const out = {};
  for (const row of history) {
    const key = shoppingNameKey(row.name);
    if (key) out[key] = row;
  }
  return out;
};

/** Observed rows keyed the same way. */
export const observedByKey = (byKey = {}) => byKey;
