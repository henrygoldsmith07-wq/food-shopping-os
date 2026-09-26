/**
 * The classification taxonomies, and nothing else.
 *
 * Three fixed label sets cover everything this app classifies:
 *
 *   - `product`    — what a shopping item is, so a list, a receipt line or a
 *                    pantry addition lands in the right aisle without asking.
 *   - `recipe-meal`— which meal slot a dish belongs to.
 *   - `recipe-line`— what a line of imported recipe text is, so a caption or a
 *                    pasted page can be laid out as a recipe without a model.
 *
 * Two rules hold across all three:
 *
 *   - every taxonomy has an explicit `other` label. A classifier is never
 *     asked to squeeze the world into labels that do not fit; things that do
 *     not fit are `other`, said plainly.
 *   - none of these labels carry any judgement about health. A product being
 *     `dairy` says nothing about whether anyone should eat it, and nothing in
 *     this file is ever consulted for allergies, medical nutrition or food
 *     safety — those paths go to the household's own constraints and, where a
 *     model is involved, the assistant's system prompt, never to this module.
 */

/** Shopping items. The label is what the item *is*, not what it costs. */
export const PRODUCT_TAXONOMY = [
  'produce', 'meat-fish', 'dairy', 'bakery', 'frozen',
  'pantry', 'drinks', 'household', 'personal-care', 'other',
];

/** Which meal a dish is for. */
export const RECIPE_MEAL_TAXONOMY = [
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'side', 'drink', 'other',
];

/** A line of imported recipe text — the prepass that can save a model call. */
export const RECIPE_LINE_TAXONOMY = [
  'title', 'ingredient', 'quantity', 'instruction', 'metadata', 'noise', 'other',
];

export const TAXONOMIES = {
  product: PRODUCT_TAXONOMY,
  'recipe-meal': RECIPE_MEAL_TAXONOMY,
  'recipe-line': RECIPE_LINE_TAXONOMY,
};

/**
 * Taxonomy versions. The version is part of a taxonomy's identity: cached
 * answers and telemetry are keyed by it, so adding, removing or redefining a
 * label means bumping the version here — never editing a label set in place
 * and hoping every cache has expired. The rule is append-only in spirit:
 * prefer adding a label and bumping the version over redefining what an
 * existing label means.
 */
export const TAXONOMY_VERSIONS = {
  product: 'product.v1',
  'recipe-meal': 'recipe-meal.v1',
  'recipe-line': 'recipe-line.v1',
};

/** The version string for a taxonomy, or null for an unknown id. */
export const taxonomyVersion = (id) => TAXONOMY_VERSIONS[id] || null;

/**
 * A stable fingerprint of a taxonomy's label set (FNV-1a, hex). Pure JS on
 * purpose: this module is imported on both sides of the network boundary, so
 * it must not depend on node:crypto.
 *
 * The adapter mixes the fingerprint into its cache key, which means a label
 * change invalidates cached answers even if someone forgets to bump the
 * version — belt and braces, in that order.
 */
export const taxonomyFingerprint = (id) => {
  const labels = TAXONOMIES[id];
  if (!labels) return null;
  let hash = 0x811c9dc5;
  const text = `${id}\u0000${labels.join('\u0000')}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** The label used when nothing confident is known. Always a real taxonomy label. */
export const FALLBACK_LABELS = {
  product: 'other',
  'recipe-meal': 'other',
  'recipe-line': 'other',
};

export const taxonomyLabelSets = () => Object.keys(TAXONOMIES);

export const isTaxonomy = (id) => Object.prototype.hasOwnProperty.call(TAXONOMIES, id);

export const taxonomyLabels = (id) => TAXONOMIES[id] || null;

/** A label only counts if it is in the taxonomy, exactly. */
export const isLabel = (id, label) =>
  typeof label === 'string' && TAXONOMIES[id]?.includes(label);

/** Where a product label lands on the shopping list. App aisle names, not taxonomy names. */
export const PRODUCT_LABEL_TO_AISLE = {
  produce: 'Fruit & veg',
  'meat-fish': 'Meat & fish',
  dairy: 'Dairy & eggs',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Tins & dry',
  // The list walks supermarket aisles; the app's order has no drinks or
  // toiletries aisle of its own, so those file under Other until the shopper
  // moves them — guessed, not asserted.
  drinks: 'Other',
  household: 'Household',
  'personal-care': 'Household',
  other: 'Other',
};

export const aisleForProductLabel = (label) =>
  PRODUCT_LABEL_TO_AISLE[label] || 'Other';
