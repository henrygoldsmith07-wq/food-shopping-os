/**
 * Shop ranking for live price comparisons.
 *
 * Extracted from live-prices.js: the pure comparison maths that turns one
 * scrape result into a ranked, honestly-labelled shop list. No fetching, no
 * caching — the caller brings the result, this module decides what it means.
 */

import { parseQuantity, unitPriceOf } from './measure.js';
import {
  classifyProductMatch, comparableForRanking, majorityReference, matchDifferenceLabel,
} from './product-matching.js';

/** Cheapest row per shop, so one shop cannot fill the whole table. */
export const bestPerRetailer = (result) => {
  const byRetailer = new Map();
  for (const row of result?.cheapest || []) {
    const existing = byRetailer.get(row.retailerId);
    if (!existing || row.price < existing.price) byRetailer.set(row.retailerId, row);
  }
  return [...byRetailer.values()].sort((a, b) => a.price - b.price);
};

/**
 * Rank the shops for one item — by what it actually costs per unit.
 *
 * Ticket price is the wrong comparison and it is wrong in a specific,
 * everyday direction: the shop selling the small pack looks cheapest. A 1.13L
 * bottle at 85p beats a 2.27L bottle at £1.45 on the shelf edge and loses by
 * 15% a litre. Ranking on the ticket does not merely fail to help, it hands
 * back the wrong answer with a number attached.
 *
 * So the ranking is per unit wherever the sizes allow it, and says which basis
 * it used. Two cases fall back to the ticket, both flagged rather than
 * silently papered over:
 *
 *  - **No sizes.** Some shops publish a price and no quantity. Nothing can be
 *    normalised, so the ticket is all there is.
 *  - **Mixed scales.** Six eggs against 500g of eggs. Both are eggs, neither
 *    is cheaper, and a ranking that mixes per-item with per-100g is a number
 *    that means nothing.
 *
 * The gap is still the point. "Tesco £1.45, Asda £1.50" is two facts; "Asda
 * is 8% dearer a litre" is the decision. Ties share a rank, because two shops
 * at the same value are not first and second.
 */
export const rankShops = (perRetailer = [], { name } = {}) => {
  const rows = [...perRetailer].filter((row) => typeof row?.price === 'number' && row.price > 0);
  if (!rows.length) {
    return { rows: [], basis: 'none', unitLabel: null, mixedScales: false, ticketMisleads: false, likeForLike: false, notSameProduct: [] };
  }

  const withUnit = rows.map((row) => {
    const size = row.packSize || row.amount;
    const ingredient = name || row.name;
    const parsed = parseQuantity(size, { ingredient });
    return {
      ...row,
      unit: unitPriceOf(row.price, parsed || size, { ingredient }),
      // The displayed figure is rounded to the penny, which is right for
      // reading and wrong for arithmetic: 6.39p and 7.52p per 100ml both round
      // to a two-decimal price, and the gap between the rounded pair reads as
      // 33% where the real one is 18%. Ordering and percentages use this.
      exact: parsed?.amount > 0 ? row.price / parsed.amount : null,
    };
  });

  // What each shop's cheapest row actually is, next to the others. The top
  // hit for "beans" at one shop is not automatically the same tin another
  // shop returned, and ranking a lookalike as the product is the comparison
  // this check exists to stop.
  const unbrand = (row) => (row.retailer && row.name
    ? row.name.replace(new RegExp(`^${row.retailer}[\\s-]+`, 'i'), '')
    : row.name);
  const ref = majorityReference(withUnit);
  const labelled = withUnit.map((row, index) => ({
    ...row,
    match: index === ref
      ? { classification: 'exact', equivalent: true, reasons: [] }
      : classifyProductMatch({ ...withUnit[ref], name: unbrand(withUnit[ref]) }, { ...row, name: unbrand(row) }),
  }));
  const comparable = labelled.filter((row) => comparableForRanking(row.match));
  const likeForLike = comparable.length >= 2;
  const scope = likeForLike ? comparable : labelled;

  const priced = scope.filter((row) => row.unit && row.exact !== null);
  const scales = new Set(priced.map((row) => `${row.unit.dim}:${row.unit.unit}`));
  // Every shop must be comparable, not most of them: ranking eight shops per
  // litre and appending a ninth on its ticket price puts an incomparable row
  // in an ordered list, which is exactly the confusion this is meant to end.
  const byUnit = priced.length === scope.length && scales.size === 1;
  const basis = byUnit ? 'unit' : 'price';

  const value = (row) => (byUnit ? row.exact : row.price);
  const sorted = [...scope].sort((a, b) => value(a) - value(b) || a.price - b.price);
  const best = value(sorted[0]);
  const worst = value(sorted.at(-1));
  // The cheapest row's displayed figure, so the money gap is quoted in the
  // same units the reader sees rather than in raw per-millilitre fractions.
  const bestShown = byUnit ? sorted[0].unit.value : sorted[0].price;

  let rank = 0;
  let previous = null;
  const rankedScope = sorted.map((row, index) => {
    const current = value(row);
    if (previous === null || current !== previous) rank = index + 1;
    previous = current;
    return {
      ...row,
      rank,
      basis,
      isCheapest: current === best,
      isDearest: sorted.length > 1 && current === worst && current !== best,
      // The gap on the basis actually used, so the percentage and the order
      // can never disagree.
      // The money gap stays in the reader's units: per-litre pennies, not the
      // raw per-millilitre fraction the ordering is computed from.
      over: Math.round(((byUnit ? row.unit.value : row.price) - bestShown) * 100) / 100,
      overPct: best > 0 ? Math.round(((current - best) / best) * 1000) / 10 : null,
    };
  });

  // Rows that are not the product the like-for-like set is about: still
  // listed, after it, never merged into its ranking or its value claims.
  const rest = (likeForLike
    ? labelled.filter((row) => !comparableForRanking(row.match)).sort((a, b) => a.price - b.price)
    : []).map((row, index) => ({
      ...row,
      rank: rankedScope.length + index + 1,
      basis,
      isCheapest: false,
      isDearest: false,
      over: null,
      overPct: null,
    }));
  const ranked = [...rankedScope, ...rest];

  const cheapestByTicket = [...scope].sort((a, b) => a.price - b.price)[0];
  return {
    rows: ranked,
    basis,
    unitLabel: byUnit ? sorted[0].unit.unit : null,
    mixedScales: scales.size > 1,
    likeForLike,
    notSameProduct: ranked
      .filter((row) => row.match && !comparableForRanking(row.match))
      .map((row) => ({ retailer: row.retailer, label: matchDifferenceLabel(row.match) })),
    // True when the shop with the cheaper ticket is not the better buy — the
    // case a price-only comparison gets backwards, worth saying out loud.
    ticketMisleads: Boolean(byUnit && cheapestByTicket && ranked[0]
      && cheapestByTicket.retailerId !== ranked[0].retailerId),
    cheapestByTicket: cheapestByTicket || null,
  };
};

/**
 * What the whole ranked set is worth: the spread between best and worst.
 *
 * Reported on the basis the ranking used. A saving quoted per litre against an
 * order computed per litre is one claim; quoting a ticket saving over a value
 * ranking would be two, and the reader would have to work out which.
 */
export const rankingSpread = (ranking) => {
  const allRows = Array.isArray(ranking) ? ranking : ranking?.rows || [];
  // The spread is a like-for-like claim, so when the ranking separated a
  // different product out, the spread stops at the like-for-like pair.
  const rows = !Array.isArray(ranking) && ranking?.likeForLike
    ? allRows.filter((row) => !row.match || comparableForRanking(row.match))
    : allRows;
  if (rows.length < 2) return null;
  const basis = Array.isArray(ranking) ? 'price' : ranking.basis;
  const best = rows[0];
  const worst = rows.at(-1);
  // Quoted in the reader's units — rounded pennies per 100ml — but measured
  // from the unrounded figures, or a 6.39p-to-7.52p gap reads as 33%.
  const shown = (row) => (basis === 'unit' ? row.unit.value : row.price);
  const exact = (row) => (basis === 'unit' ? row.exact : row.price);
  const low = exact(best);
  const high = exact(worst);
  return {
    basis,
    unitLabel: basis === 'unit' ? best.unit.unit : null,
    cheapest: best,
    dearest: worst,
    saving: Math.round((shown(worst) - shown(best)) * 100) / 100,
    pct: low > 0 ? Math.round(((high - low) / low) * 1000) / 10 : null,
  };
};

/** Shops that were asked but could not answer, with the reason they gave. */
export const unansweredShops = (result) =>
  (result?.results || [])
    .filter((entry) => entry.status !== 'ok')
    .map((entry) => ({
      retailer: entry.retailer,
      retailerId: entry.retailerId,
      status: entry.status,
      note: entry.note,
      // A shop that refused us has not refused the person holding the phone.
      // Every shop keeps a working link to its own search for this item, so
      // "we could not read this" never means "you cannot look".
      url: entry.url || null,
    }));

/**
 * Every shop, for one item, with somewhere to go — priced or not.
 *
 * The scraper's job is to save the trip; when it cannot, the next best thing
 * is the trip made short. A shop whose robots.txt refuses our reader has no
 * objection to a person opening the same page, and that page is one tap away
 * if the app keeps the link rather than only the apology.
 */
export const shopLinksFor = (result) => (result?.results || []).map((entry) => {
  const priced = (entry.rows || [])[0] || null;
  return {
    retailer: entry.retailer,
    retailerId: entry.retailerId,
    status: entry.status,
    price: priced?.price ?? null,
    // The product's own page when the shop published one, its search results
    // otherwise. Labelled, because "the product" and "a list of maybes" are
    // different promises.
    url: priced?.url || entry.url || null,
    isProductLink: Boolean(priced?.isProductLink),
    productName: priced?.name || null,
  };
}).filter((row) => row.url);
