/**
 * Shopping taxonomy. The list, the prices you paid and the shops you recorded
 * are all yours — they live in app state. This file only holds the aisle order
 * a supermarket walk tends to follow, plus helpers that operate on your list.
 */

import { canonicalName, displayNameFor } from '../lib/aliases.js';
import { mergeQtys } from '../lib/pantry.js';

export const RECIPE_AISLE = 'From recipes';

export const AISLE_ORDER = [
  'Fruit & veg', 'Bakery', 'Meat & fish', 'Dairy & eggs', 'World foods',
  'Tins & dry', 'Frozen', 'Household', 'Other', RECIPE_AISLE,
];

/** Names offered as suggestions when recording where you shopped. */
export const COMMON_STORES = [
  'Tesco', "Sainsbury's", 'Asda', 'Aldi', 'Lidl', 'Morrisons', 'Waitrose',
  'Ocado', 'Amazon Fresh', 'Co-op', 'M&S', 'Local shop', 'Market', 'Online',
];

/** Rough aisle for a name, so adding an item doesn't demand a category. */
const AISLE_HINTS = [
  [/lettuce|spinach|kale|tomato|onion|potato|carrot|pepper|apple|banana|berry|berries|fruit|veg|salad|lemon|lime|garlic|ginger|mushroom|broccoli|avocado/i, 'Fruit & veg'],
  [/bread|loaf|roll|bagel|croissant|bun|wrap|tortilla|pastry|cake/i, 'Bakery'],
  [/chicken|beef|pork|lamb|mince|bacon|sausage|steak|fish|salmon|tuna|prawn|turkey|ham/i, 'Meat & fish'],
  [/milk|cheese|yogurt|yoghurt|butter|cream|egg|halloumi|feta/i, 'Dairy & eggs'],
  [/soy|curry paste|noodle|miso|tahini|sriracha|coconut milk|spice|masala/i, 'World foods'],
  [/tin|tinned|beans|chickpea|lentil|rice|pasta|flour|sugar|oats|cereal|stock/i, 'Tins & dry'],
  [/frozen|ice cream|peas|chips/i, 'Frozen'],
  [/washing|cleaner|bin bag|foil|roll|detergent|soap|sponge/i, 'Household'],
];

/** Best-guess aisle for a free-text item name. */
export const guessAisle = (name = '') =>
  (AISLE_HINTS.find(([pattern]) => pattern.test(name)) || [null, 'Other'])[1];

export const key = (name) => String(name || '').trim().toLowerCase();

/** Add up the checked items' prices — the running total while you shop. */
export const checkedTotalOf = (items = []) =>
  items.filter((i) => i.checked).reduce((s, i) => s + (Number(i.price) || 0), 0);

export const totalOf = (items = []) =>
  items.reduce((s, i) => s + (Number(i.price) || 0), 0);

/** Group a list into aisle order, dropping empty aisles. */
export const groupByAisle = (items = []) => {
  const map = new Map(AISLE_ORDER.map((a) => [a, []]));
  for (const item of items) {
    const aisle = map.has(item.aisle) ? item.aisle : 'Other';
    map.get(aisle).push(item);
  }
  return [...map.entries()].filter(([, list]) => list.length);
};

/**
 * Turn recipes' missing ingredients into shopping items. Prices are left
 * blank — you fill in what things actually cost as you shop.
 *
 * One canonical ingredient becomes ONE row, no matter how the recipes spell
 * it: "Onion" and "White onion" are the same purchase, so they share a row
 * (under the group's everyday display name) with quantities added together
 * on the same scale, and both recipes named in `forRecipes`. Deduping by raw
 * spelling used to emit two rows for the same canonical ingredient — each
 * carrying the full combined requirement — which read as two purchases and
 * doubled the need on merge.
 */
export const itemsFromRecipes = (recipes, pantryNames = [], { learnedAliases = {} } = {}) => {
  const have = new Set(pantryNames.map((n) => canonicalName(n, learnedAliases)));
  const rows = new Map();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const canonical = canonicalName(ing.name, learnedAliases);
      if (!canonical || have.has(canonical)) continue;
      const found = rows.get(canonical);
      if (found) {
        found.qty = mergeQtys(found.qty, ing.qty, { ingredient: canonical });
        if (r.name && !found.forRecipes.includes(r.name)) found.forRecipes.push(r.name);
        continue;
      }
      rows.set(canonical, {
        id: `x-${canonical.replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
        name: displayNameFor(ing.name, learnedAliases) || ing.name,
        emoji: r.emoji,
        aisle: RECIPE_AISLE,
        qty: ing.qty,
        price: 0,
        checked: false,
        fromRecipe: r.name,
        forRecipes: r.name ? [r.name] : [],
      });
    }
  }
  return [...rows.values()];
};
