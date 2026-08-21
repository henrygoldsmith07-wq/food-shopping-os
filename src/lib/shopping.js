/**
 * The shopping list, made smarter by what you have actually done.
 *
 * This module does not call a supermarket price feed. Every "smart" behaviour
 * here is derived from your own history: the aisle you last
 * filed something under, prices you recorded, the order you ticked items off
 * and offers you entered. Missing history is stated rather than guessed.
 */

import { AISLE_ORDER, guessAisle } from '../data/stores.js';
import { dayStamp, priceHistory } from './kitchen.js';
import { mergeQtys } from './pantry.js';
import { entityKey } from './aliases.js';
import { compareUnitPrices, unitPriceOf } from './measure.js';

const key = (name) => String(name || '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

const VOICE_NUMBERS = {
  an: '1', a: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', couple: '2', few: '3',
};
const VOICE_UNIT_PATTERN = 'kilograms?|kg|grams?|grammes?|g|millilitres?|milliliters?|ml|litres?|liters?|l|packs?|bags?|boxes?|cartons?|bottles?|jars?|tins?|cans?|bunch|bunches|loaf|loaves|pieces?|slices?|portions?|servings?|dozens?';
const VOICE_UNIT_ALIASES = {
  kilogram: 'kg', kilograms: 'kg', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  litre: 'l', litres: 'l', liter: 'l', liters: 'l', millilitre: 'ml', millilitres: 'ml',
  milliliter: 'ml', milliliters: 'ml',
};
const normaliseVoiceQty = (value) => String(value || '').replace(/\b(kilograms?|grams?|grammes?|litres?|liters?|millilitres?|milliliters?)\b/gi, (unit) => VOICE_UNIT_ALIASES[unit.toLowerCase()] || unit.toLowerCase());

const voiceItem = (chunk) => {
  const text = String(chunk || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const bulk = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?\\s*(?:${VOICE_UNIT_PATTERN}))\\s+(?:of\\s+)?(.+)$`, 'i'));
  if (bulk) {
    const packed = normaliseVoiceQty(bulk[2]).replace(/\s+/g, '');
    return { name: bulk[3].replace(/[.!?]+$/, '').trim(), qty: `${bulk[1]} x ${packed}` };
  }
  const prefix = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?|${Object.keys(VOICE_NUMBERS).join('|')})\\s*((${VOICE_UNIT_PATTERN})\\b)?\\s*(?:of\\s+)?(.+)$`, 'i'));
  if (!prefix) return { name: text.replace(/[.!?]+$/, '').trim(), qty: '' };
  const number = VOICE_NUMBERS[prefix[1].toLowerCase()] || prefix[1];
  const unit = prefix[3] ? (VOICE_UNIT_ALIASES[prefix[3].toLowerCase()] || prefix[3].toLowerCase()) : '';
  const name = prefix[4].replace(/[.!?]+$/, '').trim();
  return name ? { name, qty: unit ? `${number} ${unit}` : number } : null;
};

/** Turn a spoken shopping sentence into separate, editable list items. */
export const parseVoiceShopping = (text) => {
  const body = String(text || '')
    .trim()
    .replace(/^(?:please\s+)?(?:add|buy|put\s+on\s+the\s+list|we\s+need|need)\s+/i, '');
  if (!body || /^(?:add|buy|please|need)$/i.test(body)) return { items: [], heard: body };
  const chunks = body.split(/\s*(?:,|;|\band\b|\bplus\b)\s*/i)
    .map((chunk) => voiceItem(chunk))
    .filter((item) => item?.name.length >= 2);
  return { items: chunks, heard: body };
};

/**
 * What a row costs per 100 g, per 100 ml or per item — the number that says
 * whether the big box is actually cheaper.
 *
 * The reading comes from the shared measurement engine, so this now works for
 * the sizes a real shelf uses: "1 litre" and "1l" give the same answer, "6 x
 * 125 g" divides properly, and a size that had to lean on a generic package
 * average comes back marked approximate rather than posing as a measurement.
 */
export const unitPrice = (item = {}) =>
  unitPriceOf(item.price, item.qty, { ingredient: entityKey(item.name) });

/**
 * Rank sizes of the same product by what they really cost. Rows that cannot be
 * put on one scale are returned separately instead of being dropped from a
 * "best value" claim, and a best that is only a hair cheaper reports its margin
 * so the UI can decline to make a fuss about 1p.
 */
export const compareSizes = (rows = []) =>
  compareUnitPrices(rows.map((row) => ({ ...row, ingredient: entityKey(row.name) })));

export const shoppingNameKey = (name) => {
  const raw = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const words = raw.replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const key = words.map((word) => {
    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 3) return word.slice(0, -1);
    return word;
  }).join(' ');
  return key || raw;
};

/** Suggest the quantity this household most often recorded for a product. */
export const quantitySuggestion = (name, shops = []) => {
  const target = shoppingNameKey(name);
  if (!target) return null;
  const seen = new Map();
  for (const [shopIndex, shop] of (shops || []).entries()) {
    const shopKey = shop.id || `${shop.date || ''}|${shop.store || ''}|${shopIndex}`;
    for (const item of shop.items || []) {
      if (shoppingNameKey(item.name) !== target) continue;
      const qty = String(item.qty || '').trim();
      if (!qty) continue;
      const current = seen.get(qty) || { qty, count: 0, shops: new Set(), lastShop: -1 };
      seen.set(qty, {
        ...current,
        count: current.count + 1,
        shops: new Set([...current.shops, shopKey]),
        lastShop: Math.max(current.lastShop, shopIndex),
      });
    }
  }
  if (!seen.size) return null;
  const usual = [...seen.values()].sort((a, b) => b.shops.size - a.shops.size || b.lastShop - a.lastShop)[0];
  return {
    qty: usual.qty,
    times: [...seen.values()].reduce((total, row) => total + row.count, 0),
    matches: usual.shops.size,
  };
};

/** Find an existing list row that looks like the item someone is typing. */
export const findShoppingDuplicate = (name, items = []) => {
  const key = shoppingNameKey(name);
  if (!key) return null;
  const exact = items.find((item) => shoppingNameKey(item.name) === key);
  if (exact) return { kind: 'exact', item: exact };

  const words = new Set(key.split(' '));
  if (words.size < 2) return null;
  const similar = items.find((item) => {
    const other = new Set(shoppingNameKey(item.name).split(' '));
    const shared = [...words].filter((word) => other.has(word)).length;
    return shared >= 2 && shared / Math.min(words.size, other.size) >= 0.75;
  });
  return similar ? { kind: 'similar', item: similar } : null;
};

/* ---------- Aisles that learn ---------- */

/**
 * Where an item goes: what you filed it under last time, otherwise the guess
 * from its name. Correcting an aisle once is meant to stick.
 */
export const aisleFor = (name, memory = {}) => memory[key(name)] || guessAisle(name);

export const rememberAisle = (memory = {}, name, aisle) =>
  (aisle ? { ...memory, [key(name)]: aisle } : memory);

/** Re-file a list with everything you've taught it since. */
export const refile = (items = [], memory = {}) =>
  items.map((i) => (memory[key(i.name)] ? { ...i, aisle: memory[key(i.name)] } : i));

/**
 * The order to walk the aisles in: the route you actually took last time you
 * shopped here, then anything new, in the standard order.
 */
export const routeFor = (store, routes = {}) => {
  const learned = routes[store] || [];
  return [...learned, ...AISLE_ORDER.filter((a) => !learned.includes(a))];
};

/** Group a list by aisle, in the route order for the store you're going to. */
export const groupForStore = (items = [], { store = null, routes = {}, memory = {} } = {}) => {
  const order = routeFor(store, routes);
  const map = new Map(order.map((a) => [a, []]));
  for (const item of refile(items, memory)) {
    const aisle = map.has(item.aisle) ? item.aisle : 'Other';
    map.get(aisle).push(item);
  }
  return [...map.entries()].filter(([, list]) => list.length);
};

/** The aisle sequence you ticked items off in — your route through that shop. */
export const routeFromTicks = (items = []) => {
  const ticked = items
    .filter((i) => i.checked && i.checkedAt)
    .sort((a, b) => a.checkedAt - b.checkedAt);
  const seen = [];
  for (const item of ticked) {
    const aisle = item.aisle || 'Other';
    if (!seen.includes(aisle)) seen.push(aisle);
  }
  return seen;
};

/* ---------- Price comparison, from your own receipts ---------- */

/** The cheapest you have ever paid for something, and where. */
export const cheapestFor = (name, history = []) => {
  const entry = history.find((h) => key(h.name) === key(name));
  if (!entry) return null;
  return { price: entry.best, store: entry.bestStore, times: entry.times, latest: entry.latest };
};

/** What you last paid for something at one particular shop. */
const priceAt = (entry, store) => {
  const points = entry.points.filter((p) => p.store === store);
  return points.length ? points[points.length - 1].price : null;
};

/**
 * What this list would cost at each shop you've been to, using the prices you
 * recorded there. `covered` is how many items that shop can actually price —
 * a total built from two known prices is not a comparison, and says so.
 */
export const compareStores = (items = [], shops = []) => {
  const history = priceHistory(shops);
  const stores = [...new Set(shops.map((s) => s.store))];
  return stores
    .map((store) => {
      let total = 0;
      let covered = 0;
      for (const item of items) {
        const entry = history.find((h) => key(h.name) === key(item.name));
        const price = entry ? priceAt(entry, store) : null;
        if (price === null) continue;
        covered += 1;
        total += price;
      }
      return { store, total: round2(total), covered, of: items.length };
    })
    .filter((row) => row.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.total - b.total);
};

/** Items on the list you have bought cheaper somewhere else. */
export const savingsAvailable = (items = [], shops = []) => {
  const history = priceHistory(shops);
  return items
    .map((item) => {
      const best = cheapestFor(item.name, history);
      if (!best || !item.price || best.price >= item.price) return null;
      return { name: item.name, paying: item.price, best: best.price, store: best.store, saving: round2(item.price - best.price) };
    })
    .filter(Boolean)
    .sort((a, b) => b.saving - a.saving);
};

export const priceAlertMatches = (alerts = [], shops = []) => {
  const history = priceHistory(shops);
  return alerts.map((alert) => {
    const item = history.find((entry) => key(entry.name) === key(alert.name));
    const latestByStore = new Map();
    item?.points.forEach((point) => latestByStore.set(point.store, point));
    const bestCurrent = [...latestByStore.values()].sort((a, b) => a.price - b.price)[0] || null;
    const latest = bestCurrent?.price ?? null;
    return {
      ...alert,
      latest,
      hit: latest !== null && latest <= Number(alert.target),
      store: bestCurrent?.store || null,
    };
  });
};

/* ---------- Offers you told it about ---------- */

export const OFFER_KINDS = [
  { id: 'money', label: '£ off', hint: '£1.00 off' },
  { id: 'percent', label: '% off', hint: '25% off' },
  { id: 'multibuy', label: 'Multibuy', hint: '3 for 2' },
];

const matches = (item, offer) => {
  const term = key(offer.match || offer.label);
  return term ? key(item.name).includes(term) : false;
};

/**
 * Apply the offers you've entered to a list. Only your own offers exist here —
 * the app has no deals feed and never invents one.
 */
export const applyOffers = (items = [], offers = [], { store = '', today = '' } = {}) => {
  const lines = [];
  let saved = 0;
  const hasStoreAssignments = items.some((item) => item.store);
  for (const offer of offers) {
    if (offer.store && store && key(offer.store) !== key(store)) continue;
    if (offer.expiry && today && offer.expiry < today) continue;
    const hits = items.filter((i) => matches(i, offer)
      && (!offer.store || !hasStoreAssignments || key(i.store) === key(store || offer.store)));
    if (!hits.length) continue;
    const spend = hits.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
    let off = 0;
    if (offer.kind === 'money') off = Math.min(spend, Number(offer.value) || 0);
    else if (offer.kind === 'percent') off = spend * (Math.min(100, Number(offer.value) || 0) / 100);
    else if (offer.kind === 'multibuy') {
      // "3 for 2": every third matching item is free, cheapest first.
      const group = Math.max(2, Number(offer.value) || 3);
      const prices = hits.map((i) => Number(i.price) || 0).sort((a, b) => a - b);
      const free = Math.floor(prices.length / group);
      off = prices.slice(0, free).reduce((sum, p) => sum + p, 0);
    }
    off = round2(off);
    if (off <= 0 && offer.kind !== 'multibuy') continue;
    saved += off;
    lines.push({ offer, items: hits.map((i) => i.name), saved: off });
  }
  return { lines, saved: round2(saved) };
};

/* ---------- What the basket does to your budget ---------- */

/**
 * The list against your week: what it comes to, what your own offers take off,
 * and what that leaves of the budget after what you've already spent.
 */
export const basketProjection = (items = [], {
  budget = 0, spent = 0, offers = [], store = '', today = '',
} = {}) => {
  const priced = items.filter((i) => Number(i.price) > 0);
  const total = round2(items.reduce((sum, i) => sum + (Number(i.price) || 0), 0));
  const { lines, saved } = applyOffers(items, offers, { store, today });
  const projected = round2(Math.max(0, total - saved));
  return {
    total,
    saved,
    projected,
    offers: lines,
    priced: priced.length,
    unpriced: items.length - priced.length,
    budget,
    spent: round2(spent),
    left: budget ? round2(budget - spent - projected) : null,
    over: budget > 0 && spent + projected > budget,
  };
};

/* ---------- Pantry: what's going off, what ran out ---------- */

export const EXPIRY_BUCKETS = [
  { id: 'gone', label: 'Past its date', within: -1 },
  { id: 'today', label: 'Today or tomorrow', within: 1 },
  { id: 'soon', label: 'Within three days', within: 3 },
  { id: 'week', label: 'This week', within: 7 },
];

/** Pantry items grouped by how urgent they are, soonest first. */
export const expiryBuckets = (pantry = [], daysUntil) => {
  const dated = pantry.filter((p) => p.expiry).map((p) => ({ item: p, days: daysUntil(p.expiry) }));
  return EXPIRY_BUCKETS
    .map((bucket, i) => {
      const from = i === 0 ? -Infinity : EXPIRY_BUCKETS[i - 1].within;
      return {
        ...bucket,
        items: dated
          .filter((d) => d.days > from && d.days <= bucket.within)
          .sort((a, b) => a.days - b.days),
      };
    })
    .filter((b) => b.items.length);
};

/** What throwing food away has cost you, from the items you binned. */
export const wasteSummary = (waste = []) => ({
  count: waste.length,
  cost: round2(waste.reduce((sum, w) => sum + (Number(w.cost) || 0), 0)),
  worst: [...waste].sort((a, b) => (b.cost || 0) - (a.cost || 0))[0] || null,
});

/**
 * Things you buy again and again but haven't got in — read off your own
 * receipts, never a generic "people also buy" list.
 * Pantry truth: probably_available and confirmed_sufficient count as have;
 * running_low / unknown / confirmed_insufficient do not suppress the suggestion.
 */
export const restockSuggestions = (shops = [], pantry = [], list = [], limit = 6) => {
  const pantryCovered = new Set(
    pantry
      .filter((row) => {
        const c = String(row.confidence || "definite").toLowerCase();
        if (c === "unknown") return false;
        if (row.low) return false;
        // Probable counts; definite counts even when the amount wasn't recorded.
        return true;
      })
      .map((p) => key(p.name)),
  );
  const have = new Set([...pantryCovered, ...list.map((i) => key(i.name))]);
  const counts = new Map();
  for (const shop of shops) {
    for (const item of shop.items || []) {
      const k = key(item.name);
      if (have.has(k)) continue;
      const found = counts.get(k) || { name: item.name, emoji: item.emoji, times: 0, last: shop.date };
      found.times += 1;
      found.last = shop.date > found.last ? shop.date : found.last;
      counts.set(k, found);
    }
  }
  return [...counts.values()]
    .filter((c) => c.times >= 2)
    .sort((a, b) => b.times - a.times || b.last.localeCompare(a.last))
    .slice(0, limit);
};

/* ---------- Recurring staples ---------- */

/**
 * Staples you buy on a rhythm, read off your own shop history. An item counts
 * as a staple when bought at least three times; its cadence is the average gap
 * between the most recent three purchases. `dueNow` means you're at or past
 * the cadence and it isn't in the pantry or on the list.
 */
export const recurringStaples = (shops = [], pantry = [], list = [], { today = '' } = {}) => {
  const purchases = new Map(); // key -> [{date}]
  for (const shop of [...shops].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of shop.items || []) {
      const k = key(item.name);
      if (!k) continue;
      if (!purchases.has(k)) purchases.set(k, { name: item.name, emoji: item.emoji, dates: [] });
      purchases.get(k).dates.push(shop.date);
    }
  }
  const have = new Set([
    ...pantry.map((p) => key(p.name)),
    ...list.map((i) => key(i.name)),
  ]);
  const gapDays = (dates) => {
    const recent = dates.slice(-3);
    if (recent.length < 2) return null;
    const gaps = recent.slice(1).map((date, i) =>
      Math.round((new Date(`${date}T12:00:00`) - new Date(`${recent[i]}T12:00:00`)) / 86400000));
    return Math.max(1, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length));
  };
  const todayKey = today || (typeof dayStamp === 'function' ? dayStamp() : '');
  const out = [];
  for (const row of purchases.values()) {
    if (row.dates.length < 3 || have.has(key(row.name))) continue;
    const last = row.dates[row.dates.length - 1];
    const cadence = gapDays(row.dates);
    if (cadence === null) continue;
    const since = todayKey
      ? Math.round((new Date(`${todayKey}T12:00:00`) - new Date(`${last}T12:00:00`)) / 86400000)
      : null;
    out.push({
      name: row.name,
      emoji: row.emoji,
      times: row.dates.length,
      lastBought: last,
      cadence,
      since: since ?? null,
      dueNow: since !== null && since >= cadence * 0.8,
    });
  }
  return out.sort((a, b) => Number(b.dueNow) - Number(a.dueNow) || (a.since ?? 0) - (b.since ?? 0));
};

/* ---------- Honest deals ---------- */

/**
 * Whether an offer can be trusted against a basket. A multibuy that needs
 * three items to save is only a saving when at least three matching items are
 * on the list — otherwise it reports the gap, never an invented discount.
 */
export const dealQuality = (offer, items = [], { today = '' } = {}) => {
  if (offer?.expiry && today && offer.expiry < today) {
    return { honest: false, note: 'This offer has expired.' };
  }
  const matching = items.filter((i) => {
    const term = key(offer?.match || offer?.label);
    return term ? key(i.name).includes(term) : false;
  });
  if (offer?.kind === 'multibuy') {
    const group = Math.max(2, Number(offer?.value) || 3);
    const needed = group - (matching.length % group || group);
    if (matching.length < group) {
      return {
        honest: false,
        note: `${matching.length} item${matching.length === 1 ? '' : 's'} on the list — this deal needs ${group} to save. Add ${group - matching.length} more.`,
      };
    }
    return {
      honest: true,
      note: matching.length >= group
        ? `You'll get ${Math.floor(matching.length / group)} free (${Math.floor(matching.length / group) === 1 ? 'cheapest' : 'cheapest each group of'} ${group}).`
        : `Add ${needed} more for the ${group} for ${group - 1} deal.`,
    };
  }
  return matching.length ? { honest: true, note: '' } : { honest: false, note: 'Nothing on the list matches this offer yet.' };
};

/* ---------- Meals to shopping ---------- */

/**
 * Merge duplicate ingredient lines into one item, keeping every dish that
 * wanted it — one "Chicken breast" on the list, not four.
 *
 * Grouping runs on the canonical ingredient, not the literal string, so the
 * recipe that asks for "chopped tomatoes" and the one that asks for "tin
 * tomatoes" produce one row of 800 g rather than two rows the shopper has to
 * reconcile in the aisle. The name shown is the first one written, because that
 * is the wording the household recognises; `alsoKnownAs` keeps the other
 * spellings so the row can explain what it absorbed.
 *
 * `learnedAliases` threads through the corrections the household has taught,
 * so a pairing the curated table never knew about still consolidates.
 */
export const mergeItems = (items = [], { learnedAliases = {} } = {}) => {
  const merged = new Map();
  for (const item of items) {
    const k = entityKey(item.name, learnedAliases) || key(item.name);
    const found = merged.get(k);
    if (!found) {
      merged.set(k, {
        ...item,
        forRecipes: item.fromRecipe ? [item.fromRecipe] : [],
        alsoKnownAs: [],
      });
      continue;
    }
    if (item.fromRecipe && !found.forRecipes.includes(item.fromRecipe)) found.forRecipes.push(item.fromRecipe);
    if (key(item.name) !== key(found.name) && !found.alsoKnownAs.includes(item.name)) {
      found.alsoKnownAs.push(item.name);
    }
    // Sum quantities when they're on the same scale ("600 g" + "400 g" →
    // "1 kg"); otherwise keep them visible as separate amounts. The canonical
    // name goes in so "2 tins" of one thing and "400 g" of the same thing add
    // up instead of sitting side by side as incomparable text.
    found.qty = mergeQtys(found.qty, item.qty, { ingredient: k });
  }
  return [...merged.values()].map((item) => ({
    ...item,
    fromRecipe: item.forRecipes.length > 1 ? `${item.forRecipes.length} meals` : item.fromRecipe,
  }));
};
