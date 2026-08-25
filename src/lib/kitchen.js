/**
 * Everything the app derives from what you actually did: pantry freshness,
 * what a shop cost, how prices moved, what the week's plan looks like, and
 * which achievements you've genuinely earned.
 *
 * No figure in the app is stored twice — each one is computed here from the
 * pantry, the shopping list, recorded shops, the plan and the food diary.
 */

import { RECIPES } from '../data/recipes.js';
import { canonicalName, sameIngredient } from './aliases.js';
import {
  formatQuantity, parseQuantity, scaleQuantity, subtractQuantities, sufficientFor,
} from './measure.js';
import { pantryConfidenceLevel as pantryEvidenceConfidence } from './pantry-intelligence.js';

import { addDays, DAY_MS, dayStamp, daysUntil, weekDates, weekStart } from './kitchen-dates.js';

/* The date helpers and the spending history live next door; re-exported here
   so the kitchen surface stays one import for every caller. */
export * from './kitchen-dates.js';
export * from './kitchen-spending.js';
export * from './pantry-share-code.js';

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
