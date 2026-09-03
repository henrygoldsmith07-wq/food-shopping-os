/**
 * Deterministic test data factories.
 *
 * Property tests need many generated cases, but a failing case must be
 * reproducible: every factory here draws from a seeded mulberry32 PRNG, so a
 * seed prints the exact failure without needing fast-check. Factories produce
 * plain, realistic-shaped objects for the pure engines, never React state.
 */

/** mulberry32 — tiny, fast, deterministic. Returns a function yielding [0,1). */
export const seededRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rng, options) => options[Math.floor(rng() * options.length)];
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const round2 = (n) => Math.round(n * 100) / 100;

export const QUANTITY_FORMS = ['150 g', '2 tbsp', '1 tin', '½ lemon', '3', '250 ml', '400 g', '1'];

/** A recipe-shaped object with a servings count and parseable quantities. */
export const makeRecipe = (rng, overrides = {}) => ({
  id: `recipe-${int(rng, 1, 9999)}`,
  name: `Recipe ${int(rng, 1, 9999)}`,
  servings: int(rng, 1, 12),
  costPerServing: round2(rng() * 8),
  ingredients: Array.from({ length: int(rng, 1, 6) }, () => ({
    name: `Ingredient ${int(rng, 1, 999)}`,
    qty: pick(rng, QUANTITY_FORMS),
  })),
  steps: Array.from({ length: int(rng, 1, 5) }, (_, i) => `Step ${i + 1}`),
  ...overrides,
});

/** A quick-add diary entry with positive nutrient values. */
export const makeQuickEntry = (rng, overrides = {}) => ({
  meal: pick(rng, ['breakfast', 'lunch', 'dinner', 'snack']),
  food: `Quick ${int(rng, 1, 999)}`,
  kcal: int(rng, 50, 900),
  protein: round2(rng() * 40),
  carbs: round2(rng() * 60),
  fat: round2(rng() * 30),
  ...overrides,
});

/** A shopping item the basket optimizer understands. */
export const makeShoppingItem = (rng, overrides = {}) => ({
  id: `item-${int(rng, 1, 99999)}`,
  name: `Product ${int(rng, 1, 999)}`,
  qty: int(rng, 1, 4),
  ...overrides,
});

/** A per-store offer dict keyed by normalized product name. */
export const makeOffers = (rng, itemNames, count = 3) => {
  const offers = {};
  for (const name of itemNames) {
    if (rng() < 0.75) {
      const key = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
      offers[key] = {
        name,
        price: round2(0.5 + rng() * 10),
        matchClassification: 'likely equivalent',
        matchConfidence: round2(0.5 + rng() * 0.5),
      };
    }
  }
  return offers;
};

/**
 * A waste row inside the fixed July 2026 window used by the property suite,
 * so period math is fully controlled by the test rather than the clock.
 */
export const WASTE_TODAY = '2026-07-27';
const inWindow = (rng, month) => `${month}-${String(int(rng, 1, 28)).padStart(2, '0')}`;

export const makeWasteRow = (rng, month = '2026-07', overrides = {}) => ({
  date: inWindow(rng, month),
  name: `Waste ${int(rng, 1, 999)}`,
  cost: round2(rng() * 6),
  quantity: int(rng, 1, 3),
  avoidable: rng() < 0.7,
  ...overrides,
});