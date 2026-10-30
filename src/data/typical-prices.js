/**
 * What a list row typically costs in a UK supermarket, before anyone has
 * paid for it.
 *
 * The basket used to sum only the prices on rows — typed in or carried from a
 * receipt — so a list built from the plan came to £0.00. This is the fallback:
 * an own-brand, mid-range price (Tesco / Sainsbury's / Asda shelf prices,
 * autumn 2026) for the pack people usually buy. It is always shown as
 * "typical", never as what a shop charges today; a receipt, a community
 * observation or a live check outranks it.
 *
 * `each: true` prices one loose item ("3 lemons" is three); otherwise the price
 * is for one pack, and a weighed need buys as many packs as it takes.
 *
 * Two things keep it from going stale or being wrong for the person reading it:
 *
 *   - A monthly refresh (`npm run refresh:typical-prices`) re-prices each row
 *     from a live shelf and writes typical-prices.refreshed.js. A refreshed
 *     price under three months old replaces the hand-written one.
 *   - The shop index (shop-index.js) moves the mid-range figure to the shop
 *     the person actually uses, so an Aldi shopper is not quoted Tesco prices.
 */

import { REFRESHED_TYPICAL_PRICES } from './typical-prices.refreshed.js';
import { shopIndexFor } from './shop-index.js';

/** [pattern, £ price, pack label, options] — specific before general. */
export const PRICES = [
  // Names whose first word would mislead the rules below
  [/beef tomato/, 0.6, 'each', { each: true }],
  [/butter beans/, 0.65, '400 g tin'],
  [/egg noodles|rice noodles/, 0.95, '300 g'],
  [/tuna steak/, 3.5, '2 steaks (250 g)'],
  [/breadcrumbs|panko/, 1.0, '200 g'],
  [/toasted almonds|flaked almonds/, 2.0, '200 g'],
  [/pineapple/, 1.2, 'each', { each: true }],
  [/grapefruit/, 0.6, 'each', { each: true }],
  [/bread flour|plain flour|self[- ]raising|wholemeal flour/, 1.0, '1.5 kg'],
  [/mince pies?/, 1.5, '6'],
  [/buttermilk/, 0.9, '284 ml'],
  [/coconut cream/, 1.0, '200 ml'],
  [/rice milk/, 1.4, '1 l'],

  // Packaging decides first, as in the icon rules
  [/chopped tomatoes|plum tomatoes|tinned tomatoes/, 0.45, '400 g tin'],
  [/passata/, 0.65, '500 g'],
  [/coconut milk/, 1.0, '400 ml tin'],
  [/baked beans/, 0.45, '415 g tin'],
  [/tomato pur[eé]e/, 0.6, '200 g tube'],
  [/sweetcorn/, 0.6, '198 g tin'],
  [/tinned tuna|tuna chunks|tin of tuna/, 0.85, '145 g tin'],
  [/oat milk|almond milk|soya? milk|coconut drink/, 1.4, '1 l'],
  [/juice/, 1.1, '1 l'],
  [/peanut butter|almond butter|nut butter/, 1.75, '340 g jar'],
  [/honey/, 1.8, '340 g jar'],
  [/\bjam\b|marmalade/, 0.9, '454 g jar'],
  [/pesto/, 1.45, '190 g jar'],
  [/curry paste|curry roux|harissa|chipotle paste|miso/, 1.5, 'jar'],
  [/tahini/, 2.2, '300 g jar'],
  [/mayo|mayonnaise/, 1.4, '400 ml'],
  [/ketchup/, 1.2, '460 g'],
  [/mustard|chutney|pickle|relish|capers|olives|gherkins/, 1.1, 'jar'],
  [/hummus|houmous/, 0.9, '200 g'],
  [/salsa|dip\b/, 0.95, '300 g'],
  [/stock|bouillon|gravy/, 0.85, '10 cubes'],
  [/curry powder|garam masala|paprika|cumin|cinnamon|turmeric|oregano|spice|seasoning|chilli flakes|chili flakes|dried herbs|nutmeg|mixed herbs|bay leaves/, 1.0, 'jar'],
  [/black pepper|peppercorns/, 1.2, 'grinder'],
  [/\bsalt\b/, 0.65, '750 g'],
  [/olive oil/, 4.5, '500 ml'],
  [/\boil\b/, 1.8, '1 l'],
  [/vinegar/, 0.8, '350 ml'],
  [/soy sauce|fish sauce|sriracha|hot sauce|teriyaki|worcestershire/, 1.1, 'bottle'],
  [/maple syrup|golden syrup/, 2.5, 'bottle'],
  [/marinade|glaze|chimichurri|dressing|sauce/, 1.2, 'jar'],

  // Dairy and eggs
  [/greek yog(h)?urt|natural yog(h)?urt|yog(h)?urt|skyr|kefir/, 1.3, '500 g'],
  [/butter\b|margarine|\bspread\b/, 2.2, '250 g'],
  [/cream cheese/, 1.1, '180 g'],
  [/cheddar|\bcheese\b/, 3.7, '400 g'],
  [/mozzarella|burrata/, 0.75, '125 g'],
  [/feta/, 1.65, '200 g'],
  [/halloumi/, 2.5, '225 g'],
  [/parmesan|grana padano|pecorino/, 2.4, '100 g'],
  [/paneer/, 2.5, '226 g'],
  [/ricotta|mascarpone|cottage cheese/, 1.2, '250 g'],
  [/\beggs?\b/, 0.31, 'each', { each: true }],
  [/double cream|single cream|whipping cream|soured cream|sour cream|creme fraiche|crème fraîche/, 1.1, '300 ml'],
  [/milk/, 1.65, '4 pints'],

  // Meat and fish
  [/bacon|pancetta|lardons/, 2.0, '300 g'],
  [/sausages?/, 2.0, '8 (454 g)'],
  [/chorizo|salami|pepperoni/, 2.0, '200 g'],
  [/\bham\b|prosciutto/, 1.3, '125 g'],
  [/fish fingers|fish ?cakes/, 2.0, 'pack'],
  [/salmon/, 3.5, '2 fillets (240 g)'],
  [/\bcod\b|haddock|basa|pollock|hake|white fish|sea ?bass|sea bream/, 3.75, '2 fillets (260 g)'],
  [/tuna/, 3.5, '2 steaks (250 g)'],
  [/mackerel|sardines|trout|kippers/, 2.2, 'pack'],
  [/prawns?|shrimps?/, 3.0, '225 g'],
  [/mussels|squid/, 3.5, 'pack'],
  [/tofu/, 1.5, '280 g'],
  [/tempeh|seitan/, 2.5, '200 g'],
  [/quorn/, 2.5, '300 g'],
  [/turkey mince/, 3.5, '500 g'],
  [/chicken thighs?|thighs?\b|drumsticks?|wings?\b/, 3.75, '1 kg'],
  [/whole chicken/, 4.5, '1.4 kg'],
  [/chicken|turkey/, 4.5, '650 g'],
  [/lamb mince/, 4.5, '500 g'],
  [/lamb/, 4.5, '2 steaks (300 g)'],
  [/pork|gammon/, 3.5, '500 g'],
  [/beef mince|\bmince\b|meatballs/, 3.2, '500 g'],
  [/steak|beef/, 4.5, '2 steaks (450 g)'],
  [/duck/, 5.0, '2 breasts'],

  // Bread and bakery
  [/bagels?/, 1.2, '5'],
  [/croissants?|pain au/, 1.5, '4'],
  [/tortillas?|wraps?\b/, 1.0, '8'],
  [/pitta|pita/, 0.65, '6'],
  [/naan|flatbreads?/, 0.95, '2'],
  [/crumpets?/, 0.65, '6'],
  [/burger buns?|\bbuns?\b|\brolls?\b|brioche/, 0.95, '6'],
  [/sourdough|ciabatta|focaccia|baguette/, 1.6, 'loaf'],
  [/bread|loaf|toast/, 0.85, '800 g loaf'],

  // Dry goods
  [/basmati|jasmine rice|arborio|risotto rice|sushi rice/, 1.95, '1 kg'],
  [/rice noodles|egg noodles|noodles|ramen|udon/, 0.95, '300 g'],
  [/\brice\b/, 1.2, '1 kg'],
  [/gnocchi/, 1.0, '500 g'],
  [/lasagne sheets|pasta|spaghetti|penne|fusilli|linguine|macaroni|tagliatelle|pappardelle|rigatoni|orzo|farfalle/, 0.75, '500 g'],
  [/couscous/, 1.0, '500 g'],
  [/quinoa/, 2.0, '300 g'],
  [/bulgur|bulgar|barley|freekeh|mixed grains|grains pouch/, 1.4, '500 g'],
  [/polenta|semolina/, 1.5, '500 g'],
  [/whey|protein powder/, 12.0, '1 kg'],
  [/pancake mix/, 1.5, 'pack'],
  [/granola|muesli/, 1.8, '500 g'],
  [/cereal|cornflakes|weetabix|bran flakes|shreddies|rice krispies/, 1.8, 'box'],
  [/\boats?\b|porridge/, 0.9, '1 kg'],
  [/cornflour/, 0.8, '250 g'],
  [/flour/, 0.8, '1.5 kg'],
  [/sugar/, 1.15, '1 kg'],
  [/baking powder|bicarb|yeast|cocoa/, 1.0, 'tub'],
  [/lentils?/, 1.4, '500 g'],
  [/chickpeas?|kidney beans|black beans|butter beans|cannellini|borlotti|mixed beans|pinto/, 0.65, '400 g tin'],

  // Veg
  [/spring onions?/, 0.55, 'bunch'],
  [/red onions?/, 0.2, 'each', { each: true }],
  [/onions?|shallots?/, 0.15, 'each', { each: true }],
  [/garlic/, 0.35, 'bulb', { each: true }],
  [/ginger/, 0.4, 'piece', { each: true }],
  [/sweet potato/, 0.4, 'each', { each: true }],
  [/new potatoes|baby potatoes/, 1.0, '1 kg'],
  [/potato|potatoes/, 1.25, '2 kg'],
  [/cherry tomatoes/, 0.85, '250 g'],
  [/tomato|tomatoes/, 0.85, '6'],
  [/chill?ies|chill?i\b|chili|jalape/, 0.55, 'pack'],
  [/peppers?\b/, 0.5, 'each', { each: true }],
  [/mushrooms?/, 1.05, '250 g'],
  [/broccoli|tenderstem/, 0.69, 'head', { each: true }],
  [/cauliflower/, 0.95, 'each', { each: true }],
  [/spinach/, 1.1, '240 g'],
  [/kale|cavolo/, 1.0, '200 g'],
  [/red cabbage|cabbage/, 0.75, 'each', { each: true }],
  [/lettuce|little gem|iceberg|romaine/, 0.65, 'each', { each: true }],
  [/rocket|salad|watercress|leaves/, 0.8, 'bag'],
  [/cucumber/, 0.75, 'each', { each: true }],
  [/courgettes?/, 0.4, 'each', { each: true }],
  [/aubergines?/, 0.85, 'each', { each: true }],
  [/avocados?/, 0.75, 'each', { each: true }],
  [/carrots?/, 0.55, '1 kg'],
  [/parsnips?|swede|turnips?|beetroot/, 0.8, 'pack'],
  [/butternut|squash|pumpkin/, 1.0, 'each', { each: true }],
  [/leeks?/, 0.55, 'each', { each: true }],
  [/celery/, 0.65, 'head'],
  [/asparagus/, 1.8, '250 g'],
  [/green beans|runner beans|mangetout|sugar ?snaps?|edamame/, 1.0, '220 g'],
  [/frozen peas|garden peas|\bpeas\b/, 1.3, '1 kg frozen'],
  [/stir-?fry veg|frozen veg|mixed veg/, 1.0, 'bag'],
  [/coriander|parsley|basil|mint|dill|thyme|rosemary|sage|chives|fresh herbs|herbs/, 0.85, '30 g'],

  // Fruit
  [/frozen berries|frozen fruit/, 2.2, '500 g frozen'],
  [/lemons?\b/, 0.3, 'each', { each: true }],
  [/limes?\b/, 0.25, 'each', { each: true }],
  [/bananas?/, 0.15, 'each', { each: true }],
  [/apples?\b/, 0.3, 'each', { each: true }],
  [/pears?\b/, 0.3, 'each', { each: true }],
  [/oranges?|clementines?|satsumas?|easy peelers?|mandarins?/, 0.25, 'each', { each: true }],
  [/mangos?|mangoes/, 0.9, 'each', { each: true }],
  [/peach|nectarines?|plums?/, 0.35, 'each', { each: true }],
  [/strawberr|raspberr|blueberr|blackberr|berries|cherries/, 1.8, 'punnet'],
  [/grapes?/, 1.6, '500 g'],
  [/pineapple|melon/, 1.2, 'each', { each: true }],
  [/rhubarb/, 1.5, '400 g'],
  [/raisins|sultanas|dates|figs|dried fruit|apricots/, 1.3, '250 g'],
  [/coconut flakes|desiccated/, 1.1, '200 g'],
  [/almonds|walnuts|cashews|pecans|hazelnuts|pistachios|peanuts|\bnuts\b/, 2.0, '200 g'],
  [/seeds/, 1.6, '200 g'],

  // Snacks, drinks, household
  [/crisps|tortilla chips|popcorn/, 1.6, 'multipack'],
  [/chocolate/, 1.2, '100 g bar'],
  [/biscuits?|cookies?|crackers?|oatcakes?|rice cakes?/, 0.9, 'pack'],
  [/ice cream/, 2.0, '1 l'],
  [/\bcakes?\b|brownies?|muffins?/, 2.0, 'pack'],
  [/coffee/, 3.5, '200 g'],
  [/\btea\b|teabags/, 1.6, '80 bags'],
  [/sparkling water|still water|\bwater\b/, 1.2, '6 × 500 ml'],
  [/cola|lemonade|fizzy|soda|tonic/, 1.5, '2 l'],
  [/beer|lager|cider|\bale\b/, 4.5, '4 × 440 ml'],
  [/wine|prosecco/, 6.5, '75 cl'],
  [/toilet (roll|paper)/, 4.5, '9 rolls'],
  [/kitchen roll/, 2.0, '2 rolls'],
  [/washing up/, 1.0, '450 ml'],
  [/detergent|laundry|washing (powder|liquid|capsules)/, 6.0, 'pack'],
  [/bin bags?/, 1.8, '20'],
  [/foil|cling film|baking paper/, 1.5, 'roll'],
];

const UNIT_GRAMS = {
  g: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, litres: 1000, cl: 10, pint: 568, pints: 568, pt: 568,
};
const COUNT_WORDS = /^(x|each|whole|large|medium|small|bulbs?|heads?|pieces?|cloves?|bunch(es)?|packs?|tins?|cans?|jars?|bottles?|bags?|loaf|loaves|punnets?|fillets?|steaks?|breasts?|thighs?|slices?|rolls?|stalks?|sticks?)?$/i;

/** The grams/ml in a pack label like "500 g" or "2 fillets (240 g)". */
export const packAmount = (pack) => {
  const match = String(pack).match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl|pints?|pt)\b/i);
  return match ? Number(match[1]) * UNIT_GRAMS[match[2].toLowerCase()] : null;
};

/** How many packs (or loose items) a row's quantity asks for. Never fewer than one. */
const unitsFor = (qty, pack, each) => {
  const match = String(qty || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return 1;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].trim().toLowerCase();
  if (!(amount > 0)) return 1;
  const grams = UNIT_GRAMS[unit];
  if (grams) {
    const size = packAmount(pack);
    // A weighed need: as many packs as it takes. Loose items bought by weight
    // ("500 g onions") are about five to the pound — one pack price per 150 g.
    if (size) return Math.max(1, Math.ceil((amount * grams) / size));
    return each ? Math.max(1, Math.round((amount * grams) / 150)) : 1;
  }
  // "2", "3 large", "2 tins": a count. Capped so a mistyped 200 can't
  // produce a four-figure guess.
  if (COUNT_WORDS.test(unit)) return Math.min(Math.ceil(amount), each ? 24 : 6);
  return 1;
};

/** What one shop listing contains: how many items, and how many grams/ml in all. */
export const listingContents = (packSize, name) => {
  const text = `${packSize || ''} ${name || ''}`.toLowerCase();
  const multi = text.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (multi) {
    const each = Number(multi[2]) * UNIT_GRAMS[multi[3]];
    return { count: Number(multi[1]), grams: Number(multi[1]) * each };
  }
  const countMatch = text.match(/\b(\d{1,3})\s*(?:pk|pack|x\b|eggs?|rolls?|pieces?|pcs|bagels?|wraps?|tins?|cans?|bottles?|bulbs?|fillets?|steaks?|breasts?|burgers?|sausages?)\b/)
    || text.match(/\bx\s?(\d{1,3})\b/);
  const count = countMatch ? Number(countMatch[1]) : null;
  const grams = packAmount(text);
  return { count: count > 0 ? count : null, grams: grams > 0 ? grams : null };
};

/**
 * How many of a shop's listing a row needs, given what that listing holds.
 *
 * A live price is for one product as the shop sells it — a box of six eggs,
 * a 4 × 415 g multipack, a loose lemon. Multiplying it by the row's count
 * ("6 eggs" × £1.85 a box) prices six boxes. So the need is measured against
 * the listing's own contents; where the listing does not say what is in it,
 * a ticket several times the typical single price is read as a pack of
 * roughly that many, rather than as one very dear item.
 *
 * @param {string} qty the row's quantity
 * @param {{ price: number, packSize?: string|null, name?: string|null }} listing
 * @param {string} [itemName] the row's name, to find the typical single price
 * @returns {number} packs to buy, never fewer than one
 */
export function packsToBuy(qty, listing = {}, itemName = '') {
  const match = String(qty || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return 1;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].trim().toLowerCase();
  if (!(amount > 0)) return 1;
  const typical = typicalPriceFor(itemName);
  const each = Boolean(typical?.each);
  const holds = listingContents(listing.packSize, listing.name);
  const gramsPerUnit = UNIT_GRAMS[unit];
  if (gramsPerUnit) {
    const needGrams = amount * gramsPerUnit;
    if (holds.grams) return Math.max(1, Math.ceil(needGrams / holds.grams));
    return 1;
  }
  if (!COUNT_WORDS.test(unit)) return 1;
  const needCount = Math.ceil(amount);
  if (holds.count) return Math.max(1, Math.ceil(needCount / holds.count));
  // Loose produce sold by weight ("onions 1 kg" for "3 onions").
  if (each && holds.grams) return Math.max(1, Math.ceil((needCount * 150) / holds.grams));
  if (each && typical.unit > 0 && listing.price > 0) {
    const implied = Math.min(24, Math.max(1, Math.round(listing.price / typical.unit)));
    return Math.max(1, Math.ceil(needCount / implied));
  }
  // A single tin, jar or bag: "2 tins" buys two.
  return Math.min(needCount, 6);
}

/**
 * A typical price for a row, or null when the name is not one this table
 * knows.
 *
 * @param {string} name
 * @param {string} [qty] the row's quantity, e.g. "2", "500 g", "1 jar"
 * @returns {{ price: number, unit: number, units: number, pack: string, each: boolean } | null}
 */
export function typicalPriceFor(name, qty = '', {
  shop = null, loyalty = false, now = Date.now(), refreshed = REFRESHED_TYPICAL_PRICES,
} = {}) {
  const text = String(name || '').toLowerCase().trim();
  if (!text) return null;
  const hit = PRICES.find(([pattern]) => pattern.test(text));
  if (!hit) return null;
  const [pattern, written, pack, options = {}] = hit;
  const fresh = refreshedBaseline(refreshed, pattern.source, now);
  const baseline = fresh?.price ?? written;
  const index = shop ? shopIndexFor(shop, { loyalty }) : null;
  const unit = Math.round(baseline * (index?.factor ?? 1) * 100) / 100;
  const units = unitsFor(qty, pack, options.each);
  return {
    price: Math.round(unit * units * 100) / 100,
    unit,
    units,
    pack,
    each: Boolean(options.each),
    // Which shop the figure was moved to, if any, and when it was last
    // checked against a real shelf — so the label can say both.
    shop: index?.name || null,
    checkedAt: fresh ? refreshed.generatedAt : null,
  };
}

/** Refreshed prices go stale too: older than this, the written figure stands. */
const REFRESH_MAX_AGE_MS = 92 * 86400000;

const refreshedBaseline = (refreshed, key, now) => {
  const stamp = Date.parse(refreshed?.generatedAt || '');
  if (!Number.isFinite(stamp) || now - stamp > REFRESH_MAX_AGE_MS) return null;
  const row = refreshed.prices?.[key];
  return row && row.price > 0 ? row : null;
};
