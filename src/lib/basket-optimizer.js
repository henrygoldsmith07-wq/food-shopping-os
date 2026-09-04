import { canonicalName } from './aliases.js';
import { parseQuantity } from './measure.js';
import { shoppingNameKey } from './shopping.js';
import {
  classifyProductMatch,
  comparableForRanking,
  majorityReference,
  matchDifferenceLabel,
  matchLabel,
  normaliseProduct,
} from './product-matching.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clean = (value) => String(value || '').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compactKey = (value) => key(value).replace(/\s+/g, '');
const storeKey = (value) => key(value).replace(/\b(sainsbury)\b/g, 'sainsburys');

const validItems = (items) => (Array.isArray(items) ? items : [])
  .filter((item) => item && clean(item.name));

const itemKeys = (name) => [...new Set([
  key(name),
  compactKey(name),
  shoppingNameKey(name),
  key(canonicalName(name)),
  compactKey(canonicalName(name)),
].filter(Boolean))];

const nonNegative = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const offerFor = (offers, item) => {
  const values = [];
  for (const candidate of itemKeys(item.name)) {
    const value = offers?.[candidate];
    if (Array.isArray(value)) values.push(...value);
    else if (value) values.push(value);
  }
  const valid = values
    .filter(Boolean)
    .map((offer) => normaliseOffer(offer, item))
    .filter(Boolean);
  if (!valid.length) return null;
  // A retailer may return several hits for one query. Prefer an equivalent
  // product before price, otherwise a cheap lookalike can hide the valid item
  // and make the whole store appear unavailable.
  return valid.sort((a, b) => {
    const aMatch = matchFor(item, a);
    const bMatch = matchFor(item, b);
    return Number(bMatch.equivalent) - Number(aMatch.equivalent)
      || a.price - b.price;
  })[0];
};

const normaliseOffer = (offer, item) => {
  if (!offer || offer.available === false || offer.unavailable === true) return null;
  const price = Number(offer.price ?? offer.total ?? item.price);
  return Number.isFinite(price) && price > 0 ? { ...offer, price } : null;
};

const hasExplicitSubstitution = (offer) => Boolean(
  offer?.substitution || offer?.substitutedFrom || offer?.isSubstitution,
);

const INCOMPATIBLE_MODIFIERS = new Set([
  'almond', 'oat', 'soya', 'soy', 'coconut', 'rice', 'pea', 'cashew', 'hazelnut',
  'hemp', 'goat', 'sheep', 'buffalo', 'lactose', 'powdered', 'powder',
]);

const productWords = (offer) => normaliseProduct(offer).product.split(' ').filter(Boolean);

/**
 * Match one retailer offer to the requested shopping row.
 *
 * A live retailer result is usually more specific than the request ("milk"
 * becomes "Tesco semi-skimmed milk 2.27L"). That is a lower-confidence match,
 * not an unavailable item. Variants the matcher can identify remain excluded;
 * an explicit substitution may be included but is labelled as one.
 */
const matchFor = (item, offer) => {
  const explicitSubstitution = hasExplicitSubstitution(offer);
  const hasClassification = Object.prototype.hasOwnProperty.call(offer, 'equivalent')
    || offer.matchClassification;

  if (hasClassification) {
    const classification = offer.matchClassification
      || (offer.equivalent ? 'likely equivalent' : 'unknown');
    const reasons = Array.isArray(offer.matchReasons) ? offer.matchReasons : [];
    const differentPack = reasons.includes('total quantity differs');
    const equivalent = offer.equivalent === true
      || (offer.equivalent === undefined
        && (classification === 'exact' || classification === 'likely equivalent' || differentPack))
      || explicitSubstitution;
    const comparable = offer.comparable !== undefined
      ? Boolean(offer.comparable)
      : equivalent;
    return {
      classification,
      confidence: Number(offer.matchConfidence) || (equivalent ? 0.7 : 0),
      equivalent,
      comparable,
      substitution: explicitSubstitution
        || (classification === 'approximation' && !differentPack),
      reasons,
    };
  }

  if (offer.name || offer.product || offer.brand || offer.packSize || offer.amount) {
    const direct = classifyProductMatch(item, offer, { generic: true, ingredient: item.name });
    if (direct.equivalent || comparableForRanking(direct)) {
      return {
        ...direct,
        equivalent: true,
        comparable: true,
        substitution: explicitSubstitution
          || (direct.classification === 'approximation'
            && !direct.reasons.includes('total quantity differs')),
      };
    }

    // A known variant mismatch (organic, wholemeal, reduced salt, and so on)
    // is not rescued by the broad-name fallback below.
    if (direct.classification === 'approximation') {
      if (explicitSubstitution) {
        return {
          ...direct,
          classification: 'approximation',
          equivalent: true,
          comparable: true,
          substitution: true,
          reasons: [...direct.reasons, 'explicit substitution'],
        };
      }
      return { ...direct, equivalent: false, comparable: false, substitution: false };
    }

    // A requested ingredient is often intentionally broad, while the shop
    // supplies a branded or own-label description. Accept it only when every
    // requested product word is present; this does not turn an unrelated
    // search hit into a basket line.
    const wanted = productWords(item);
    const candidate = productWords(offer);
    const incompatible = wanted.length === 1
      && candidate.some((word) => word !== wanted[0] && INCOMPATIBLE_MODIFIERS.has(word));
    if (!incompatible && wanted.length > 0 && wanted.every((word) => candidate.includes(word))) {
      return {
        ...direct,
        classification: 'likely equivalent',
        confidence: 0.72,
        equivalent: true,
        comparable: true,
        substitution: explicitSubstitution,
        reasons: [...direct.reasons, 'requested product appears in retailer description'],
      };
    }
    if (explicitSubstitution) return { ...direct, equivalent: true, comparable: true, substitution: true };
    return { ...direct, equivalent: false, comparable: false, substitution: false };
  }

  // A manually supplied price with no product metadata is already an explicit
  // answer from the caller. Keep the original API useful for receipt/manual
  // offers while still exposing an explicit substitution flag.
  return {
    classification: 'likely equivalent',
    confidence: 0.7,
    equivalent: true,
    comparable: true,
    substitution: explicitSubstitution,
    reasons: [],
  };
};

const displayStore = (row) => clean(row?.retailer || row?.store || row?.retailerId) || 'Unknown shop';
const identityFor = (row) => clean(row?.retailerId) || storeKey(displayStore(row));

const parsedQuantity = (value, ingredient) => (
  value && typeof value === 'object' && Number.isFinite(Number(value.amount))
    ? value
    : parseQuantity(value, { ingredient })
);

/** Calculate how many retailer packs satisfy the requested quantity when both are readable. */
const basketLine = (item, offer) => {
  const ingredient = canonicalName(item.name);
  const needed = parsedQuantity(item.qty, ingredient);
  const packText = offer.packSize ?? offer.amount ?? offer.qty;
  const pack = parsedQuantity(packText, ingredient);
  if (!needed || !pack || needed.dim !== pack.dim || !(pack.amount > 0)) {
    return { total: offer.price, packsNeeded: 1, quantityNote: null };
  }
  const packsNeeded = Math.max(1, Math.ceil(needed.amount / pack.amount));
  return {
    total: round(offer.price * packsNeeded),
    packsNeeded,
    quantityNote: packsNeeded > 1 ? `${packsNeeded} × ${packText}` : null,
  };
};

/**
 * Compare stores as complete baskets, not as independent cheapest products.
 * Missing or non-equivalent products remain visible and affect the practical
 * score, so a partial basket cannot masquerade as the cheapest full shop.
 */
export const compareBaskets = (items = [], offersByStore = {}, options = {}) => {
  const list = validItems(items);
  const settings = options || {};
  const stores = Array.isArray(settings.stores)
    ? settings.stores
    : Object.keys(offersByStore || {});
  const unmatchedPenalty = nonNegative(settings.unmatchedPenalty, 1.5);
  const substitutionPenalty = nonNegative(settings.substitutionPenalty, 0.25);

  const rows = stores.map((store) => {
    const offers = offersByStore?.[store] || {};
    const missing = [];
    const excluded = [];
    const matchedItems = [];
    let productsTotal = 0;
    let confidenceTotal = 0;

    for (const item of list) {
      const offer = normaliseOffer(offerFor(offers, item), item);
      if (!offer) {
        missing.push(item.name);
        continue;
      }
      const match = matchFor(item, offer);
      if (!match.equivalent) {
        missing.push(item.name);
        excluded.push({
          item: item.name,
          product: offer.name || offer.product || null,
          label: matchLabel(match.classification),
          reason: matchDifferenceLabel(match),
        });
        continue;
      }
      const line = basketLine(item, offer);
      productsTotal += line.total;
      confidenceTotal += Number(match.confidence) || 0;
      matchedItems.push({
        name: item.name,
        price: line.total,
        unitPrice: offer.price,
        packsNeeded: line.packsNeeded,
        packSize: offer.packSize || offer.amount || null,
        quantityNote: line.quantityNote,
        source: offer.source || 'recorded',
        product: offer.name || offer.product || item.name,
        match: matchLabel(match.classification),
        confidence: Number(match.confidence) || 0,
        substitution: Boolean(match.substitution),
      });
    }

    const delivery = nonNegative(settings.delivery?.[store], 0);
    const travel = nonNegative(settings.travel?.[store], 0);
    const matched = matchedItems.length;
    const availability = list.length ? Math.round((matched / list.length) * 100) : 100;
    const practicalTotal = round(productsTotal + delivery + travel);
    const substitutions = matchedItems.filter((item) => item.substitution).length;
    const penalty = missing.length * unmatchedPenalty + substitutions * substitutionPenalty;
    const complete = missing.length === 0;

    return {
      store,
      total: practicalTotal,
      productTotal: round(productsTotal),
      delivery: round(delivery),
      travel: round(travel),
      unavailable: missing.length,
      unavailableItems: missing,
      excludedItems: excluded,
      substitutions,
      substitutionItems: matchedItems.filter((item) => item.substitution),
      matchedItems,
      matchConfidence: matched ? round(confidenceTotal / matched) : 0,
      matched,
      availability,
      complete,
      practicalScore: round(practicalTotal + penalty),
      explanation: `${store} — £${practicalTotal.toFixed(2)}${missing.length
        ? `, but ${missing.length} item${missing.length === 1 ? '' : 's'} unavailable/unmatched`
        : ''}`,
    };
  }).sort((a, b) => a.practicalScore - b.practicalScore
    || b.availability - a.availability
    || String(a.store).localeCompare(String(b.store)));

  const completeRows = rows.filter((row) => row.complete);
  const best = settings.requireComplete && completeRows.length ? completeRows[0] : rows[0] || null;
  return {
    rows,
    best,
    complete: completeRows.length > 0,
    completeRows,
    recommendation: best
      ? `${best.complete ? 'Cheapest complete basket' : 'Closest available basket'}: ${best.store} at £${best.total.toFixed(2)} with ${best.availability}% of the basket matched.`
      : null,
  };
};

const latestRecordedOffers = (shops = []) => {
  const latest = new Map();
  for (const shop of Array.isArray(shops) ? shops : []) {
    const date = String(shop?.date || '');
    for (const item of Array.isArray(shop?.items) ? shop.items : []) {
      const nameKey = shoppingNameKey(item?.name);
      if (!nameKey || !(Number(item?.price) > 0) || !shop?.store) continue;
      const identity = storeKey(shop.store);
      const entryKey = `${identity}|${nameKey}`;
      const current = latest.get(entryKey);
      if (!current || date >= current.date) {
        latest.set(entryKey, {
          ...item,
          name: item.name,
          price: Number(item.price),
          store: shop.store,
          retailer: shop.store,
          source: 'receipt',
          date,
          recordedAt: date,
        });
      }
    }
  }
  return [...latest.values()];
};

const liveEntriesFor = (liveResults) => {
  if (Array.isArray(liveResults)) return liveResults;
  return Object.values(liveResults || {});
};

const checkedOffersFor = (history, nameKey) => {
  const point = history?.[nameKey]?.points?.at(-1);
  if (!point) return [];
  return Object.entries(point.shops || [])
    .filter(([, row]) => Number(row?.price) > 0)
    .map(([retailerId, row]) => ({
      retailerId,
      retailer: row.retailer || retailerId,
      price: Number(row.price),
      source: 'checked',
      checkedAt: point.date,
    }));
};

const pairAccepts = (match) => Boolean(match?.equivalent || comparableForRanking(match));

/**
 * Turn live checks and receipt history into one comparable offer matrix.
 *
 * A row is first checked against the requested item, then against the majority
 * product returned across retailers. Pack-size differences remain comparable;
 * variants or unrelated descriptions remain visible but are excluded.
 */
export const buildBasketOffers = (items = [], options = {}) => {
  const list = validItems(items);
  const settings = options || {};
  const liveResults = settings.liveResults || {};
  const history = settings.history || {};
  const shops = settings.shops || [];
  const offersByStore = {};
  const labels = new Map();
  const evidence = [];
  const liveByKey = new Map();

  for (const entry of liveEntriesFor(liveResults)) {
    const nameKey = shoppingNameKey(entry?.name || entry?.query);
    if (nameKey) liveByKey.set(nameKey, entry);
  }

  const recorded = latestRecordedOffers(shops);
  for (const item of list) {
    const nameKey = shoppingNameKey(item.name);
    const live = liveByKey.get(nameKey);
    const candidates = [];
    const seenStores = new Set();

    for (const row of live?.perRetailer || []) {
      if (!(Number(row?.price) > 0) || (!row?.retailerId && !row?.retailer)) continue;
      const identity = identityFor(row);
      if (seenStores.has(identity)) continue;
      seenStores.add(identity);
      candidates.push({ ...row, source: row.source === 'monid' ? 'paid data' : row.source || 'live' });
    }

    for (const row of recorded.filter((entry) => shoppingNameKey(entry.name) === nameKey)) {
      const identity = identityFor(row);
      if (seenStores.has(identity)) continue;
      seenStores.add(identity);
      candidates.push(row);
    }

    const itemMatches = candidates.map((candidate) => matchFor(item, candidate));
    const eligible = candidates.filter((candidate, index) => itemMatches[index].equivalent);
    const reference = eligible.length
      ? eligible[majorityReference(eligible, { generic: true, ingredient: item.name })]
      : null;
    const comparable = [];
    const excluded = [];

    candidates.forEach((candidate, index) => {
      const itemMatch = itemMatches[index];
      const pair = reference && candidate !== reference
        ? classifyProductMatch(reference, candidate, { generic: true, ingredient: item.name })
        : itemMatch;
      const accepted = itemMatch.equivalent && (candidate === reference || pairAccepts(pair));
      const match = accepted
        ? {
          ...pair,
          equivalent: true,
          comparable: true,
          substitution: Boolean(itemMatch.substitution || pair.substitution),
        }
        : {
          ...pair,
          equivalent: false,
          comparable: false,
          substitution: false,
        };
      const identity = identityFor(candidate);
      if (!labels.has(identity)) labels.set(identity, displayStore(candidate));
      const store = labels.get(identity);
      const offer = {
        ...candidate,
        store,
        retailer: candidate.retailer || store,
        matchClassification: match.classification,
        matchConfidence: match.confidence,
        equivalent: match.equivalent,
        comparable: match.comparable,
        substitution: match.substitution,
        matchReasons: match.reasons,
      };
      if (accepted) comparable.push(candidate);
      else excluded.push({
        store,
        product: candidate.name || candidate.product || null,
        reason: matchDifferenceLabel(match),
      });
      if (!offersByStore[store]) offersByStore[store] = {};
      offersByStore[store][nameKey] = offer;
    });

    evidence.push({
      name: item.name,
      status: candidates.length === 0 ? 'missing' : comparable.length > 1 ? 'compared' : 'single',
      retailers: comparable.length,
      excluded,
    });
  }

  return {
    offersByStore,
    stores: [...labels.values()],
    evidence,
  };
};

/** Compare a shopping list using live checks, with receipt fallback. */
export const optimiseLiveBasket = (items = [], options = {}) => {
  const prepared = buildBasketOffers(items, options);
  const comparison = compareBaskets(items, prepared.offersByStore, {
    ...(options || {}),
    stores: prepared.stores,
    requireComplete: true,
  });
  return { ...prepared, ...comparison };
};
