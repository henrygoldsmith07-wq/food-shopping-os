/**
 * What a shopping item is, in words you can filter by.
 *
 * Tags come from four different places and are worth different amounts, so the
 * module keeps them apart rather than flattening everything into one confident
 * list:
 *
 *   nutrition   — a match against the food catalogue, then the UK/EU labelling
 *                 thresholds. Real numbers, but only when the match is safe.
 *   diet        — words in the product name. A filter, never a certification.
 *   processing  — words in the product name. An estimate, and labelled as one.
 *   value       — this item's own prices across shops and over time. Nothing
 *                 is inferred about a product from its price except whether it
 *                 is cheap relative to the same product elsewhere.
 *
 * The rule running through all of it: a tag that would be dangerous if wrong is
 * only ever stated in the safe direction. An allergen tag says "may contain",
 * never "free from", because the input is a product name and a product name
 * does not list what a factory also handles.
 */

import { ALLERGENS, MATCH_CAVEAT } from '../data/preferences.js';
import { BRANDED_FOODS } from '../data/branded-foods.js';
import { searchFoods } from './foodlog.js';

const tag = (id, label, group, tone = 'muted', detail = null) => ({ id, label, group, tone, detail });

/** Singular form, so "bananas" on a list matches "Banana" in the catalogue. */
const singular = (word) => {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
};

const words = (value) => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)
  .map(singular);

const norm = (value) => words(value).join(' ');

/**
 * Find the catalogue food a shopping item actually is.
 *
 * `searchFoods` is fuzzy — it answers "milk" with "Milk chocolate" — and a
 * nutrition tag hung on the wrong food is worse than no tag at all. So a match
 * only counts when the catalogue name and the item name share their meaningful
 * words, not merely one of them.
 */
export const matchFood = (name, catalogue = undefined) => {
  const wanted = new Set(words(name).filter((word) => word.length > 2));
  if (!wanted.size) return null;
  // The catalogue search does not itself handle plurals — "Bananas" finds
  // nothing — so it is asked for both what was typed and its singular form.
  const singularised = [...words(name)].join(' ');
  const candidates = [
    ...(searchFoods(name, catalogue, 8) || []),
    ...(searchFoods(singularised, catalogue, 8) || []),
  ];
  const seen = new Set();
  for (const food of candidates) {
    if (seen.has(food.id)) continue;
    seen.add(food.id);
    // A catalogue qualifier after a comma ("Lentils, cooked") describes the
    // same food, so it is not required to appear in what the user typed.
    const head = String(food.name).split(',')[0];
    const foodWords = words(head).filter((word) => word.length > 2);
    if (!foodWords.length) continue;
    // Every meaningful word of the catalogue name must appear in what the user
    // typed. "Milk" does not match "Milk chocolate"; "semi skimmed milk" does
    // match "Semi-skimmed milk", and "bananas" matches "Banana".
    if (foodWords.every((word) => wanted.has(word))) return food;
  }
  return null;
};

const energyShare = (grams, kcalPerGram, kcal) => {
  if (!kcal || !Number.isFinite(grams)) return null;
  return (grams * kcalPerGram) / kcal;
};

/**
 * Nutrition tags, using the UK/EU nutrition-claim thresholds rather than
 * invented ones — "high protein" is a regulated phrase meaning at least 20% of
 * energy from protein, not simply "quite a lot".
 */
export const nutritionTags = (per100 = {}) => {
  const out = [];
  const kcal = Number(per100.kcal) || 0;
  const protein = Number(per100.protein);
  const fibre = Number(per100.fibre);
  const sugar = Number(per100.sugar);
  const satFat = Number(per100.satFat);
  const sodium = Number(per100.sodium);

  const proteinShare = energyShare(protein, 4, kcal);
  if (proteinShare !== null && proteinShare >= 0.2) {
    out.push(tag('high-protein', 'High protein', 'nutrition', 'good', `${protein}g per 100g`));
  } else if (proteinShare !== null && proteinShare >= 0.12) {
    out.push(tag('source-of-protein', 'Source of protein', 'nutrition', 'good', `${protein}g per 100g`));
  }

  if (Number.isFinite(fibre) && fibre >= 6) {
    out.push(tag('high-fibre', 'High fibre', 'nutrition', 'good', `${fibre}g per 100g`));
  } else if (Number.isFinite(fibre) && fibre >= 3) {
    out.push(tag('source-of-fibre', 'Source of fibre', 'nutrition', 'good', `${fibre}g per 100g`));
  }

  // UK front-of-pack "red" thresholds per 100g.
  if (Number.isFinite(sugar) && sugar > 22.5) {
    out.push(tag('high-sugar', 'High sugar', 'nutrition', 'warn', `${sugar}g per 100g`));
  }
  if (Number.isFinite(satFat) && satFat > 5) {
    out.push(tag('high-satfat', 'High saturated fat', 'nutrition', 'warn', `${satFat}g per 100g`));
  }
  if (Number.isFinite(sodium)) {
    const salt = Math.round((sodium * 2.5) / 10) / 100; // mg sodium -> g salt
    if (salt > 1.5) out.push(tag('high-salt', 'High salt', 'nutrition', 'warn', `${salt}g salt per 100g`));
  }
  return out;
};

/**
 * A single A–E letter, in the spirit of Nutri-Score: things to encourage minus
 * things to limit. Deliberately not called Nutri-Score, because it is computed
 * from this app's catalogue rather than certified against the real algorithm.
 */
export const healthScore = (per100 = {}) => {
  const kcal = Number(per100.kcal);
  if (!Number.isFinite(kcal)) return null;
  // Sugar, saturated fat and salt are what push a grade down. Treating an
  // unknown as zero would quietly grade a food we know nothing about better
  // than one we do — so an unknown there means no grade, not a good one.
  const known = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
  if (!known(per100.sugar) || !known(per100.satFat) || !known(per100.sodium)) return null;
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  let points = 0;
  // Limit
  if (kcal > 335) points += 1;
  if (kcal > 500) points += 2;
  if (num(per100.sugar) > 9) points += 1;
  if (num(per100.sugar) > 22.5) points += 2;
  if (num(per100.satFat) > 2) points += 1;
  if (num(per100.satFat) > 5) points += 2;
  const salt = (num(per100.sodium) * 2.5) / 1000;
  if (salt > 0.3) points += 1;
  if (salt > 1.5) points += 2;
  // Encourage
  if (num(per100.fibre) >= 3) points -= 1;
  if (num(per100.fibre) >= 6) points -= 2;
  const proteinShare = energyShare(num(per100.protein), 4, kcal);
  if (proteinShare !== null && proteinShare >= 0.12) points -= 1;
  if (proteinShare !== null && proteinShare >= 0.2) points -= 1;

  const grade = points <= -2 ? 'A' : points <= 0 ? 'B' : points <= 2 ? 'C' : points <= 5 ? 'D' : 'E';
  return { grade, points };
};

const MEAT = /\b(beef|pork|lamb|chicken|turkey|duck|bacon|ham|sausages?|mince|steak|salami|chorizo|pepperoni|gelatin(e)?|prosciutto|pancetta|venison)\b/i;
const FISH = /\b(fish|salmon|tuna|cod|haddock|prawns?|shrimps?|anchov(y|ies)|sardines?|mackerel|crab|lobster|squid|mussels?|oysters?|scallops?)\b/i;
const ANIMAL_NON_MEAT = /\b(milk|cheese|butter|cream|yogh?urt|egg|eggs|honey|ghee|whey|casein|custard|mayonnaise)\b/i;
const PLANT_MARKER = /\b(vegan|plant based|plant-based|dairy free|dairy-free)\b/i;
/**
 * Products that say they are meat-free.
 *
 * This has to be checked before the meat words, because the meat words are
 * exactly what a meat substitute is named after: "Quorn Meat Free Mince"
 * matches "mince", and reading that as "contains meat" gets the answer
 * precisely backwards for the person most likely to be filtering on it.
 */
const MEAT_FREE_MARKER = /\b(meat.free|meat.substitute|vegetarian|veggie|vegan)\b/i;

/**
 * Diet tags read the product name, and the catalogue entry behind it where
 * there is one.
 *
 * The catalogue's own tags are much better evidence than the name: "Cathedral
 * City Mature Cheddar" does not contain the word "cheese", and Nutella's name
 * says nothing about the milk powder in it. Where a food was matched, its
 * curated tags decide; the name is the fallback for everything else.
 *
 * The app already draws a hard line between an allergy and a preference; this
 * is firmly the preference side, and it says "by name" wherever that is all it
 * had, so it is never mistaken for a certification.
 */
export const dietTags = (name, food = null) => {
  const text = String(name || '');
  const out = [];
  const foodTags = new Set(food?.tags || []);
  if (foodTags.has('vegan') || PLANT_MARKER.test(text)) {
    out.push(tag('vegan', 'Vegan (labelled)', 'diet', 'good', 'The product states it.'));
    return out;
  }
  const meatFree = foodTags.has('meat-free') || MEAT_FREE_MARKER.test(text);
  const meat = !meatFree && (foodTags.has('meat') || MEAT.test(text));
  const fish = !meatFree && (foodTags.has('fish') || FISH.test(text));
  const animal = ['dairy', 'cheese', 'egg', 'honey'].some((id) => foodTags.has(id))
    || ANIMAL_NON_MEAT.test(text);
  if (meat) out.push(tag('contains-meat', 'Contains meat', 'diet', 'muted', MATCH_CAVEAT));
  if (fish) out.push(tag('contains-fish', 'Contains fish', 'diet', 'muted', MATCH_CAVEAT));
  if (!meat && !fish && (animal || meatFree)) {
    out.push(tag(
      'vegetarian',
      meatFree ? 'Vegetarian' : 'Vegetarian (by name)',
      'diet',
      'good',
      meatFree ? 'The product states it is meat-free.' : MATCH_CAVEAT,
    ));
  }
  if (!meat && !fish && !animal && !meatFree) {
    // No animal ingredient is *named*. That is not the same as vegan, and the
    // label says only what was actually checked.
    out.push(tag('no-animal-named', 'No animal ingredient named', 'diet', 'good', MATCH_CAVEAT));
  }
  return out;
};

const ULTRA = /\b(ready meal|instant|nuggets?|crisps?|cola|energy drink|pot noodle|microwav\w*|frozen pizza|sausage roll|pop.?tart|cereal bar|milkshake|squash|cordial|processed|reconstituted|smoked flavour|flavoured)\b/i;
const PROCESSED = /\b(bacon|ham|sausages?|salami|chorizo|tinned|canned|cured|smoked|pickled|bread|cheese|yogh?urt|juice|jam|sauce|crackers?|biscuits?|cake)\b/i;
const CULINARY = /\b(oil|butter|sugar|flour|salt|vinegar|syrup|honey)\b/i;

/**
 * A NOVA-shaped estimate, from the catalogue entry where there is one and the
 * product name otherwise.
 *
 * "Estimated" stays in the label because a name is genuinely weak evidence —
 * "tomato soup" says nothing about whether it was made from tomatoes or from
 * concentrate and starch. A branded packaged grocery, though, is by definition
 * a manufactured product, so it never reads as minimally processed however
 * innocent its name looks.
 */
export const processingTag = (name, food = null) => {
  const text = String(name || '');
  const foodTags = new Set(food?.tags || []);
  const branded = food?.source === 'branded';
  const why = branded ? 'A packaged branded product.' : 'Estimated from the product name.';
  if (ULTRA.test(text) || (branded && (foodTags.has('treat') || foodTags.has('confectionery')))) {
    return tag('ultra-processed', 'Ultra-processed (est.)', 'processing', 'warn', why);
  }
  if (PROCESSED.test(text)) return tag('processed', 'Processed (est.)', 'processing', 'muted', why);
  if (CULINARY.test(text)) return tag('culinary-ingredient', 'Culinary ingredient', 'processing', 'muted', why);
  // A branded pack is manufactured even where the name gives nothing away.
  if (branded) return tag('processed', 'Processed (est.)', 'processing', 'muted', why);
  return tag('minimally-processed', 'Minimally processed (est.)', 'processing', 'good', why);
};

/**
 * Allergens, stated only in the direction that is safe to be wrong in.
 *
 * Matching a product *name* is much weaker evidence than matching an
 * ingredients list, so this can only ever raise "may contain". It never says
 * an item is free of anything, and it only raises allergens the user has
 * actually declared, so the list is a warning rather than noise.
 */
export const allergenTags = (name, declared = []) => {
  const text = String(name || '');
  const wanted = new Set(declared);
  return ALLERGENS
    .filter((allergen) => wanted.has(allergen.id) && allergen.match.test(text))
    .map((allergen) => tag(
      `allergen:${allergen.id}`,
      `May contain ${allergen.label.toLowerCase()}`,
      'allergen',
      'danger',
      MATCH_CAVEAT,
    ));
};

/** Pack size in grams or millilitres, so a price can become a price per kg. */
export const packGrams = (packSize) => {
  const raw = String(packSize || '').toLowerCase().replace(/\s+/g, '');
  const multi = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(kg|g|l|ml|cl)$/);
  const single = raw.match(/^(\d+(?:\.\d+)?)(kg|g|l|ml|cl)$/);
  const unitGrams = { kg: 1000, g: 1, l: 1000, ml: 1, cl: 10 };
  if (multi) return Number(multi[1]) * Number(multi[2]) * unitGrams[multi[3]];
  if (single) return Number(single[1]) * unitGrams[single[2]];
  return null;
};

/** £ per kg for one scraped row, when the pack size is readable. */
export const pricePerKg = (row) => {
  const grams = packGrams(row?.packSize);
  if (!grams || !Number.isFinite(row?.price) || grams <= 0) return null;
  return Math.round((row.price / grams) * 1000 * 100) / 100;
};

/**
 * Value tags, from this item's own prices — never from the price alone.
 *
 * "Cheap" on its own says nothing useful; a shop being 20% under the other
 * shops for the same product does. Anything comparing across products would be
 * comparing a bag of rice with a jar of saffron.
 */
export const valueTags = (perRetailer = [], history = null) => {
  const out = [];
  const prices = perRetailer.map((row) => row.price).filter((price) => Number.isFinite(price));
  if (prices.length >= 2) {
    const cheapest = Math.min(...prices);
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    if (mean > 0 && (mean - cheapest) / mean >= 0.15) {
      const pct = Math.round(((mean - cheapest) / mean) * 100);
      out.push(tag('good-value', 'Good value somewhere', 'value', 'good', `Cheapest shop is ${pct}% under the average.`));
    }
  }
  const perKg = perRetailer.map(pricePerKg).filter((value) => Number.isFinite(value));
  if (perKg.length) {
    const best = Math.min(...perKg);
    out.push(tag('per-kg', `From £${best.toFixed(2)}/kg`, 'value', 'muted', 'Cheapest readable pack size across the shops.'));
  }
  const points = history?.points || [];
  if (points.length >= 2 && prices.length) {
    const past = points.slice(0, -1).map((point) => point.best);
    const average = past.reduce((sum, value) => sum + value, 0) / past.length;
    const now = Math.min(...prices);
    if (average > 0 && (average - now) / average >= 0.1) {
      out.push(tag('cheaper-than-usual', 'Cheaper than usual', 'value', 'good', `Below its ${past.length}-check average.`));
    } else if (average > 0 && (now - average) / average >= 0.1) {
      out.push(tag('dearer-than-usual', 'Dearer than usual', 'value', 'warn', `Above its ${past.length}-check average.`));
    }
  }
  return out;
};

/**
 * Shops that are pricing this item now but were not last time.
 *
 * Genuinely "new to that shop" as far as this app can see — which is a claim
 * about our own observations, not about the shop's range, so the label says
 * "newly listed" rather than "new product".
 */
export const availabilityTags = (perRetailer = [], history = null) => {
  const points = history?.points || [];
  if (points.length < 2) return [];
  const previous = new Set(Object.keys(points.at(-2)?.shops || {}));
  if (!previous.size) return [];
  const fresh = perRetailer
    .map((row) => row.retailerId)
    .filter((id) => id && !previous.has(id));
  if (!fresh.length) return [];
  const names = perRetailer
    .filter((row) => fresh.includes(row.retailerId))
    .map((row) => row.retailer);
  return [tag('newly-listed', `New at ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`, 'availability', 'accent', 'Priced now, but not in the previous check.')];
};

/** How often this has been bought before, from recorded shops. */
export const popularityTags = (name, purchaseCount = 0) => {
  void name;
  if (purchaseCount >= 5) return [tag('regular-buy', 'You buy this often', 'popularity', 'accent', `${purchaseCount} recorded shops.`)];
  if (purchaseCount >= 2) return [tag('bought-before', 'Bought before', 'popularity', 'muted', `${purchaseCount} recorded shops.`)];
  return [];
};

/**
 * Branded products that could be what a generic list item means.
 *
 * "Baked beans" is a bad thing to ask a retailer for: the search page comes
 * back as a wall of results the scraper cannot confidently price, which is one
 * of the commonest reasons an item ends up with no price at all. "Heinz Baked
 * Beans" comes back as a product. So where a generic item has named products
 * behind it, they are offered as a swap.
 *
 * Matching is the other way round from `matchFood`: there, the catalogue name
 * had to be covered by what the user typed; here the user's generic words have
 * to be covered by the branded name, so "beans" reaches "Heinz Baked Beans"
 * without "Heinz" reaching everything.
 */
export const brandedAlternatives = (name, { limit = 4, catalogue = BRANDED_FOODS } = {}) => {
  const typed = words(name).filter((word) => word.length > 2);
  if (!typed.length) return [];
  return catalogue
    .filter((food) => {
      const brandWords = new Set(words(food.name));
      // Already a specific product? Then there is nothing to swap it for.
      if (typed.every((word) => brandWords.has(word)) && brandWords.size <= typed.length) return false;
      return typed.every((word) => brandWords.has(word));
    })
    .slice(0, limit)
    .map((food) => ({ id: food.id, name: food.name, brand: food.brand, emoji: food.emoji }));
};

/**
 * Everything known about one item, as one flat tag list plus the pieces the
 * sort functions need.
 */
export const tagsForItem = ({
  name, perRetailer = [], history = null, allergens = [], purchaseCount = 0, catalogue = undefined,
} = {}) => {
  const food = matchFood(name, catalogue);
  const per100 = food?.per100 || null;
  const health = per100 ? healthScore(per100) : null;
  const tags = [
    ...(per100 ? nutritionTags(per100) : []),
    ...dietTags(name, food),
    processingTag(name, food),
    ...allergenTags(name, allergens),
    ...valueTags(perRetailer, history),
    ...availabilityTags(perRetailer, history),
    ...popularityTags(name, purchaseCount),
  ];
  if (health) {
    tags.unshift(tag(
      `health:${health.grade}`,
      `Health ${health.grade}`,
      'health',
      health.grade === 'A' || health.grade === 'B' ? 'good' : health.grade === 'C' ? 'muted' : 'warn',
      `Estimated from ${food.name}. Not a certified Nutri-Score.`,
    ));
  }
  const perKg = perRetailer.map(pricePerKg).filter((value) => Number.isFinite(value));
  return {
    name,
    tags,
    matchedFood: food?.name || null,
    health,
    bestPerKg: perKg.length ? Math.min(...perKg) : null,
    bestPrice: perRetailer.length
      ? Math.min(...perRetailer.map((row) => row.price).filter(Number.isFinite))
      : null,
    purchaseCount,
  };
};
