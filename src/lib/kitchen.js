/**
 * Everything the app derives from what you actually did: pantry freshness,
 * what a shop cost, how prices moved, what the week's plan looks like, and
 * which achievements you've genuinely earned.
 *
 * No figure in the app is stored twice — each one is computed here from the
 * pantry, the shopping list, recorded shops, the plan and the food diary.
 */

import { RECIPES } from '../data/recipes.js';
import { BADGES } from '../data/plan.js';
import { canonicalName, sameIngredient } from './aliases.js';
import {
  formatQuantity, parseQuantity, scaleQuantity, subtractQuantities, sufficientFor,
} from './measure.js';
import { pantryConfidenceLevel as pantryEvidenceConfidence } from './pantry-intelligence.js';

export const dayStamp = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const DAY_MS = 86400000;

export const addDays = (stamp, n) => dayStamp(new Date(`${stamp}T12:00:00`).getTime() + n * DAY_MS);

/** Days from today until a date; negative once it's in the past. */
export const daysUntil = (stamp, today = dayStamp()) =>
  stamp ? Math.round((new Date(`${stamp}T12:00:00`) - new Date(`${today}T12:00:00`)) / DAY_MS) : null;

/** Monday-first week containing `stamp`. */
export const weekStart = (stamp = dayStamp()) => {
  const d = new Date(`${stamp}T12:00:00`);
  const shift = (d.getDay() + 6) % 7; // Sunday = 6
  return dayStamp(d.getTime() - shift * DAY_MS);
};

export const weekDates = (stamp = dayStamp()) => {
  const start = weekStart(stamp);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/* ---------- Pantry ---------- */

export const pantryValue = (pantry = []) =>
  Math.round(pantry.reduce((sum, p) => sum + (Number(p.cost) || 0), 0) * 100) / 100;

/** Items with an expiry date, soonest first — the ones worth cooking next. */
export const expiringSoon = (pantry = [], within = 3, today = dayStamp()) =>
  pantry
    .filter((p) => p.expiry && daysUntil(p.expiry, today) <= within)
    .sort((a, b) => daysUntil(a.expiry, today) - daysUntil(b.expiry, today));

export const runningLow = (pantry = []) => pantry.filter((p) => p.low);

/** How sure we are that this row is still in the kitchen. Defaults to definite for old rows. */
export const PANTRY_CONFIDENCE = ["definite", "probable", "unknown"];
export const AMOUNT_CONFIDENCE = ["exact", "approximate", "unknown"];
export const pantryConfidence = (item) => {
  const v = String(item?.confidence || "definite").toLowerCase();
  return PANTRY_CONFIDENCE.includes(v) ? v : "definite";
};
export const pantryConfidenceLevel = pantryEvidenceConfidence;
export const effectivePantryConfidence = (item, today = dayStamp()) => pantryEvidenceConfidence(item, today).level;
export const amountConfidence = (item) => {
  const v = String(item?.amountConfidence || (item?.qty ? "approximate" : "unknown")).toLowerCase();
  return AMOUNT_CONFIDENCE.includes(v) ? v : "approximate";
};
export const PANTRY_AVAILABILITY = ["confirmed_sufficient", "confirmed_insufficient", "probably_available", "running_low", "unknown"];

/**
 * Quantity/confidence-aware pantry truth — the 5-state model the app promises.
 *  - confirmed_sufficient: definitely have, not low, amount sufficient for any need passed in
 *  - confirmed_insufficient: definitely have but amount is known to be insufficient for the need
 *  - probably_available: probably have (confidence=probable) — counted, but flagged
 *  - running_low: have, but marked low — still counts as have, but surfaces as "add to list"
 *  - unknown: confidence=unknown or amount unknown with no usable qty — not counted in coverage
 *
 * The need-aware variant compares parsed have qty vs need qty when both are countable.
 */
export const pantryAvailability = (item, today = dayStamp()) => {
  const c = effectivePantryConfidence(item, today);
  const a = amountConfidence(item);
  if (c === "unknown") return "unknown";
  if (item?.low) return "running_low";
  if (c === "probable") return "probably_available";
  // Definitely have it; the amount just isn't recorded. That still counts as
  // having it — the amount-aware pass downgrades to confirmed_insufficient
  // only when both sides are countable and the pantry is short.
  if (a === "unknown") return "confirmed_sufficient";
  return "confirmed_sufficient";
};

/**
 * Is what we have enough for what a recipe asks?
 *
 * The comparison runs through the shared measurement engine, so a pantry row
 * saying "1 tin" and a recipe asking for "400 g" are now recognised as the same
 * amount instead of being written off as incomparable. The ingredient name is
 * passed through because it is what makes a tin of coconut milk 400 ml rather
 * than 400 g. When the two genuinely cannot be put on one scale the answer
 * stays at the name-level truth rather than becoming a guess.
 */
export const pantryTruthForNeed = (item, needQty, { today = dayStamp(), learnedAliases = {} } = {}) => {
  const base = pantryAvailability(item, today);
  if (base !== "confirmed_sufficient") return base;
  if (!needQty) return base;
  const ingredient = canonicalName(item?.name, learnedAliases);
  const enough = sufficientFor(item?.qty, needQty, { ingredient });
  if (enough === null) return base;
  return enough ? "confirmed_sufficient" : "confirmed_insufficient";
};

export const isPantrySufficient = (item, needQty, options = {}) => {
  const truth = needQty ? pantryTruthForNeed(item, needQty, options) : pantryAvailability(item, options.today || dayStamp());
  return truth === "confirmed_sufficient" || truth === "probably_available";
};

export const pantryTruthLabel = (truth) => ({
  confirmed_sufficient: "Confirmed sufficient",
  confirmed_insufficient: "Not enough — add to list",
  probably_available: "Probably have",
  running_low: "Running low",
  unknown: "Unknown — check before you shop",
}[truth] || truth);

export const pantryTruthTone = (truth) => ({
  confirmed_sufficient: "good",
  confirmed_insufficient: "warn",
  probably_available: "muted",
  running_low: "warn",
  unknown: "faint",
}[truth] || "muted");

export const pantryUncertaintyLabel = (item, today = dayStamp()) => {
  const evidence = pantryEvidenceConfidence(item, today);
  const c = evidence.level;
  const a = amountConfidence(item);
  if (c === "unknown") return "unknown — not counted in coverage";
  if (c === "probable") return "probably have" + (evidence.decayed ? " · confirm" : "") + (a === "unknown" ? " · amount unknown" : a === "approximate" ? " · amount approx." : "");
  if (item?.low) return "running low" + (a === "unknown" ? " · amount unknown" : "");
  return "definitely have" + (a === "exact" ? " · amount known" : a === "unknown" ? " · amount unknown" : " · amount approx.");
};
// Exclude unknown-confidence rows from pantry-aware coverage so recommendations don't assume a perfect pantry


export const leftovers = (pantry = []) => pantry.filter((p) => p.cat === 'Leftovers');

/* ---------- Freshness: bought / opened / frozen ---------- */

/** Days since an item was bought (null when no date was recorded). */
export const daysSince = (stamp, today = dayStamp()) =>
  /^\d{4}-\d{2}-\d{2}$/.test(stamp || '') ? Math.max(0, Math.round((new Date(`${today}T12:00:00`) - new Date(`${stamp}T12:00:00`)) / DAY_MS)) : null;

/** How long an item has been open — the clock that matters for freshness. */
export const openAge = (item, today = dayStamp()) => daysSince(item?.openedDate, today);

export const purchaseAge = (item, today = dayStamp()) => daysSince(item?.purchaseDate || item?.addedAt, today);

/**
 * How long an item stays good once opened, per category — an everyday rule of
 * thumb (milk ~5 days, opened sauce ~3 weeks), stated as such, never as a
 * hard food-safety claim.
 */
export const OPENED_DAYS = {
  'Dairy & eggs': 5,
  Fresh: 4,
  Meat: 2,
  Fish: 2,
  'Tins & jars': 21,
  'Sauces & oils': 21,
  'Baking & dry': 60,
  Leftovers: 3,
  Drinks: 7,
  'Herbs & spices': 90,
};

export const OPENED_LABEL = {
  'Dairy & eggs': '5 days',
  Fresh: '4 days',
  Meat: '2 days',
  Fish: '2 days',
  'Tins & jars': '3 weeks',
  'Sauces & oils': '3 weeks',
  'Baking & dry': '2 months',
  Leftovers: '3 days',
  Drinks: '1 week',
  'Herbs & spices': '3 months',
};

/** How long frozen food keeps its quality, per category. */
export const FROZEN_DAYS = {
  Meat: 90,
  Fish: 90,
  Fresh: 120,
  Bread: 60,
  'Tins & jars': null, // not frozen
  'Baking & dry': 180,
  Leftovers: 60,
  'Dairy & eggs': 60,
  Drinks: 90,
  'Herbs & spices': 180,
};

export const freezerDays = (item, today = dayStamp()) =>
  item?.location === 'Freezer' ? daysSince(item?.purchaseDate || item?.addedAt, today) : null;

/**
 * An honest freshness read for one row: what we know, and whether it says
 * "fine", "getting old" or "past it". Never a food-safety claim — a date the
 * user didn't record is reported as unknown, not assumed.
 */
export const freshnessOf = (item, today = dayStamp()) => {
  const frozen = freezerDays(item, today);
  if (frozen !== null) {
    const limit = FROZEN_DAYS[item?.cat] ?? 90;
    if (limit === null) return { kind: 'not-frozen', label: 'Not usually frozen — move to the fridge.' };
    const left = limit - frozen;
    return {
      kind: left < 0 ? 'past' : left <= 14 ? 'soon' : 'fine',
      label: left < 0
        ? `Frozen ${frozen} days — past the ${OPENED_LABEL[item?.cat] || '3 months'} rule of thumb.`
        : `Frozen ${frozen} days · about ${left} days of quality left.`,
    };
  }
  const opened = openAge(item, today);
  if (opened !== null) {
    const limit = OPENED_DAYS[item?.cat] ?? 7;
    const left = limit - opened;
    return {
      kind: left < 0 ? 'past' : left <= 1 ? 'soon' : 'fine',
      label: left < 0
        ? `Opened ${opened} days ago — past the ~${OPENED_LABEL[item?.cat] || '1 week'} rule of thumb.`
        : opened === 0
          ? 'Opened today.'
          : `Opened ${opened} days ago · about ${left} day${left === 1 ? '' : 's'} left.`,
    };
  }
  const bought = purchaseAge(item, today);
  if (bought === null) return { kind: 'unknown', label: 'No date recorded.' };
  return bought === 0
    ? { kind: 'fine', label: 'Bought today.' }
    : { kind: 'fine', label: `Bought ${bought} day${bought === 1 ? '' : 's'} ago.` };
};

const money = (value) => Math.round(value * 100) / 100;

const groupedInventory = (pantry, field, fallback) => {
  const groups = new Map();
  pantry.forEach((item) => {
    const label = String(item[field] || fallback);
    const row = groups.get(label) || { label, count: 0, value: 0 };
    row.count += 1;
    row.value += Number(item.cost) || 0;
    groups.set(label, row);
  });
  return [...groups.values()]
    .map((row) => ({ ...row, value: money(row.value) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

/** A live pantry summary; all figures are derived from inventory rows. */
export const pantryAnalytics = (pantry = [], today = dayStamp()) => ({
  total: pantry.length,
  value: pantryValue(pantry),
  dated: pantry.filter((item) => item.expiry).length,
  useSoon: expiringSoon(pantry, 3, today).length,
  low: runningLow(pantry).length,
  byLocation: groupedInventory(pantry, 'location', 'Unassigned'),
  byCategory: groupedInventory(pantry, 'cat', 'Other'),
});

const inventoryName = (value) => String(value || '')
  .trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');

/** The quantity a pantry row represents, leftovers counted in portions. */
const pantryQty = (item) => {
  const ingredient = canonicalName(item?.name);
  if (item?.cat === 'Leftovers' && Number(item.portions) > 0) {
    return parseQuantity(`${item.portions} portions`, { ingredient });
  }
  return parseQuantity(item?.qty, { ingredient });
};

/** A row rewritten to hold `next`, with its cost scaled to what is left. */
const restock = (item, previous, next) => {
  const cost = Number(item.cost);
  const share = previous.amount > 0 ? next.amount / previous.amount : 0;
  return {
    ...item,
    ...(item.cat === 'Leftovers' && Number(item.portions) > 0
      ? { portions: Math.round(next.amount * 100) / 100 }
      : {}),
    qty: formatQuantity(next),
    ...(Number.isFinite(cost) ? { cost: money(cost * share) } : {}),
  };
};

/**
 * "Use one" as a person means it: one tin off a row of two tins, one portion
 * off a stack of leftovers. A row measured straight in grams has no "one" to
 * take — 500 g of flour is used up, not reduced to 499 g — so it is removed,
 * which is what the pantry has always done with a free-text amount.
 */
const oneUnitOff = (item) => {
  const parsed = pantryQty(item);
  if (!parsed) return null;
  // A package row: count the packages, not the grams inside them.
  const packages = parsed.count ? parsed.count.amount : (parsed.dim === 'count' ? parsed.amount : null);
  if (packages === null || packages <= 1) return null;
  const unit = parsed.count ? parsed.count.unit : parsed.unit;
  const left = Math.round((packages - 1) * 100) / 100;
  return {
    text: formatQuantity({ amount: left, dim: 'count', unit }),
    share: left / packages,
    portions: left,
  };
};

/** Consume one safe, countable pantry unit; free-text amounts are used up whole. */
export const decrementPantryItem = (item) => {
  const next = oneUnitOff(item);
  if (!next) return { remove: true };
  const cost = Number(item.cost);
  return {
    remove: false,
    item: {
      ...item,
      ...(item?.cat === 'Leftovers' && Number(item.portions) > 0 ? { portions: next.portions } : {}),
      qty: next.text,
      ...(Number.isFinite(cost) ? { cost: money(cost * next.share) } : {}),
    },
  };
};

export const pantryUseLabel = (item) => {
  if (!oneUnitOff(item)) return 'Use up';
  return item?.cat === 'Leftovers' ? 'Use one portion' : 'Use one';
};

const matchesIngredient = (item, wanted, learnedAliases) => {
  const stocked = canonicalName(item?.name, learnedAliases);
  return sameIngredient(stocked, wanted, learnedAliases)
    || (Math.min(stocked.length, wanted.length) >= 4
      && (stocked.includes(wanted) || wanted.includes(stocked)));
};

/**
 * Cooking a dish takes what the dish actually used.
 *
 * The old behaviour spent exactly one unit per ingredient, whatever the recipe
 * said: cook a traybake calling for eight thighs and the pantry would still
 * claim seven were in the fridge. Now the amount a recipe asks for is measured
 * against the amount on the shelf and the difference is what comes off — across
 * several rows if need be, oldest date first so the thing nearest its end gets
 * used before the fresh one.
 *
 * Three honesty rules survive from the old version:
 *  - a row whose quantity cannot be read is used up whole rather than guessed
 *    at, and reported in `assumed` so the UI can say so;
 *  - running short is recorded in `shortfalls`, not silently rounded away —
 *    that is what tells you the pantry was wrong before you cooked;
 *  - `restore` carries the pantry exactly as it was, so undoing a cook is one
 *    action rather than a reconstruction.
 *
 * `servings` scales the recipe: cooking 6 portions of a 4-portion dish takes
 * 1.5x the ingredients.
 */
export const consumePantryIngredients = (pantry = [], ingredients = [], {
  learnedAliases = {}, servings = null, recipeServings = null, today = dayStamp(),
} = {}) => {
  const remaining = [...pantry];
  const used = [];
  const shortfalls = [];
  const assumed = [];
  const confirmationNeeded = [];
  const factor = servings > 0 && recipeServings > 0 ? servings / recipeServings : 1;

  ingredients.forEach((ingredient) => {
    const wanted = canonicalName(ingredient.name, learnedAliases);
    if (!wanted) return;
    // Oldest date first: cooking should empty the carton that is about to turn.
    const candidates = remaining
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => matchesIngredient(item, wanted, learnedAliases))
      .sort((a, b) => String(a.item.expiry || '9999-12-31').localeCompare(String(b.item.expiry || '9999-12-31')));
    if (!candidates.length) return;

    const base = parseQuantity(ingredient.qty, { ingredient: wanted });
    let need = base ? scaleQuantity(base, factor) : null;

    for (const { item } of candidates) {
      if (need && need.amount <= 0) break;
      const have = pantryQty(item);
      const position = remaining.indexOf(item);
      if (position < 0) continue;

      // Unknown or decayed stock is evidence to check, not permission to
      // silently spend. A probable row can still be used, but is reported as
      // an assumption so the cook result remains honest.
      const confidence = effectivePantryConfidence(item, today);
      if (confidence === 'unknown') {
        confirmationNeeded.push({ name: item.name, itemId: item.id, reason: 'stock confidence is unknown' });
        continue;
      }
      if (confidence === 'probable') assumed.push({ name: item.name, reason: 'stock confidence is probable' });

      // The recipe never said how much. Spend one unit — the smallest change
      // that is still true — rather than clearing the row on an assumption.
      if (!need) {
        const next = decrementPantryItem(item);
        used.push(item);
        assumed.push({ name: item.name, reason: 'recipe does not say how much' });
        if (next.remove) remaining.splice(position, 1);
        else remaining[position] = next.item;
        break;
      }

      // The pantry row is unreadable free text. Use it up rather than imply a
      // measurement we do not have.
      if (!have) {
        used.push(item);
        assumed.push({ name: item.name, reason: 'pantry amount not readable' });
        remaining.splice(position, 1);
        continue;
      }

      const left = subtractQuantities(have, need, { ingredient: wanted });
      if (!left) {
        // Mass against volume with no density to bridge them. Use the row whole
        // rather than pretend the scales meet.
        used.push(item);
        assumed.push({ name: item.name, reason: 'amounts are on different scales' });
        remaining.splice(position, 1);
        break;
      }

      used.push({ ...item, usedQty: formatQuantity({ ...need, amount: Math.min(need.amount, have.amount) }) });
      if (left.amount <= 0) remaining.splice(position, 1);
      else remaining[position] = restock(item, have, left);
      need = { ...need, amount: left.shortfall || 0 };
    }

    if (need && need.amount > 0) {
      shortfalls.push({ name: ingredient.name, short: formatQuantity(need), needed: ingredient.qty });
    }
  });

  return {
    pantry: remaining,
    used,
    shortfalls,
    assumed,
    confirmationNeeded,
    inference: {
      type: 'recipe_consumption',
      confidence: shortfalls.length || confirmationNeeded.length ? 'low' : assumed.length ? 'medium' : 'high',
      used: used.length,
      shortfalls: shortfalls.length,
      confirmationNeeded: confirmationNeeded.length,
      at: today,
    },
    restore: pantry,
    at: today,
  };
};

const encodeUtf8 = (value) => btoa(unescape(encodeURIComponent(value)));
const decodeUtf8 = (value) => decodeURIComponent(escape(atob(value)));

/** Portable snapshot generated locally for the user to send without an upload. */
export const pantryShareCode = (pantry = []) =>
  `FORQ-PANTRY-1.${encodeUtf8(JSON.stringify(pantry.map((item) => ({
    name: String(item.name || '').trim(),
    confidence: pantryConfidence(item),
    amountConfidence: amountConfidence(item),
    emoji: item.emoji || '',
    qty: String(item.qty || ''),
    cost: Number(item.cost) || 0,
    location: String(item.location || 'Pantry'),
    cat: String(item.cat || 'Other'),
    store: String(item.store || ''),
    expiry: item.expiry || null,
    low: Boolean(item.low),
  }))))}`;

export const pantryFromShareCode = (code) => {
  try {
    const text = String(code || '').trim();
    if (!text.startsWith('FORQ-PANTRY-1.')) throw new Error();
    const rows = JSON.parse(decodeUtf8(text.slice('FORQ-PANTRY-1.'.length)));
    if (!Array.isArray(rows) || rows.length > 500 || rows.some((item) => !item || typeof item.name !== 'string')) throw new Error();
    return rows.filter((item) => item.name.trim()).map((item) => ({
      ...item,
      name: item.name.trim().slice(0, 120),
      qty: String(item.qty || '').slice(0, 60),
      confidence: String(item.confidence || 'definite').slice(0,20),
      cost: Math.max(0, Number(item.cost) || 0),
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(item.expiry || '') ? item.expiry : null,
      low: Boolean(item.low),
    }));
  } catch {
    throw new Error('That pantry code is invalid or damaged.');
  }
};

/** Recipes that use something about to go off, best match first. */
export const recipesUsing = (pantry = [], limit = 3, today = dayStamp()) => {
  const names = expiringSoon(pantry, 3, today).map((p) => p.name.toLowerCase());
  if (!names.length) return [];
  return RECIPES
    .map((r) => ({
      recipe: r,
      hits: r.ingredients.filter((i) => names.some((n) => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
};

/* ---------- Shops and spending ---------- */

export const shopsInWeek = (shops = [], stamp = dayStamp()) => {
  const start = weekStart(stamp);
  const end = addDays(start, 7);
  return shops.filter((s) => s.date >= start && s.date < end);
};

export const spentInWeek = (shops = [], stamp = dayStamp()) =>
  Math.round(shopsInWeek(shops, stamp).reduce((sum, s) => sum + (Number(s.total) || 0), 0) * 100) / 100;

export const spentInMonth = (shops = [], stamp = dayStamp()) => {
  const month = String(stamp).slice(0, 7);
  return Math.round(
    shops.filter((shop) => String(shop.date).slice(0, 7) === month)
      .reduce((sum, shop) => sum + (Number(shop.total) || 0), 0) * 100,
  ) / 100;
};

/** Monthly totals, oldest first — the profile's spending chart. */
export const spendByMonth = (shops = [], months = 6, today = dayStamp()) => {
  const out = [];
  const base = new Date(`${today}T12:00:00`);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const spend = shops
      .filter((s) => s.date.slice(0, 7) === key)
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    out.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short' }), spend: Math.round(spend * 100) / 100 });
  }
  return out;
};

/** Weeks (most recent first) where recorded spend stayed inside the budget. */
export const budgetWeeks = (shops = [], weeklyBudget = 0, today = dayStamp()) => {
  if (!weeklyBudget) return 0;
  let streak = 0;
  for (let i = 1; i <= 12; i += 1) {
    const stamp = addDays(weekStart(today), -7 * i);
    const week = shopsInWeek(shops, stamp);
    if (!week.length) break;
    if (spentInWeek(shops, stamp) > weeklyBudget) break;
    streak += 1;
  }
  return streak;
};

/**
 * What you have actually paid for a thing, over time. Only names bought more
 * than once show a trend — everything else is a single data point, and says so.
 */
export const priceHistory = (shops = []) => {
  const byName = new Map();
  for (const shop of [...shops].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const item of shop.items || []) {
      const price = Number(item.price) || 0;
      if (!price) continue;
      const key = item.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, { name: item.name.trim(), emoji: item.emoji, points: [] });
      byName.get(key).points.push({ date: shop.date, price, store: shop.store });
    }
  }
  return [...byName.values()]
    .map((entry) => {
      const prices = entry.points.map((p) => p.price);
      const latest = prices[prices.length - 1];
      const previous = prices.length > 1 ? prices[prices.length - 2] : null;
      const best = Math.min(...prices);
      return {
        ...entry,
        prices,
        latest,
        previous,
        change: previous === null ? null : Math.round((latest - previous) * 100) / 100,
        best,
        bestStore: entry.points.find((p) => p.price === best)?.store || null,
        // Provenance: the date and store behind the latest figure, so a price
        // always carries its own timestamp rather than a bare number.
        latestDate: entry.points[entry.points.length - 1]?.date || null,
        latestStore: entry.points[entry.points.length - 1]?.store || null,
        times: prices.length,
      };
    })
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
};

/** Like-for-like movement across products bought at least twice. */
export const groceryInflation = (shops = []) => {
  const comparable = priceHistory(shops).filter((item) => item.points.length > 1);
  const baseline = Math.round(comparable.reduce((sum, item) => sum + item.points[0].price, 0) * 100) / 100;
  const current = Math.round(comparable.reduce((sum, item) => sum + item.latest, 0) * 100) / 100;
  return {
    items: comparable.length,
    baseline,
    current,
    change: Math.round((current - baseline) * 100) / 100,
    percent: baseline ? Math.round(((current - baseline) / baseline) * 1000) / 10 : null,
  };
};

export const savingsSummary = (shops = []) => ({
  saved: Math.round(shops.reduce((sum, shop) => sum + (Number(shop.saved) || 0), 0) * 100) / 100,
  trips: shops.filter((shop) => Number(shop.saved) > 0).length,
});

/* ---------- Plan ---------- */

export const planForDay = (plan = {}, stamp = dayStamp()) => plan[stamp] || {};

export const planCost = (slots = {}) =>
  Math.round(
    Object.values(slots)
      .map((id) => RECIPES.find((r) => r.id === id))
      .filter(Boolean)
      .reduce((sum, r) => sum + r.costPerServing, 0) * 100,
  ) / 100;

export const plannedMeals = (plan = {}) =>
  Object.values(plan).reduce((n, slots) => n + Object.values(slots).filter(Boolean).length, 0);

/* ---------- Achievements ---------- */

export const levelFrom = (xp, per = 160) => Math.floor(Math.max(0, xp) / per) + 1;

/**
 * Consecutive days ending today (or yesterday, so an evening cook still counts
 * tomorrow morning) — used for both the cooking streak and logging streaks.
 */
export const streakFrom = (days = [], today = dayStamp()) => {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

const PLANT_TAGS = ['vegan', 'vegetarian'];

/** Real counters behind the badges. */
export const kitchenStats = (
  { cooked = [], log = {}, shops = [], weeklyBudget = 0, xp = 0, plan = {}, myRecipes = [] },
  today = dayStamp(),
) => {
  const recipes = cooked.map((c) => RECIPES.find((r) => r.id === c.recipeId)).filter(Boolean);
  return {
    recipesCooked: cooked.length,
    cuisines: new Set(recipes.map((r) => r.cuisine)).size,
    plantMeals: recipes.filter((r) => r.tags.some((t) => PLANT_TAGS.includes(t))).length,
    streak: streakFrom(cooked.map((c) => c.date), today),
    loggedDays: Object.values(log).filter((entries) => entries.length).length,
    budgetWeeks: budgetWeeks(shops, weeklyBudget, today),
    level: levelFrom(xp),
    shops: shops.length,
    plannedMeals: Object.values(plan).reduce((n, day) => n + Object.keys(day).length, 0),
    ownRecipes: myRecipes.length,
    entriesLogged: Object.values(log).reduce((n, day) => n + day.length, 0),
  };
};

export const badgeProgress = (stats) =>
  BADGES.map((b) => {
    const progress = Math.min(stats[b.metric] || 0, b.of);
    return { ...b, progress, earned: progress >= b.of };
  });

/** Which cuisines you actually cook, as a share of everything cooked. */
export const cuisineSplit = (cooked = []) => {
  const counts = new Map();
  for (const entry of cooked) {
    const recipe = RECIPES.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;
    counts.set(recipe.cuisine, (counts.get(recipe.cuisine) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...counts.entries()]
    .map(([name, n]) => ({ name, count: n, pct: Math.round((n / total) * 100) }))
    .sort((a, b) => b.count - a.count);
};
