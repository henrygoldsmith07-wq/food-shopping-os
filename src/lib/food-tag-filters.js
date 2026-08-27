/**
 * Narrowing a priced list down, and putting it in a useful order.
 *
 * Filtering and sorting are kept out of the tag derivation because they answer
 * a different question. Derivation asks "what is this item"; this asks "which
 * of these do I want to look at, and in what order".
 *
 * Two rules shape the behaviour:
 *
 *  - Selecting several tags means ALL of them, not any. Someone filtering to
 *    "high protein" and "good value" wants the intersection; showing the union
 *    would hand them a longer list than they started with, which is the
 *    opposite of filtering.
 *  - An allergen filter is an exclusion, never an inclusion. "Milk" in the
 *    allergen box means hide what may contain milk. There is no way to ask for
 *    items that *do* contain an allergen, because nobody wants that and the
 *    matching is not reliable enough to be trusted in that direction.
 */

import { rankShops, rankingSpread } from './live-prices.js';

/** Tag ids that describe an allergen warning rather than a property. */
export const isAllergenTag = (id) => String(id || '').startsWith('allergen:');

/**
 * Every tag present across the results, most common first — the "popular tags"
 * worth offering as filters. Tags nothing carries are not offered, because a
 * filter that can only ever return nothing is a dead end.
 */
export const popularTags = (tagged = [], { limit = 14 } = {}) => {
  const counts = new Map();
  for (const item of tagged) {
    for (const tag of item.tags || []) {
      const existing = counts.get(tag.id);
      if (existing) existing.count += 1;
      else counts.set(tag.id, { ...tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
};

/** Group the offered tags, so the filter row reads as sections not a soup. */
export const groupedTags = (tags = []) => {
  const order = ['health', 'nutrition', 'diet', 'processing', 'value', 'availability', 'popularity', 'allergen'];
  const groups = new Map(order.map((group) => [group, []]));
  for (const tag of tags) {
    if (!groups.has(tag.group)) groups.set(tag.group, []);
    groups.get(tag.group).push(tag);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length)
    .map(([group, list]) => ({ group, tags: list }));
};

/**
 * Apply the selected tags and the allergen exclusions.
 *
 * `selected` are required (all of them); `excludeAllergens` are allergen ids
 * whose presence removes an item.
 */
export const filterByTags = (tagged = [], { selected = [], excludeAllergens = [] } = {}) => {
  const required = selected.filter((id) => !isAllergenTag(id));
  const banned = new Set(excludeAllergens.map((id) => (isAllergenTag(id) ? id : `allergen:${id}`)));
  return tagged.filter((item) => {
    const ids = new Set((item.tags || []).map((tag) => tag.id));
    if (required.some((id) => !ids.has(id))) return false;
    if (banned.size && [...ids].some((id) => banned.has(id))) return false;
    return true;
  });
};

const HEALTH_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/**
 * The sorts on offer.
 *
 * Each returns a comparator, and each pushes items it cannot rank to the end
 * rather than treating "unknown" as zero — an item with no readable pack size
 * is not the cheapest thing per kilo, it is simply unknown.
 */
export const SORTS = [
  { id: 'price', label: 'Cheapest first' },
  { id: 'per-kg', label: 'Best value per kg' },
  { id: 'health', label: 'Healthiest first' },
  { id: 'popularity', label: 'Most bought' },
  { id: 'saving', label: 'Biggest gap between shops' },
  { id: 'name', label: 'A–Z' },
];

export const SORT_IDS = SORTS.map((sort) => sort.id);

/**
 * Compare, with anything unrankable pushed to the end either way round.
 *
 * `direction` rather than swapping the arguments: swapping also swaps which
 * side the missing check looks at, which floats the unrankable items to the
 * top — the exact opposite of what "missing last" is for.
 */
const missingLast = (a, b, pick, direction = 'asc') => {
  const left = pick(a);
  const right = pick(b);
  const leftMissing = !Number.isFinite(left);
  const rightMissing = !Number.isFinite(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return direction === 'desc' ? right - left : left - right;
};

/**
 * Spread between the best and worst shop for an item, per unit where the pack
 * sizes allow it.
 *
 * "Biggest gap between shops" has to mean the same thing as the ranking it
 * sends you to, or the sort puts an item at the top and the ranking underneath
 * disagrees about which shop is dearest. The gap comes back as a percentage
 * rather than as money, because pennies per 100ml and pennies per pack are not
 * the same currency and sorting a list on a mixture of the two is meaningless.
 */
export const shopSpread = (item) => {
  const spread = rankingSpread(rankShops(item?.perRetailer || [], { name: item?.name }));
  return spread?.pct ?? null;
};

export const sortItems = (tagged = [], sort = 'price') => {
  const rows = [...tagged];
  switch (sort) {
    case 'per-kg':
      return rows.sort((a, b) => missingLast(a, b, (item) => item.bestPerKg));
    case 'health':
      return rows.sort((a, b) => missingLast(
        a, b, (item) => (item.health ? HEALTH_ORDER[item.health.grade] : NaN),
      ) || String(a.name).localeCompare(String(b.name)));
    case 'popularity':
      return rows.sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0)
        || String(a.name).localeCompare(String(b.name)));
    case 'saving':
      return rows.sort((a, b) => missingLast(a, b, shopSpread, 'desc'));
    case 'name':
      return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    case 'price':
    default:
      return rows.sort((a, b) => missingLast(a, b, (item) => item.bestPrice));
  }
};

/** Filter then sort, and say how much was hidden so an empty view explains itself. */
export const applyTagView = (tagged = [], {
  selected = [], excludeAllergens = [], sort = 'price',
} = {}) => {
  const filtered = filterByTags(tagged, { selected, excludeAllergens });
  return {
    items: sortItems(filtered, sort),
    shown: filtered.length,
    total: tagged.length,
    hidden: tagged.length - filtered.length,
  };
};
