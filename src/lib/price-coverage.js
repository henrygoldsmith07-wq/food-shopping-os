/**
 * What a live price check actually achieved, and where the rest of it went.
 *
 * Kept apart from the checking itself because it answers a different
 * question. `live-prices.js` asks "what do the shops say"; this asks "how much
 * of that worked, and when it did not, whose fault was it" — and the second
 * question turns out to be the one people need answered.
 *
 * "47 of 52 priced" is the number anyone means by a success rate, and on its
 * own it is worth nothing. Five items missing because shops are down, five
 * because shops refuse to be read, and five because a proxy swallowed every
 * request are the same figure and three completely different problems, only
 * one of which the reader can do anything about.
 */

/**
 * What the check actually achieved, and where the rest went.
 *
 * "47 of 52 priced" is the number people mean by a success rate, and it is
 * worth nothing on its own: five unpriced items because five shops are down
 * is a different problem from five unpriced items because the shops all
 * refuse to be read. So the misses are counted by the reason the shop gave,
 * which is the only version of this number anyone can act on.
 *
 * Reasons are counted per item, not per shop-visit: an item that nine shops
 * declined is one unpriced item whose dominant reason is "declined", not nine
 * failures. Counting visits would make a single stubborn item look like a
 * collapse.
 */
export const REASON_LABELS = {
  declined: 'shop’s robots.txt said no',
  'network-blocked': 'blocked by this network, not by the shop',
  blocked: 'shop blocked an automated request',
  'rate-limited': 'shop asked us to slow down',
  unreachable: 'shop could not be reached',
  'no-match': 'shop had no matching product',
  'no-search-url': 'shop has no public search',
  aborted: 'check was stopped early',
};

export const coverageFor = (byKey = {}) => {
  const entries = Object.values(byKey || {});
  const reasons = {};
  let priced = 0;
  let broadened = 0;
  for (const entry of entries) {
    if (entry?.best) {
      priced += 1;
      if (entry.best.broadened) broadened += 1;
      continue;
    }
    // The most common thing the shops said about this item is the reason it
    // has no price. A tie is broken by the order shops were asked, which is
    // stable, so the same run always reports the same reason.
    const tally = {};
    for (const shop of entry?.unanswered || []) {
      const status = shop?.status || 'unreachable';
      tally[status] = (tally[status] || 0) + 1;
    }
    const [top] = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const reason = top?.[0] || 'unreachable';
    reasons[reason] = (reasons[reason] || 0) + 1;
  }
  const total = entries.length;
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  return {
    total,
    priced,
    unpriced: total - priced,
    broadened,
    pct: total ? Math.round((priced / total) * 100) : null,
    // When nothing came back and every item failed the same network-shaped
    // way, the honest headline is not "0% priced". Nine shops do not refuse
    // one person simultaneously; a proxy in front of them does. Saying "0%"
    // there blames the retailers for something on this side of the wire.
    networkBlocked: Boolean(priced === 0 && total > 0 && top && top[0] === 'network-blocked'
      && top[1] === total),
    reasons: Object.entries(reasons)
      .map(([reason, count]) => ({ reason, count, label: REASON_LABELS[reason] || reason }))
      .sort((a, b) => b.count - a.count),
  };
};
