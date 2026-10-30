/**
 * What the list will cost when not every row has a price yet.
 *
 * A row's own price — typed in, or carried from a receipt — always wins. A row
 * without one borrows the best evidence there is, in this order:
 *
 *   1. a live shop price from the last check (3 h window),
 *   2. a community observation (Open Prices),
 *   3. the typical UK supermarket price for the pack (see typical-prices.js).
 *
 * Nothing here writes to the list. Borrowed prices are shown as what they are
 * ("typical", "Tesco, checked 20 min ago") and summed separately, so the
 * basket can say "£8.40 you've priced + about £21 more" rather than either
 * £8.40 or a single number that hides how much of it is a guess.
 */

import { packsToBuy, typicalPriceFor } from '../data/typical-prices.js';
import { shoppingNameKey } from './shopping-names.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The price a row is estimated at, and where that came from.
 *
 * @param {{ name: string, qty?: string, price?: number }} item
 * @param {{ live?: Record<string, any>, observed?: Record<string, any> }} [evidence]
 *   live: the live-price cache by shopping-name key; observed: community
 *   observations by the same key
 * @returns {{ price: number, source: 'yours'|'live'|'observed'|'typical', label: string } | null}
 */
export const rowEstimate = (item, { live = null, observed = null } = {}) => {
  const own = Number(item?.price);
  if (own > 0) return { price: own, source: 'yours', label: 'your price' };
  const key = shoppingNameKey(item?.name);
  const typical = typicalPriceFor(item?.name, item?.qty);
  // A shop's price is for one listing as the shop sells it — a box of six, a
  // four-tin multipack, one loose lemon — so the row buys as many listings as
  // its quantity needs, not one per item it counts.
  const packs = (listing) => packsToBuy(item?.qty, listing, item?.name);
  const best = key ? live?.[key]?.best : null;
  if (best?.price > 0) {
    return { price: round2(best.price * packs(best)), source: 'live', label: best.retailer ? `${best.retailer}, live` : 'live price' };
  }
  const seen = key ? observed?.[key] : null;
  if (seen && !seen.error && seen.price > 0) {
    return { price: round2(seen.price * packs(seen)), source: 'observed', label: `seen at ${seen.store || 'a shop'}` };
  }
  if (typical) return { price: typical.price, source: 'typical', label: `typical, ${typical.pack}` };
  return null;
};

/**
 * The basket split into what is known and what is estimated.
 *
 * Checked rows are included (a ticked row is still part of the shop); offers
 * are not applied here — the basket projection already takes them off the
 * known part.
 */
export const estimateBasket = (items = [], evidence = {}) => {
  let known = 0;
  let estimated = 0;
  let estimatedCount = 0;
  let unknownCount = 0;
  const sources = { live: 0, observed: 0, typical: 0 };
  for (const item of items) {
    const estimate = rowEstimate(item, evidence);
    if (!estimate) unknownCount += 1;
    else if (estimate.source === 'yours') known += estimate.price;
    else {
      estimated += estimate.price;
      estimatedCount += 1;
      sources[estimate.source] += 1;
    }
  }
  return {
    known: round2(known),
    estimated: round2(estimated),
    total: round2(known + estimated),
    estimatedCount,
    unknownCount,
    sources,
  };
};

/**
 * The list's running total for the sticky bar and the aisle headings: the same
 * per-row price as estimateBasket (yours first, then live, observed, typical),
 * split into what is already in the trolley and what is still to pick up.
 * `estimated` says whether any of it is borrowed, so the UI can say "about".
 */
export const listTotals = (items = [], evidence = {}) => {
  let total = 0;
  let inTrolley = 0;
  let estimated = false;
  let unpriced = 0;
  let left = 0;
  for (const item of items) {
    const estimate = rowEstimate(item, evidence);
    if (!item?.checked) left += 1;
    if (!estimate) {
      unpriced += 1;
      continue;
    }
    if (estimate.source !== 'yours') estimated = true;
    total += estimate.price;
    if (item?.checked) inTrolley += estimate.price;
  }
  return { total: round2(total), inTrolley: round2(inTrolley), toGo: round2(total - inTrolley), left, unpriced, estimated };
};
