/**
 * Turning what someone typed on a shopping list into what a shop can find.
 *
 * A supermarket search box is not a search engine. It matches product-name
 * tokens, and every extra token narrows the result set rather than ranking it,
 * so the things people naturally write on a list are exactly the things that
 * make the search return nothing:
 *
 *     "2 pints semi-skimmed milk"   → the "2 pints" excludes every 4-pint bottle
 *     "chicken breasts (organic)"   → the brackets are matched literally
 *     "Heinz Baked Beans 415g x4"   → "x4" appears on no product page
 *     "tinned tomatoes, chopped"    → the comma is a token
 *
 * None of those are user error; they are how a person writes a shopping list.
 * So rather than sending the raw string and reporting no-match, this builds a
 * short ladder of progressively broader queries and lets the caller walk it
 * until a shop answers.
 *
 * The broadening is one-directional and small — at most three rungs — because
 * each rung costs a fetch at every shop, and because a query broad enough to
 * always match is a query whose results mean nothing. "milk" finds milk;
 * "food" finds noise. Relevance is always judged against what the person
 * actually typed, never against the broadened query, so widening the search
 * can never widen what counts as an answer.
 */

import { answerOrder } from '../lib/shop-ranking.js';

/** Words that carry no product identity, so they cost tokens and find nothing. */
const NOISE = new Set([
  'a', 'an', 'and', 'of', 'the', 'with', 'for', 'any', 'some', 'plus',
  'own', 'brand', 'value', 'basics', 'essential', 'essentials',
  'pack', 'packs', 'packet', 'packets', 'box', 'boxes', 'bag', 'bags',
  'tin', 'tins', 'tinned', 'can', 'cans', 'canned', 'jar', 'jars',
  'bottle', 'bottles', 'carton', 'cartons', 'punnet', 'tub', 'tubs',
  'large', 'small', 'medium', 'big', 'mini', 'jumbo', 'family',
  'approx', 'about', 'roughly', 'ish', 'per',
]);

/** A token that states a quantity rather than a product. */
const QUANTITY = /^(?:\d+(?:[.,]\d+)?(?:kg|g|mg|kilo|kilos|lb|lbs|oz|l|ltr|litre|litres|ml|cl|cc|pt|pint|pints|pk|ct|s)?|x\d+|\d+x)$/i;

/** Units written on their own, after a number that was its own token. */
const UNIT_WORD = /^(?:kg|g|mg|kilo|kilos|lb|lbs|oz|l|ltr|litre|litres|ml|cl|pt|pint|pints|dozen|each)$/i;

const foldAccents = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Split a name into comparable tokens.
 *
 * Hyphens and slashes become spaces — "semi-skimmed" and "semi skimmed" are
 * the same product, and a shop writes it either way. Everything else that is
 * not a letter or digit is dropped, so a stray comma or bracket cannot become
 * a token nobody's catalogue contains.
 */
export const tokenise = (value = '') => foldAccents(String(value))
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[-/\\]+/g, ' ')
  .replace(/[^a-z0-9. ]+/g, ' ')
  .split(/\s+/)
  .map((token) => token.replace(/^\.+|\.+$/g, ''))
  .filter(Boolean);

/** Is this token about how much, rather than about what? */
export const isQuantity = (token) => QUANTITY.test(token) || UNIT_WORD.test(token);

/**
 * The words that identify the product: no quantities, no packaging nouns, no
 * filler. These are what a match is scored against.
 */
export const contentTerms = (value = '') => {
  const seen = new Set();
  const terms = [];
  for (const token of tokenise(value)) {
    if (isQuantity(token) || NOISE.has(token) || token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  return terms;
};

/**
 * Strip the asides a person writes for themselves, not for the shop.
 *
 * A bracketed note and anything after a comma are both qualifiers — useful to
 * the shopper, and usually absent from the product's name. They are removed
 * for the search but kept in the item's own name, which is what the result is
 * judged against.
 */
const withoutAsides = (value = '') => String(value)
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .split(',')[0]
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The ladder of queries to try, most specific first.
 *
 * Rung 1 is what they typed, minus the brackets and punctuation a search box
 * cannot use. Rung 2 drops the quantity, which is the single most common
 * reason a real product fails to come back — shops name the pack size their
 * own way, and "2 pints" is not how a 1.13L bottle is listed. Rung 3 exists
 * only when a trailing note was written after a comma, and drops it.
 *
 * Rungs that would repeat an earlier one are dropped, so a plain "milk"
 * produces a one-rung ladder and costs exactly one fetch.
 */
export const searchQueries = (name = '', { max = 3 } = {}) => {
  // Brackets go immediately — they are never part of a product's name. A
  // comma is kept for now, because "tomatoes, chopped" is a description while
  // "milk, get the blue one" is a note to self, and only the later rungs can
  // afford to guess which.
  const full = String(name).replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const ladder = [];
  const push = (terms) => {
    const query = terms.join(' ').trim();
    if (query && !ladder.includes(query)) ladder.push(query);
  };

  push(tokenise(full).filter((token) => !NOISE.has(token)));
  push(contentTerms(full));
  // A third rung only where there was an aside to drop. "milk, get the blue
  // one" needs it; "organic free range eggs" does not, and inventing a
  // shorter query by lopping words off a coherent phrase produces searches no
  // person would type — "range eggs" — for no gain.
  const core = contentTerms(withoutAsides(name));
  if (core.length !== contentTerms(full).length) push(core);

  // Never send nothing. A name that is entirely quantity and packaging still
  // deserves its literal text tried once rather than an empty search.
  if (!ladder.length) {
    const fallback = String(name).trim();
    if (fallback) ladder.push(fallback);
  }
  return ladder.slice(0, max);
};

/** Crude singular/plural folding — enough for "beans" against "bean". */
const stem = (token) => {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
};

/** Within one edit of each other — "beanz"/"beans", "yogurt"/"yoghurt". */
const withinOneEdit = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let slack = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (!slack) return false;
    slack -= 1;
    if (short.length === long.length) { i += 1; j += 1; } else j += 1;
  }
  return true;
};

/**
 * Does this product name contain this term, allowing for how shops spell?
 *
 * Exact first, then stem, then one edit for words long enough that a single
 * changed letter is a spelling variant rather than a different food. Four
 * characters is the floor: at three, "oat" and "eat" are one edit apart.
 */
const termMatches = (term, words, joined) => {
  // A phrase may span words ("semi skimmed"), but it must start at a word:
  // a bare substring finds "ham" in "Chamber" and "tea" in "Steaks".
  if (` ${joined}`.includes(` ${term}`)) return true;
  const wanted = stem(term);
  return words.some((word) => {
    const other = stem(word);
    if (other === wanted || word.startsWith(term)) return true;
    // A spelling variant keeps its first letter (yoghurt/yogurt, beanz/beans);
    // "coffee" and "toffee" are one edit apart and different foods.
    return term.length >= 5 && wanted[0] === other[0] && withinOneEdit(wanted, other);
  });
};

/**
 * How well a row answers what the person actually asked for.
 *
 * Scored on identifying words only, so a query's "2 pints" cannot punish a
 * correct bottle and cannot flatter a wrong one. The head word — the last
 * describing word, which is nearly always the food itself — must be present:
 * without that rule a "customers also bought" rail full of half-matching
 * names scores well enough to be reported as the answer.
 */
/**
 * How many identifying words a row may be missing and still be the product.
 *
 * A ratio alone is the wrong shape here. At a third of the terms, a two-word
 * query like "skimmed milk" is satisfied by one word, so "Cadbury Dairy Milk
 * Chocolate" scores 0.5 and passes — a real price for the wrong food, which
 * is the exact failure the relevance filter exists to prevent.
 *
 * A budget of misses behaves the way a person would: name two things and both
 * must be there; name six and one or two may be phrasing the shop chose
 * differently.
 */
export const missBudget = (termCount) => Math.floor(termCount / 3);

/**
 * Foods that, written after the one asked for, turn it into a flavour.
 *
 * "Milk" is in "Dairy Milk Chocolate", "tomato" in "Tomato Ketchup" and
 * "chicken" in "Chicken Flavour Noodles" — and each is the cheapest row on its
 * page, so a head-word test alone reports a chocolate bar as the price of
 * milk. The word only disqualifies when the person did not ask for it.
 */
const DERIVED = new Set([
  'chocolate', 'flavour', 'flavor', 'flavoured', 'flavored', 'crisps', 'sauce',
  'ketchup', 'soup', 'stock', 'gravy', 'cake', 'biscuit', 'digestive', 'cookie',
  'noodle', 'puree', 'paste', 'juice', 'drink', 'smoothie', 'yogurt', 'yoghurt',
  'dessert', 'mousse', 'sweets', 'jelly', 'jam', 'marmalade', 'cordial', 'pie',
  'pasty', 'cracker', 'seasoning', 'powder', 'spread', 'dip', 'pudding',
  'muffin', 'popcorn', 'bread', 'flour', 'oil', 'salt', 'vinegar',
  // "Banana Chips", "Oat Bars", "Chicken Skewers": a snack or a meal made
  // from the food, not the food.
  'chips', 'bar', 'bars', 'skewers', 'sandwich', 'pancakes', 'filler',
]);

/** "Tuna in Sunflower Oil" is tuna: what follows these describes, not replaces. */
const CONNECTORS = new Set(['in', 'with']);

/** Is the head word only a modifier here — the flavour of some other product? */
const headIsModifier = (head, words, terms) => {
  const at = words.findIndex((word) => termMatches(head, [word], word));
  if (at < 0) return false;
  // Both foldings, because `stem` reads "sauces" as "sauc" and "pies" as "pi".
  // "crisps" and "sweets" are listed as written: "Apples Crisp & Sweet" is fruit.
  const derived = (word) => [word, stem(word), word.replace(/s$/, '')].find((base) => DERIVED.has(base)) || null;
  const asked = new Set(terms.map(derived).filter(Boolean));
  for (const word of words.slice(at + 1)) {
    if (CONNECTORS.has(word)) return false;
    const base = derived(word);
    if (base && !asked.has(base)) return true;
  }
  return false;
};

/**
 * Is this row the product that was asked for?
 *
 * Separate from the score because they answer different questions: the score
 * ranks the rows that qualify, this decides which qualify at all.
 */
export const isMatch = (name = '', query = '') => {
  const terms = contentTerms(withoutAsides(query));
  if (!terms.length) return false;
  const words = tokenise(name);
  if (!words.length) return false;
  const joined = words.join(' ');
  const head = terms[terms.length - 1];
  if (!termMatches(head, words, joined)) return false;
  if (headIsModifier(head, words, terms)) return false;
  const missed = terms.filter((term) => !termMatches(term, words, joined)).length;
  return missed <= missBudget(terms.length);
};

/**
 * The row that answers the item, across every shop that priced it.
 *
 * Rows a shop's own scrape scored carry `relevance`; rows from the market or
 * Monid are scored here against the same query, so the comparison is fair.
 */
export const bestAnswer = (rows = [], query = '') => rows
  .filter((row) => row?.price > 0)
  .map((row) => (typeof row.relevance === 'number' ? row : { ...row, relevance: matchScore(row.name, query) }))
  .sort(answerOrder)[0] || null;

export const matchScore = (name = '', query = '') => {
  // Judged against the product they named, minus the notes they wrote to
  // themselves. A bracketed reminder or a trailing "get the blue one" is not
  // something a shop prints on a label, and scoring against it would reject
  // the very product it describes.
  const terms = contentTerms(withoutAsides(query));
  if (!terms.length) return 0;
  const words = tokenise(name);
  if (!words.length) return 0;
  const joined = words.join(' ');
  const head = terms[terms.length - 1];
  if (!termMatches(head, words, joined)) return 0;
  const hits = terms.filter((term) => termMatches(term, words, joined)).length;
  // Every word of "chicken breast" is in "Tikka Chicken Breast Pieces", so
  // on hits alone the cheapest ready-to-eat pack wins the item. A product
  // that has been cooked, sliced or flavoured on the way to the shelf is a
  // weaker answer to a plain ingredient — unless that is what was asked.
  const asked = new Set(terms.map((term) => term.toLowerCase()));
  const prepared = words.filter((word) => PREPARED.has(word) && !asked.has(word)).length;
  const score = hits / terms.length - Math.min(prepared, 4) * 0.05;
  return Math.round(Math.max(score, 0.01) * 100) / 100;
};

/** Words that mark a processed or ready-to-eat version of an ingredient. */
const PREPARED = new Set([
  'cooked', 'roast', 'roasted', 'tikka', 'sliced', 'slices', 'chunks', 'pieces', 'marinated',
  'breaded', 'battered', 'crispy', 'flavoured', 'flavour', 'snap', 'kiev', 'kievs',
  'ready', 'meal', 'sandwich', 'uht', 'longlife', 'dried', 'snack',
  'bbq', 'piri', 'peri', 'southern', 'fried', 'glazed', 'stuffed', 'seasoned', 'spiced',
]);
