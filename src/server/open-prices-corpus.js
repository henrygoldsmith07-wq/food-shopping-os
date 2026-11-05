/**
 * The Open Prices GBP corpus: one shared, cached read of every UK
 * observation, and local name matching against it.
 *
 * Split from retailer-providers.js, which owns the HTTP plumbing and the
 * row shape; this module is handed a page fetcher and a row normaliser.
 */

import { ApiError } from './api.js';
import { isMatch, matchScore } from './search-terms.js';

/**
 * Every GBP observation Open Prices holds, cached.
 *
 * The UK corner of Open Prices is small — about two thousand rows, nearly
 * all with a product name — and the per-barcode route almost never lands on
 * one: a phrase resolves to five barcodes, and the chance any of them was
 * ever priced in pounds is close to nil. Reading the whole GBP set once and
 * matching names locally finds every UK observation there is for an item, in
 * a couple of dozen requests a day rather than six per item, every one of
 * which usually came back empty.
 */
const CORPUS_TTL_MS = 12 * 60 * 60 * 1000;
const CORPUS_RETRY_MS = 10 * 60 * 1000;
export const CORPUS_PAGE_SIZE = 100;
const CORPUS_MAX_PAGES = 60;
const CORPUS_CONCURRENCY = 4;
/** Observations older than this say little about today's shelf. */
const CORPUS_MAX_AGE_DAYS = 548;
let corpus = { rows: null, fetchedAt: 0, complete: false, pending: null };

export const clearOpenPricesCorpus = () => { corpus = { rows: null, fetchedAt: 0, complete: false, pending: null }; };

/**
 * Read every page. `fetchPage(n)` answers `{ rows, pages }`; a page that
 * fails leaves the corpus marked incomplete rather than failing the load.
 */
const loadCorpus = async (fetchPage) => {
  const first = await fetchPage(1);
  const rows = [...first.rows];
  const pages = Math.min(CORPUS_MAX_PAGES, Math.max(1, Number(first.pages) || 1));
  let complete = true;
  let next = 2;
  const worker = async () => {
    while (next <= pages) {
      const page = next;
      next += 1;
      try {
        rows.push(...(await fetchPage(page)).rows);
      } catch {
        complete = false;
      }
    }
  };
  await Promise.all(Array.from({ length: CORPUS_CONCURRENCY }, worker));
  return { rows, complete };
};

/** Settle with `promise`, or reject as soon as `signal` aborts. */
const untilAborted = (promise, signal) => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError(504, 'Open Prices lookup was cancelled.'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ApiError(504, 'Open Prices lookup was cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

/**
 * The cached GBP corpus and whether it is the whole set.
 *
 * One load is shared by every request that arrives while it runs, so it is
 * not tied to any one caller's signal: a single cancelled request would
 * otherwise abort the load for all of them, and cache the few pages read so
 * far as the corpus. A caller that gives up stops waiting; the load goes on.
 */
export const openPricesCorpus = async (fetchPage, { signal } = {}) => {
  const age = Date.now() - corpus.fetchedAt;
  if (corpus.rows && age < (corpus.complete ? CORPUS_TTL_MS : CORPUS_RETRY_MS)) {
    return { rows: corpus.rows, complete: corpus.complete };
  }
  if (!corpus.pending) {
    corpus.pending = loadCorpus(fetchPage)
      .then(({ rows, complete }) => {
        corpus = { rows, fetchedAt: Date.now(), complete, pending: null };
        return { rows, complete };
      })
      .catch((error) => {
        corpus.pending = null;
        throw error;
      });
  }
  return untilAborted(corpus.pending, signal);
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The corpus rows that answer a phrase, best first.
 *
 * Community data is typed by hand from receipts and shelf photos, and some of
 * it is wrong by a factor of a hundred (a 90-pound tin of tomatoes). With
 * three or more matches, a row more than four times from their median is
 * dropped as a typo rather than offered as a price.
 */
export const matchObservations = (rows = [], query = '', { normalise, now = Date.now() } = {}) => {
  const oldest = now - CORPUS_MAX_AGE_DAYS * 86400000;
  const matched = rows
    .map((raw) => {
      const name = raw?.product?.product_name || raw?.product_name;
      if (!name || !isMatch(name, query)) return null;
      const observed = new Date(raw?.date || 0).getTime();
      if (!(observed >= oldest)) return null;
      try {
        const row = normalise(raw);
        return row && row.price > 0 ? { row, relevance: matchScore(name, query), observed } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const mid = matched.length >= 3 ? median(matched.map((entry) => entry.row.price)) : null;
  return matched
    .filter((entry) => !mid || (entry.row.price <= mid * 4 && entry.row.price >= mid / 4))
    .sort((a, b) => b.relevance - a.relevance || b.observed - a.observed)
    .map((entry) => entry.row);
};
