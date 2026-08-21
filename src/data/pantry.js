/**
 * Pantry taxonomy. The inventory itself is the user's — it lives in app state
 * and starts empty; these are just the buckets an item can go in.
 */
export const LOCATIONS = ['Fridge', 'Freezer', 'Cupboard', 'Pantry', 'Garage', 'Wine rack'];

export const CATEGORIES = [
  'Fresh', 'Frozen', 'Baking & dry', 'Tins & jars', 'Sauces & oils',
  'Herbs & spices', 'Drinks', 'Supplements', 'Leftovers', 'Other',
];

/** Where a newly-added item lands unless the user says otherwise. */
export const DEFAULT_LOCATION = 'Fridge';
export const DEFAULT_CATEGORY = 'Fresh';
