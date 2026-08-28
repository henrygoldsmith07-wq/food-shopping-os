const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

import { classifyProductMatch, matchLabel } from './product-matching.js';

const itemKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const normaliseOffer = (offer, item) => {
  if (!offer || offer.available === false || offer.unavailable === true) return null;
  const price = Number(offer.price ?? offer.total ?? item.price);
  return Number.isFinite(price) && price >= 0 ? { ...offer, price } : null;
};

/**
 * Compare stores as complete baskets, not as independent cheapest products.
 * Missing/unmatched products are explicit and substitutions count toward the
 * practical total rather than disappearing from the comparison.
 */
export const compareBaskets = (items = [], offersByStore = {}, options = {}) => {
  const stores = options.stores || Object.keys(offersByStore);
  const rows = stores.map((store) => {
    const offers = offersByStore[store] || {};
    const missing = [];
    const substitutions = [];
    let productsTotal = 0;
    for (const item of items) {
      const offer = normaliseOffer(offers[itemKey(item.name)], item);
      if (offer) {
        const match = offer.matchClassification
          ? { classification: offer.matchClassification, confidence: Number(offer.matchConfidence) || 0, equivalent: offer.matchClassification !== 'unknown' }
          : (offer.name || offer.product || offer.brand || offer.packSize ? classifyProductMatch(item, offer) : { classification: 'likely equivalent', confidence: 0.7, equivalent: true });
        if (!match.equivalent) {
          missing.push(item.name);
          continue;
        }
        productsTotal += offer.price;
        if (match.classification === 'approximation') substitutions.push({ item: item.name, replacement: offer.name || offer.product, match: matchLabel(match.classification), confidence: match.confidence });
        if (offer.substitutedFrom || offer.substitution) substitutions.push({ item: item.name, replacement: offer.substitutedFrom || offer.substitution, match: 'substitution', confidence: match.confidence });
      } else missing.push(item.name);
    }
    const delivery = Number(options.delivery?.[store] ?? 0) || 0;
    const travel = Number(options.travel?.[store] ?? 0) || 0;
    const matched = items.length - missing.length;
    const availability = items.length ? Math.round((matched / items.length) * 100) : 100;
    const practicalTotal = round(productsTotal + delivery + travel);
    const penalty = missing.length * (Number(options.unmatchedPenalty) || 1.5) + substitutions.length * (Number(options.substitutionPenalty) || 0.25);
    return {
      store,
      total: practicalTotal,
      productTotal: round(productsTotal),
      delivery: round(delivery),
      travel: round(travel),
      unavailable: missing.length,
      unavailableItems: missing,
      substitutions: substitutions.length,
      substitutionItems: substitutions,
      matchConfidence: matched ? round(items.filter((item) => offers[itemKey(item.name)]).reduce((sum, item) => sum + (classifyProductMatch(item, offers[itemKey(item.name)]).confidence || 0), 0) / matched) : 0,
      matched,
      availability,
      practicalScore: round(practicalTotal + penalty),
      explanation: `${store} — £${practicalTotal.toFixed(2)}${missing.length ? `, but ${missing.length} item${missing.length === 1 ? '' : 's'} unavailable/unmatched` : ''}`,
    };
  }).sort((a, b) => a.practicalScore - b.practicalScore || b.availability - a.availability);
  const best = rows[0] || null;
  return {
    rows,
    best,
    recommendation: best ? `Best practical basket: ${best.store} at £${best.total.toFixed(2)} with ${best.availability}% of the basket matched.` : null,
  };
};
