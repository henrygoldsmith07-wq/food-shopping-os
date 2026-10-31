/**
 * How dear each supermarket is, relative to the typical-price table.
 *
 * The typical prices are mid-range own-brand shelf prices — what an item
 * costs at Tesco, Sainsbury's or Asda without a loyalty card. Someone who
 * shops at Aldi pays noticeably less than that and someone at Waitrose pays
 * more, so a single "typical UK" number is wrong for most people in a
 * predictable direction. This index moves it.
 *
 * Source: Which?'s monthly cheapest-supermarket basket — the same 93 items
 * priced at every shop, which is the only like-for-like basket published for
 * all the major UK grocers. Shelf prices are used by default; the loyalty
 * figures are kept for shops where most customers scan a card.
 *
 * An index is an average over a basket. It says Aldi is about 17% cheaper
 * across a typical shop, not that every Aldi tin is 17% cheaper, and the
 * label on every estimate says "typical at Aldi" rather than "Aldi price".
 *
 * Refreshed monthly by `npm run refresh:typical-prices`.
 */

export const SHOP_INDEX_SOURCE = {
  name: 'Which? cheapest supermarket basket',
  month: '2026-09',
  items: 93,
  url: 'https://www.which.co.uk/news/article/aldis-reign-as-cheapest-supermarket-ends-as-rival-knocks-it-off-the-top-spot-aYBpJ8Q6Bpwa',
};

/** £ basket totals: shelf price, and with the loyalty card where one applies. */
export const SHOP_BASKETS = {
  aldi: { shelf: 159.48 },
  lidl: { shelf: 161.84, loyalty: 161.48 },
  asda: { shelf: 186.71 },
  tesco: { shelf: 193.45, loyalty: 187.71 },
  sainsburys: { shelf: 195.01, loyalty: 188.95 },
  morrisons: { shelf: 193.13, loyalty: 192.93 },
  ocado: { shelf: 208.64 },
  waitrose: { shelf: 223.38 },
};

/** The typical-price table sits at the average of the three mid-range shops. */
const BASELINE = (SHOP_BASKETS.tesco.shelf + SHOP_BASKETS.sainsburys.shelf + SHOP_BASKETS.asda.shelf) / 3;

const NAMES = {
  aldi: 'Aldi', lidl: 'Lidl', asda: 'Asda', tesco: 'Tesco', sainsburys: "Sainsbury's",
  morrisons: 'Morrisons', ocado: 'Ocado', waitrose: 'Waitrose',
};

const fold = (value) => String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * The index entry for a store as people write it — "Aldi", "Tesco Express",
 * "Sainsbury's Local", "M&S" — or null for a shop the basket does not cover.
 */
export const shopIndexFor = (store, { loyalty = false } = {}) => {
  const folded = fold(store);
  if (!folded) return null;
  const id = Object.keys(SHOP_BASKETS).find((key) => folded.startsWith(key) || folded === key);
  if (!id) return null;
  const basket = SHOP_BASKETS[id];
  const total = loyalty && basket.loyalty ? basket.loyalty : basket.shelf;
  return { id, name: NAMES[id], factor: Math.round((total / BASELINE) * 1000) / 1000 };
};

/** The shop someone uses most, from the receipts they have logged. */
export const usualShop = (shops = []) => {
  const counts = new Map();
  for (const shop of shops || []) {
    const name = String(shop?.store || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};
