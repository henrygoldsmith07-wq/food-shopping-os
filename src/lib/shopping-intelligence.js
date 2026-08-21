/**
 * Decision support for the shopping loop.
 *
 * This module only ranks evidence already in Forq: the substitution table,
 * the household pantry, recorded shops and the measurement engine. It never
 * turns a missing retailer or price into a confident claim.
 */

import { substitutesFor } from '../data/substitutions.js';
import { aisleFor, groupForStore, shoppingNameKey } from './shopping.js';
import { canonicalName, sameIngredient } from './aliases.js';
import { priceHistory } from './kitchen.js';
import { compareUnitPrices, unitPriceOf } from './measure.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const clean = (value) => String(value || '').trim();

const PRICE_SOURCES = {
  receipt: { score: 0.95, label: 'Receipt-backed', detail: 'Recorded from a completed shop.' },
  recorded: { score: 0.9, label: 'Recorded price', detail: 'Entered from your own shopping evidence.' },
  manual: { score: 0.7, label: 'Entered price', detail: 'Typed into the list; confirm at the till.' },
  retailer: { score: 0.65, label: 'Retailer reference', detail: 'A retailer reference that may change.' },
  observed: { score: 0.55, label: 'Community observed', detail: 'Dated community observation, not a live quote.' },
  estimated: { score: 0.35, label: 'Estimated', detail: 'An estimate rather than a recorded purchase.' },
  unknown: { score: 0, label: 'No price', detail: 'No price evidence yet.' },
};

const sourceFor = (item = {}) => {
  if (!(Number(item.price) > 0)) return 'unknown';
  if (item.priceSource && PRICE_SOURCES[item.priceSource]) return item.priceSource;
  if (item.receiptPrice || item.recordedAt) return 'receipt';
  if (item.observedPrice || item.source === 'open-prices') return 'observed';
  return 'manual';
};

const levelFor = (score) => score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : score > 0 ? 'low' : 'unknown';

/** Explain how much trust a list price deserves. */
export const priceConfidenceFor = (item = {}) => {
  const source = sourceFor(item);
  const sourceInfo = PRICE_SOURCES[source] || PRICE_SOURCES.unknown;
  const unit = unitPriceOf(item.price, item.qty, { ingredient: canonicalName(item.name) });
  const score = unit?.confidence === 'approximate'
    ? round2(sourceInfo.score * 0.75)
    : sourceInfo.score;
  return {
    source,
    level: levelFor(score),
    score,
    label: sourceInfo.label,
    detail: unit?.confidence === 'approximate'
      ? `${sourceInfo.detail} Unit value uses an approximate pack size.`
      : sourceInfo.detail,
    unitConfidence: unit?.confidence || 'unknown',
  };
};

const findHistoryEntry = (name, shops = []) => {
  const target = shoppingNameKey(name);
  return priceHistory(shops).find((entry) => shoppingNameKey(entry.name) === target) || null;
};

/** Track the latest like-for-like price movement from recorded shops. */
export const priceChangeFor = (name, shops = []) => {
  const entry = findHistoryEntry(name, shops);
  if (!entry?.points?.length) {
    return { status: 'unknown', observations: 0, latest: null, previous: null, change: null, pct: null, direction: 'unknown' };
  }
  const latestPoint = entry.points.at(-1);
  const previousPoint = entry.points.at(-2) || null;
  const latest = Number(latestPoint?.price) || 0;
  const previous = previousPoint ? Number(previousPoint.price) || 0 : null;
  const change = previous === null ? null : round2(latest - previous);
  const pct = previous > 0 ? round1(((latest - previous) / previous) * 100) : null;
  return {
    status: previous === null ? 'watching' : 'tracked',
    observations: entry.points.length,
    latest,
    previous,
    change,
    pct,
    direction: change === null ? 'unknown' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    latestDate: latestPoint?.date || null,
    latestStore: latestPoint?.store || null,
    previousDate: previousPoint?.date || null,
    previousStore: previousPoint?.store || null,
    baseline: entry.points.length > 1 ? round2(entry.points.slice(0, -1).reduce((sum, point) => sum + Number(point.price || 0), 0) / (entry.points.length - 1)) : null,
  };
};

const namesMatch = (left, right, learnedAliases = {}) =>
  sameIngredient(left, right, learnedAliases) || shoppingNameKey(left) === shoppingNameKey(right);

const recentlyPurchased = (name, shops = [], today = '', recentDays = 3, learnedAliases = {}) => {
  if (!today) return null;
  const todayTime = new Date(`${today}T12:00:00`).getTime();
  return [...shops].reverse().flatMap((shop) => (shop.items || []).map((item) => ({ shop, item })))
    .find(({ shop, item }) => {
      if (!namesMatch(name, item.name, learnedAliases)) return false;
      const date = new Date(`${shop.date}T12:00:00`).getTime();
      const age = Math.round((todayTime - date) / 86400000);
      return Number.isFinite(age) && age >= 0 && age <= recentDays;
    }) || null;
};

/** Guard the list and the till against an accidental second purchase. */
export const duplicatePurchaseCheck = (item = {}, {
  list = [], shops = [], today = '', excludeId = null, recentDays = 3, learnedAliases = {},
} = {}) => {
  const exactOnList = (list || []).find((row) => row.id !== excludeId && namesMatch(item.name, row.name, learnedAliases)) || null;
  const recent = recentlyPurchased(item.name, shops, today, recentDays, learnedAliases);
  return {
    duplicate: Boolean(exactOnList),
    exactOnList,
    recentlyPurchased: recent ? { name: recent.item.name, date: recent.shop.date, store: recent.shop.store } : null,
    level: exactOnList ? 'blocked' : recent ? 'warning' : 'clear',
    message: exactOnList
      ? `Already on your list as “${exactOnList.name}”.`
      : recent
        ? `Bought ${recent.item.name} at ${recent.shop.store || 'your last shop'} on ${recent.shop.date}; check before buying it again.`
        : '',
  };
};

export const duplicatePurchaseWarnings = (items = [], options = {}) =>
  items.map((item) => ({ item, check: duplicatePurchaseCheck(item, options) }))
    .filter(({ check }) => check.level === 'warning');

const optionMatchesPreference = (option, diets = []) => {
  const patterns = (diets || []).map((diet) => String(diet).toLowerCase());
  if (!patterns.length || !option.for?.length) return true;
  return option.for.some((pattern) => patterns.includes(String(pattern).toLowerCase()));
};

const textBlocked = (name, terms = []) => (terms || []).some((term) => {
  const needle = shoppingNameKey(term);
  const haystack = shoppingNameKey(name);
  return needle && (haystack === needle || haystack.includes(needle));
});

/** Rank substitutions by dietary fit, pantry availability and price evidence. */
export const substitutionCandidates = (item = {}, {
  diets = [], allergies = [], intolerances = [], pantry = [], shops = [], learnedAliases = {},
} = {}) => {
  const history = priceHistory(shops);
  const options = substitutesFor(item.name);
  return options
    .map((option) => {
      const inPantry = (pantry || []).find((row) => namesMatch(option.name, row.name, learnedAliases)) || null;
      const historyEntry = history.find((entry) => namesMatch(option.name, entry.name, learnedAliases));
      const blocked = textBlocked(option.name, allergies);
      const flagged = textBlocked(option.name, intolerances);
      const preferenceFit = optionMatchesPreference(option, diets);
      const price = historyEntry?.latest || null;
      const score = (preferenceFit ? 4 : 0) + (inPantry ? 3 : 0) + (price ? 1 : 0) - (blocked ? 10 : 0) - (flagged ? 1 : 0);
      return {
        ...option,
        safe: !blocked,
        flagged,
        preferenceFit,
        inPantry: Boolean(inPantry),
        price,
        priceConfidence: price ? 'receipt' : 'unknown',
        score,
        rationale: [
          option.why,
          inPantry ? 'Already in your pantry.' : '',
          price ? `Last paid £${Number(price).toFixed(2)}.` : 'No recorded price yet.',
          flagged ? 'Check the intolerance before buying.' : '',
        ].filter(Boolean).join(' '),
      };
    })
    .filter((option) => option.safe)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};

export const substitutionPlan = (item = {}, options = {}) => {
  const candidates = substitutionCandidates(item, options);
  return {
    item: item.name,
    candidates,
    best: candidates[0] || null,
    confidence: candidates.length ? 'verified-table' : 'none',
  };
};

/** Flatten the learned aisle groups for export, keyboard and touch surfaces. */
export const orderShoppingList = (items = [], options = {}) =>
  groupForStore(items, options).flatMap(([aisle, rows], aisleIndex) => rows.map((item, itemIndex) => ({
    ...item,
    aisle: item.aisle || aisle,
    aisleIndex,
    itemIndex,
  })));

/** Compare current and recorded pack sizes without crossing measurement scales. */
export const compareShoppingPrices = (item = {}, shops = []) => {
  const rows = [];
  if (Number(item.price) > 0) rows.push({ ...item, source: 'current list', ingredient: canonicalName(item.name) });
  for (const shop of shops || []) {
    for (const row of shop.items || []) {
      if (!namesMatch(item.name, row.name)) continue;
      rows.push({ ...row, source: shop.store || 'recorded shop', store: shop.store || '', date: shop.date || '', ingredient: canonicalName(item.name) });
    }
  }
  const comparison = compareUnitPrices(rows);
  return {
    ...comparison,
    rows: comparison.ranked,
    comparable: comparison.ranked.length,
    confidence: comparison.ranked.some((row) => row.unitPrice.confidence === 'approximate') ? 'approximate' : comparison.ranked.length ? 'exact' : 'unknown',
  };
};

export const shoppingInsightFor = (item = {}, { shops = [], pantry = [], list = [], diets = [], allergies = [], intolerances = [], today = '', learnedAliases = {}, store = '', routes = {}, memory = {} } = {}) => ({
  price: priceConfidenceFor(item),
  priceChange: priceChangeFor(item.name, shops),
  duplicate: duplicatePurchaseCheck(item, { list, shops, today, excludeId: item.id, learnedAliases }),
  substitutions: substitutionPlan(item, { diets, allergies, intolerances, pantry, shops, learnedAliases }),
  unitPrices: compareShoppingPrices(item, shops),
  aisle: aisleFor(item.name, memory),
  routePosition: orderShoppingList([item], { store, routes, memory })[0]?.aisleIndex ?? null,
});
