/**
 * What a package of something actually contains.
 *
 * "1 tin" is only a useful number if you know what a tin holds. For most of the
 * everyday store cupboard that is not a guess: a tin of chopped tomatoes is
 * 400 g and a tin of coconut milk is 400 ml, because that is the size they are
 * sold in. Those two are also the reason this table exists at all — the old
 * code normalised every package to grams, so a tin of coconut milk became
 * "400 g" and then refused to match a recipe asking for 400 ml.
 *
 * Two tiers, and the difference is reported rather than hidden:
 *  - INGREDIENT_PACKAGES — this ingredient, in this package, really is this
 *    size. Treated as exact.
 *  - GENERIC_PACKAGES — a fallback for "1 jar" of something we have no entry
 *    for. A rough everyday average. Always reported as approximate so nothing
 *    downstream can present it as a measurement.
 *
 * Sizes are UK retail. `dim` is 'mass' (grams), 'volume' (millilitres) or
 * 'count' (a box of 6 eggs is 6 eggs, not 6 grams).
 */

/**
 * Fallbacks for packages we have no per-ingredient entry for. Approximate,
 * except where the size is genuinely standardised: a UK tin is 400 g whatever
 * is in it, so `standard` marks the handful of packages that can be treated as
 * a fact rather than an average.
 */
export const GENERIC_PACKAGES = {
  tin: { amount: 400, dim: 'mass', standard: true },
  can: { amount: 400, dim: 'mass', standard: true },
  jar: { amount: 300, dim: 'mass' },
  carton: { amount: 200, dim: 'volume' },
  pouch: { amount: 250, dim: 'mass' },
  tub: { amount: 400, dim: 'mass' },
  bottle: { amount: 500, dim: 'volume' },
  bag: { amount: 300, dim: 'mass' },
  packet: { amount: 250, dim: 'mass' },
  pack: { amount: 250, dim: 'mass' },
  sachet: { amount: 30, dim: 'mass' },
  block: { amount: 250, dim: 'mass' },
  bar: { amount: 100, dim: 'mass' },
  square: { amount: 10, dim: 'mass' },
  nest: { amount: 60, dim: 'mass' },
  scoop: { amount: 30, dim: 'mass' },
  punnet: { amount: 250, dim: 'mass' },
  stock_cube: { amount: 10, dim: 'mass' },
};

/**
 * Canonical ingredient name (as produced by `canonicalName`) → package sizes we
 * are confident about. These are the sizes UK supermarkets actually sell.
 */
export const INGREDIENT_PACKAGES = {
  'chopped tomatoes': { tin: { amount: 400, dim: 'mass' }, can: { amount: 400, dim: 'mass' } },
  'cherry tomatoes': { punnet: { amount: 250, dim: 'mass' }, pack: { amount: 250, dim: 'mass' } },
  passata: { carton: { amount: 500, dim: 'volume' }, bottle: { amount: 690, dim: 'volume' } },
  'tomato puree': { tube: { amount: 200, dim: 'mass' }, tin: { amount: 140, dim: 'mass' } },
  'coconut milk': { tin: { amount: 400, dim: 'volume' }, can: { amount: 400, dim: 'volume' } },
  chickpeas: { tin: { amount: 400, dim: 'mass' }, can: { amount: 400, dim: 'mass' } },
  'kidney beans': { tin: { amount: 400, dim: 'mass' }, can: { amount: 400, dim: 'mass' } },
  'mixed beans': { tin: { amount: 400, dim: 'mass' }, can: { amount: 400, dim: 'mass' } },
  'cannellini beans': { tin: { amount: 400, dim: 'mass' }, can: { amount: 400, dim: 'mass' } },
  lentils: { tin: { amount: 400, dim: 'mass' }, bag: { amount: 500, dim: 'mass' } },
  sweetcorn: { tin: { amount: 340, dim: 'mass' }, can: { amount: 340, dim: 'mass' } },
  'olive oil': { bottle: { amount: 500, dim: 'volume' } },
  'vegetable oil': { bottle: { amount: 1000, dim: 'volume' } },
  'rapeseed oil': { bottle: { amount: 1000, dim: 'volume' } },
  'sesame oil': { bottle: { amount: 150, dim: 'volume' } },
  'soy sauce': { bottle: { amount: 150, dim: 'volume' } },
  sriracha: { bottle: { amount: 250, dim: 'volume' } },
  'maple syrup': { bottle: { amount: 250, dim: 'volume' } },
  honey: { jar: { amount: 340, dim: 'mass' } },
  'peanut butter': { jar: { amount: 340, dim: 'mass' } },
  'almond butter': { jar: { amount: 170, dim: 'mass' } },
  tahini: { jar: { amount: 270, dim: 'mass' } },
  hummus: { tub: { amount: 200, dim: 'mass' } },
  'curry paste': { jar: { amount: 180, dim: 'mass' } },
  'greek yogurt': { tub: { amount: 500, dim: 'mass' }, pot: { amount: 150, dim: 'mass' } },
  'coconut yogurt': { tub: { amount: 350, dim: 'mass' } },
  'soured cream': { tub: { amount: 300, dim: 'mass' } },
  'crème fraîche': { tub: { amount: 300, dim: 'mass' } },
  mascarpone: { tub: { amount: 250, dim: 'mass' } },
  'semi-skimmed milk': { carton: { amount: 2272, dim: 'volume' }, bottle: { amount: 2272, dim: 'volume' } },
  butter: { block: { amount: 250, dim: 'mass' }, pack: { amount: 250, dim: 'mass' } },
  cheddar: { block: { amount: 400, dim: 'mass' } },
  'grated cheese': { bag: { amount: 250, dim: 'mass' } },
  feta: { block: { amount: 200, dim: 'mass' }, pack: { amount: 200, dim: 'mass' } },
  halloumi: { block: { amount: 225, dim: 'mass' }, pack: { amount: 225, dim: 'mass' } },
  mozzarella: { ball: { amount: 125, dim: 'mass' }, pack: { amount: 125, dim: 'mass' } },
  parmesan: { block: { amount: 200, dim: 'mass' } },
  'firm tofu': { block: { amount: 280, dim: 'mass' }, pack: { amount: 280, dim: 'mass' } },
  tempeh: { block: { amount: 200, dim: 'mass' }, pack: { amount: 200, dim: 'mass' } },
  eggs: { box: { amount: 6, dim: 'count' }, pack: { amount: 6, dim: 'count' } },
  'chicken breast': { pack: { amount: 300, dim: 'mass' } },
  'chicken thighs': { pack: { amount: 500, dim: 'mass' } },
  'beef mince': { pack: { amount: 500, dim: 'mass' } },
  'chicken mince': { pack: { amount: 500, dim: 'mass' } },
  'turkey mince': { pack: { amount: 500, dim: 'mass' } },
  'salmon fillets': { pack: { amount: 240, dim: 'mass' } },
  'cod fillets': { pack: { amount: 240, dim: 'mass' } },
  prawns: { pack: { amount: 180, dim: 'mass' } },
  pasta: { bag: { amount: 500, dim: 'mass' }, pack: { amount: 500, dim: 'mass' } },
  rice: { bag: { amount: 1000, dim: 'mass' }, pack: { amount: 1000, dim: 'mass' } },
  'brown rice': { bag: { amount: 1000, dim: 'mass' } },
  oats: { bag: { amount: 1000, dim: 'mass' } },
  flour: { bag: { amount: 1500, dim: 'mass' } },
  sugar: { bag: { amount: 1000, dim: 'mass' } },
  couscous: { bag: { amount: 500, dim: 'mass' } },
  quinoa: { bag: { amount: 500, dim: 'mass' } },
  'mixed grains pouch': { pouch: { amount: 250, dim: 'mass' } },
  'rice noodles': { nest: { amount: 60, dim: 'mass' }, pack: { amount: 250, dim: 'mass' } },
  'frozen peas': { bag: { amount: 1000, dim: 'mass' } },
  'mixed veg': { bag: { amount: 1000, dim: 'mass' } },
  spinach: { bag: { amount: 200, dim: 'mass' } },
  'stir-fry veg': { pack: { amount: 300, dim: 'mass' } },
  'frozen berries': { bag: { amount: 500, dim: 'mass' } },
  'dark chocolate': { bar: { amount: 100, dim: 'mass' }, square: { amount: 10, dim: 'mass' } },
  tortillas: { pack: { amount: 8, dim: 'count' } },
  'crusty bread': { loaf: { amount: 800, dim: 'mass' } },
  'vegetable stock': { cube: { amount: 500, dim: 'volume' }, pot: { amount: 500, dim: 'volume' } },
  'chicken stock': { cube: { amount: 500, dim: 'volume' }, pot: { amount: 500, dim: 'volume' } },
  'beef stock': { cube: { amount: 500, dim: 'volume' }, pot: { amount: 500, dim: 'volume' } },
  garlic: { bulb: { amount: 11, dim: 'count' } },
  'protein powder': { scoop: { amount: 30, dim: 'mass' }, tub: { amount: 900, dim: 'mass' } },
};

/**
 * What one `unit` of `ingredient` holds.
 *
 * Returns `{ amount, dim, source }` where source is 'ingredient' (a size we are
 * confident about) or 'generic' (an everyday average, to be treated as
 * approximate), or null when we have no honest basis for a number at all.
 */
export const packageSize = (unit, ingredient = '') => {
  const key = String(unit || '').toLowerCase();
  if (!key) return null;
  const forIngredient = INGREDIENT_PACKAGES[String(ingredient || '').toLowerCase()];
  if (forIngredient && forIngredient[key]) return { ...forIngredient[key], source: 'ingredient' };
  if (GENERIC_PACKAGES[key]) return { ...GENERIC_PACKAGES[key], source: 'generic' };
  return null;
};
