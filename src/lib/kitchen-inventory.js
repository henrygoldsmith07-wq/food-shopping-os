/**
 * "What's in my kitchen": turning what someone says into pantry rows.
 *
 * People do not fill in forms about their fridge. They say "half a bag of
 * spinach, two tins of chopped tomatoes, some cheddar", or they paste a
 * shopping list, or they photograph a shelf. All of those arrive here as text,
 * and leave as rows the pantry can hold.
 *
 * The point of this module is that it is honest about how sure it is. The
 * pantry already has a five-state truth model — see kitchen.js — and every row
 * this produces carries the two confidences that feed it:
 *
 *   confidence:       do we believe this is in the kitchen at all?
 *   amountConfidence: do we believe the amount?
 *
 * A line that named a quantity gets an amount confidence; a line that said
 * "some cheese" gets `unknown`, and the pantry then declines to promise the
 * amount is enough for anything. A line whose name matched the food catalogue
 * is believed; one that did not is `probable` and asks to be confirmed. That is
 * the difference between an inventory and a wish list.
 */

import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_LOCATION, LOCATIONS } from '../data/pantry.js';
import { formatQuantity, parseQuantity } from './measure.js';
import { canonicalName } from './aliases.js';
import { searchFoods } from './foodlog.js';
import { CATALOGUE } from '../data/foods.js';

/** Lines longer than this are prose, not inventory. */
const MAX_LINE = 90;
/** One paste should not become a thousand rows. */
export const MAX_ROWS = 80;

/**
 * Spoken and pasted lists do not come in tidy lines. Commas, semicolons, "and"
 * and bullet characters all separate items; a comma inside a quantity
 * ("1,5 kg") does not, which is why the split runs on the separators rather
 * than on every comma.
 */
/* Dictation and ordinary speech spell numbers out. Only a leading one is
   converted, because that is where an amount goes — a "seven-spice" in the
   middle of a name is a name. */
const SPOKEN_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, twenty: 20,
};

const digitsForSpokenNumber = (line) => line.replace(
  new RegExp(`^(?:a\\s+)?(${Object.keys(SPOKEN_NUMBERS).join('|')})\\b`, 'i'),
  (_, word) => String(SPOKEN_NUMBERS[word.toLowerCase()]),
);

export const splitInventoryText = (text) => String(text || '')
  .replace(/\r/g, '')
  .split(/\n|;|,(?!\d)|\s+\+\s+|\s+and\s+/i)
  .map((line) => digitsForSpokenNumber(line
    .replace(/^\s*(?:[-•*·–—]\s*|\d+[.)]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim()))
  .filter((line) => line.length >= 2 && line.length <= MAX_LINE);

/* Words that mean "I am not telling you how much", so the row must not
   pretend to an amount it was never given. */
const VAGUE = /\b(some|a few|a bit of|lots of|plenty of|loads of|a couple of|leftover|leftovers|half a|part of|the rest of|open|opened)\b/i;

/* Where a line says where it lives: "spinach (fridge)", "peas in the freezer". */
const LOCATION_WORDS = LOCATIONS.join('|');
const LOCATION_HINT = new RegExp(`\\b(?:(?:in|from|the)\\s+)*(${LOCATION_WORDS})\\b`, 'i');

const CATEGORY_HINTS = [
  [/\b(tins?|tinned|cans?|canned|jars?|jarred)\b/i, 'Tins & jars'],
  [/\b(frozen|freezer)\b/i, 'Frozen'],
  [/\b(flour|sugar|oats|rice|pasta|lentils|noodles|dried)\b/i, 'Baking & dry'],
  [/\b(oils?|vinegar|sauces?|ketchup|mayo|mayonnaise|stock)\b/i, 'Sauces & oils'],
  [/\b(salt|pepper|paprika|cumin|spice|spices|herb|herbs|cinnamon|oregano)\b/i, 'Herbs & spices'],
  [/\b(juices?|squash|cola|beer|lager|wine|milk|water)\b/i, 'Drinks'],
  [/\b(vitamin|supplement|protein powder|creatine)\b/i, 'Supplements'],
  [/\b(leftover|leftovers)\b/i, 'Leftovers'],
];

const categoryFor = (line, food) => {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(line)) return category;
  }
  if (food?.tags?.includes('frozen')) return 'Frozen';
  return DEFAULT_CATEGORY;
};

const locationFor = (line, category) => {
  const hint = LOCATION_HINT.exec(line);
  if (hint) {
    const matched = LOCATIONS.find((l) => l.toLowerCase() === hint[1].toLowerCase());
    if (matched) return matched;
  }
  if (category === 'Frozen') return 'Freezer';
  if (['Baking & dry', 'Tins & jars', 'Sauces & oils', 'Herbs & spices'].includes(category)) return 'Cupboard';
  return DEFAULT_LOCATION;
};

/**
 * Split a line into the amount at the front and the thing it is an amount of.
 *
 * "2 tins chopped tomatoes" → qty "2 tins", name "chopped tomatoes".
 * "chopped tomatoes"        → no qty, name unchanged.
 */
/* A word that can be part of an amount rather than part of a name. The list
   matters: parseQuantity is deliberately forgiving about trailing text, so
   without a boundary "400g chicken" parses and the row ends up called
   "breast". */
const QTY_TOKEN = new RegExp([
  '^~?\\d[\\d.,/\\u2013\\u2014-]*[a-z]*$',
  '^(?:x|of|about|around|roughly|approx\\.?)$',
  '^(?:g|kg|mg|ml|l|litres?|grams?|kilos?|kg\\.|oz|lbs?|tsp|tbsp|dsp|cups?|pinch(?:es)?|cloves?|sprigs?)$',
  '^(?:tins?|cans?|jars?|bags?|packs?|packets?|boxes|box|tubs?|bottles?|cartons?|punnets?|slices?|handfuls?|bunch(?:es)?)$',
].join('|'), 'i');

const splitQuantity = (line, ingredient) => {
  const tokens = line.split(' ');
  // The measurement engine already knows what a quantity looks like — packs,
  // ranges and fractions included — so the leading run of amount-ish words is
  // handed to it, longest first, and the first reading it accepts wins.
  let boundary = 0;
  while (boundary < tokens.length - 1 && QTY_TOKEN.test(tokens[boundary])) boundary += 1;
  if (boundary > 0) {
    for (let take = boundary; take >= 1; take -= 1) {
      const head = tokens.slice(0, take).join(' ');
      const rest = tokens.slice(take).join(' ').trim();
      if (rest.length < 2) continue;
      const parsed = parseQuantity(head, { ingredient });
      if (parsed) return { qty: formatQuantity(parsed), parsed, name: rest };
    }
  }
  // A bare "half a bag of X" or "a dozen eggs" names no amount we can hold to.
  const leading = /^((?:half|quarter|a dozen|a couple|a few)(?: a| of)?)\s+(.*)$/i.exec(line);
  if (leading && leading[2].trim().length >= 2) {
    return { qty: '', parsed: null, name: leading[2].replace(/^(?:bag|box|packet|pack|tub|tin|jar|bottle)\s+of\s+/i, '').trim() };
  }
  return { qty: '', parsed: null, name: line };
};

const cleanName = (name) => name
  .replace(/\(([^)]*)\)/g, ' ')
  .replace(new RegExp(`\\b(?:(?:in|from|the)\\s+)*(?:${LOCATION_WORDS})\\b`, 'ig'), ' ')
  .replace(VAGUE, ' ')
  .replace(/\b(?:of|left|remaining)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^[-–—\s]+|[-–—\s.]+$/g, '');

/* Crude singularisation, enough to see that "salmon fillets" and "Salmon
   fillet" are the same shelf. */
const stem = (word) => word.replace(/(?:ies)$/, 'y').replace(/(?:ses|shes|ches)$/, 's').replace(/s$/, '');

const words = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean)
  .map(stem);

/**
 * Is this catalogue food actually the thing the line named?
 *
 * The food search matches on substrings, which is right when someone is typing
 * into a search box and wrong here: "eggs" finding a Greggs baguette would put
 * a baguette in the fridge. One name has to contain all of the other's words
 * for the row to claim a match — anything less stays unmatched and is offered
 * to the user to confirm, which is the point of the confidence model.
 */
const looksLikeSameThing = (food, name) => {
  const asked = words(name);
  const found = words(food?.name);
  if (!asked.length || !found.length) return false;
  const covers = (a, b) => b.every((word) => a.includes(word));
  return covers(found, asked) || covers(asked, found);
};

/**
 * One spoken or written line, as a pantry row.
 *
 * Returns null for a line with nothing nameable left in it, rather than a row
 * called "some" — an inventory with junk in it is worse than a shorter one.
 */
export const parseInventoryLine = (line, {
  catalogue = CATALOGUE, learnedAliases = {}, location = null,
} = {}) => {
  const raw = String(line || '').trim();
  if (raw.length < 2) return null;
  const vague = VAGUE.test(raw);
  const provisionalName = cleanName(splitQuantity(raw, '').name);
  const ingredient = canonicalName(provisionalName, learnedAliases);
  const { qty, parsed } = splitQuantity(raw, ingredient);
  const name = cleanName(splitQuantity(raw, ingredient).name);
  if (name.length < 2) return null;

  // Search on what was said and on its singular, because the catalogue writes
  // "Salmon fillet" and people say "salmon fillets".
  const singular = words(name).join(' ');
  const candidates = [
    ...searchFoods(name, catalogue, 6),
    ...(singular && singular !== name.toLowerCase() ? searchFoods(singular, catalogue, 6) : []),
  ];
  const food = candidates.find((candidate) =>
    looksLikeSameThing(candidate, name)
    || canonicalName(candidate.name, learnedAliases) === ingredient) || null;
  const category = categoryFor(raw, food);

  return {
    name: food ? food.name : name,
    emoji: food?.emoji || '🍽️',
    qty,
    cat: CATEGORIES.includes(category) ? category : DEFAULT_CATEGORY,
    location: location || locationFor(raw, category),
    cost: 0,
    store: '',
    expiry: null,
    // Believed if the catalogue recognised it; otherwise it wants a look at.
    confidence: food ? 'definite' : 'probable',
    // The amount is only as good as what was actually said.
    amountConfidence: !qty || vague ? 'unknown' : parsed?.confidence === 'exact' ? 'exact' : 'approximate',
    matched: Boolean(food),
    foodId: food?.id || null,
    line: raw,
  };
};

/**
 * A whole dictation, paste or photo transcript, as rows.
 *
 * Repeats are merged by ingredient rather than by spelling, so "2 tins
 * tomatoes" and "tinned tomatoes" from the same paste become one row that
 * keeps the stated amount and admits the merge cost it certainty.
 */
export const parseInventoryText = (text, options = {}) => {
  const rows = [];
  const byIngredient = new Map();
  for (const line of splitInventoryText(text)) {
    if (rows.length >= MAX_ROWS) break;
    const row = parseInventoryLine(line, options);
    if (!row) continue;
    const key = canonicalName(row.name, options.learnedAliases || {});
    const existing = byIngredient.get(key);
    if (!existing) {
      byIngredient.set(key, row);
      rows.push(row);
      continue;
    }
    // Two mentions of the same thing: keep the one that said an amount, and
    // stop claiming the amount is exact now that two lines disagree.
    if (!existing.qty && row.qty) existing.qty = row.qty;
    existing.amountConfidence = existing.amountConfidence === 'unknown' && row.amountConfidence === 'unknown'
      ? 'unknown'
      : 'approximate';
  }
  return rows;
};

/** What the parse found, in a sentence the user can check at a glance. */
export const inventorySummary = (rows = []) => {
  const matched = rows.filter((row) => row.matched).length;
  const amounts = rows.filter((row) => row.amountConfidence !== 'unknown').length;
  return {
    total: rows.length,
    matched,
    unmatched: rows.length - matched,
    withAmounts: amounts,
    withoutAmounts: rows.length - amounts,
    line: rows.length === 0
      ? 'Nothing readable in that yet.'
      : `${rows.length} item${rows.length === 1 ? '' : 's'} · ${matched} recognised · ${amounts} with an amount`,
  };
};

/** The row as the pantry stores it, without the parser's working notes. */
export const toPantryItem = ({ matched, foodId, line, original, ...item }) => item;

export const INVENTORY_ROUTE = '/api/kitchen/inventory';

const routeError = async (response) => {
  try {
    const body = await response.json();
    return body?.error || 'That could not be read.';
  } catch {
    return 'That could not be read.';
  }
};

/**
 * Ask the backend to make a list out of something the local parser struggles
 * with — a rambling sentence, or a photo of a shelf.
 *
 * What comes back is text, and it goes straight through `parseInventoryText`
 * like anything typed. The model gets to suggest words; it never gets to
 * decide how confident the pantry is about them.
 */
export const assistedInventory = async ({ text, image }, { fetchImpl = fetch } = {}) => {
  const response = await fetchImpl(INVENTORY_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(image ? { image } : { text }),
  });
  if (!response.ok) throw new Error(await routeError(response));
  const body = await response.json();
  return { text: body.text || '', read: body.read || 'text', model: body.model || null };
};
