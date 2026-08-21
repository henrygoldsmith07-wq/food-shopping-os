const retailer = ({
  id, name, shopUrl, offersUrl, deliveryUrl, search, fulfilment = 'delivery',
}) => ({ id, name, shopUrl, offersUrl, deliveryUrl, search, fulfilment });

export const RETAILERS = [
  retailer({
    id: 'tesco',
    name: 'Tesco',
    shopUrl: 'https://www.tesco.com/groceries/en-GB/',
    offersUrl: 'https://www.tesco.com/groceries/en-GB/zone/all-offers',
    deliveryUrl: 'https://www.tesco.com/groceries/en-GB/slots',
    search: (query) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'sainsburys',
    name: "Sainsbury's",
    shopUrl: 'https://www.sainsburys.co.uk/gol-ui/groceries',
    offersUrl: 'https://www.sainsburys.co.uk/gol-ui/offers',
    deliveryUrl: 'https://www.sainsburys.co.uk/gol-ui/slots/delivery',
    search: (query) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'asda',
    name: 'Asda',
    shopUrl: 'https://groceries.asda.com/',
    offersUrl: 'https://groceries.asda.com/special-offers',
    deliveryUrl: 'https://groceries.asda.com/slot/view',
    search: (query) => `https://groceries.asda.com/search/${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'aldi',
    name: 'Aldi',
    shopUrl: 'https://www.aldi.co.uk/groceries',
    offersUrl: 'https://www.aldi.co.uk/groceries',
    deliveryUrl: 'https://stores.aldi.co.uk/',
    search: (query) => `https://www.aldi.co.uk/results?q=${encodeURIComponent(query)}`,
    fulfilment: 'browse',
  }),
  retailer({
    id: 'lidl',
    name: 'Lidl',
    shopUrl: 'https://www.lidl.co.uk/c/food-drink/s10023088',
    offersUrl: 'https://www.lidl.co.uk/c/food-offers/s10023092',
    deliveryUrl: 'https://www.lidl.co.uk/c/store-finder/s10023096',
    search: (query) => `https://www.lidl.co.uk/q/search?q=${encodeURIComponent(query)}`,
    fulfilment: 'browse',
  }),
  retailer({
    id: 'morrisons',
    name: 'Morrisons',
    shopUrl: 'https://groceries.morrisons.com/',
    offersUrl: 'https://groceries.morrisons.com/offers',
    deliveryUrl: 'https://groceries.morrisons.com/',
    search: (query) => `https://groceries.morrisons.com/search?entry=${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'waitrose',
    name: 'Waitrose',
    shopUrl: 'https://www.waitrose.com/ecom/shop/browse/groceries',
    offersUrl: 'https://www.waitrose.com/ecom/shop/browse/offers',
    deliveryUrl: 'https://www.waitrose.com/ecom/shop/browse/groceries',
    search: (query) => `https://www.waitrose.com/ecom/shop/search?searchTerm=${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'ocado',
    name: 'Ocado',
    shopUrl: 'https://www.ocado.com/',
    offersUrl: 'https://www.ocado.com/browse/offers-20425',
    deliveryUrl: 'https://www.ocado.com/',
    search: (query) => `https://www.ocado.com/search?entry=${encodeURIComponent(query)}`,
  }),
  retailer({
    id: 'amazon-fresh',
    name: 'Amazon Fresh',
    shopUrl: 'https://www.amazon.co.uk/groceries',
    offersUrl: 'https://www.amazon.co.uk/s?i=amazonfresh&rh=p_n_deal_type%3A26901098031',
    deliveryUrl: 'https://www.amazon.co.uk/groceries',
    search: (query) => `https://www.amazon.co.uk/s?i=amazonfresh&k=${encodeURIComponent(query)}`,
  }),
];

const key = (value) => String(value || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '');

export const retailerById = (id) =>
  RETAILERS.find((entry) => entry.id === id || key(entry.name) === key(id)) || null;

export const retailerSearchUrl = (id, query) => retailerById(id)?.search(String(query || '').trim()) || null;

const sameRetailer = (left, right) => key(left) === key(right);

export const retailerBasket = (id, items = [], shops = []) => {
  const selected = retailerById(id);
  if (!selected) return { rows: [], covered: 0, of: items.length, total: 0 };
  const matchingShops = shops
    .filter((shop) => sameRetailer(shop.store, selected.name))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const rows = items.map((item) => {
    let price = null;
    for (const shop of matchingShops) {
      const found = (shop.items || []).find((row) => key(row.name) === key(item.name));
      if (found && Number(found.price) > 0) price = Number(found.price);
    }
    return {
      id: item.id,
      name: item.name,
      price,
      searchUrl: selected.search(item.name),
    };
  });
  const priced = rows.filter((row) => row.price !== null);
  return {
    rows,
    covered: priced.length,
    of: items.length,
    total: Math.round(priced.reduce((sum, row) => sum + row.price, 0) * 100) / 100,
  };
};

export const retailerOffers = (selected, offers = []) => {
  if (!selected) return [];
  return offers.filter((offer) => !offer.store || sameRetailer(offer.store, selected.name));
};

/**
 * A retailer link is a convenience, not a guarantee that the retailer is up.
 * Keep a visible, ordered fallback plan so a failed shop never looks like a
 * successful basket or an invented price quote.
 */
export const retailerFallbackPlan = (preferredId, {
  failedIds = [], items = [], shops = [],
} = {}) => {
  const preferred = retailerById(preferredId);
  const failed = new Set((failedIds || []).map((id) => retailerById(id)?.id || id));
  const attempts = RETAILERS.map((entry, index) => {
    const basket = retailerBasket(entry.id, items, shops);
    const isPreferred = preferred?.id === entry.id;
    const unavailable = failed.has(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      url: entry.shopUrl,
      searchUrl: items[0]?.name ? entry.search(items[0].name) : entry.shopUrl,
      fulfilment: entry.fulfilment,
      unavailable,
      status: unavailable ? 'unavailable' : basket.covered ? 'recorded-prices' : 'browse',
      covered: basket.covered,
      of: basket.of,
      total: basket.total,
      score: (isPreferred ? 1000 : 0) + (unavailable ? -1000 : 0) + (basket.covered * 10) + (entry.fulfilment === 'delivery' ? 1 : 0) - index / 100,
    };
  }).sort((a, b) => b.score - a.score);
  const primary = attempts.find((entry) => entry.id === preferred?.id) || attempts[0] || null;
  const fallback = attempts.find((entry) => entry.id !== primary?.id && !entry.unavailable) || null;
  return {
    preferred: primary,
    fallback,
    attempts,
    reason: primary?.unavailable
      ? `${primary.name} is unavailable. Use ${fallback?.name || 'another retailer'} and confirm the basket there.`
      : primary?.status === 'browse'
        ? `${primary.name} has no recorded prices for this list. Use the official product search to confirm stock and price.`
        : 'Recorded prices are reference only; confirm the basket at checkout.',
  };
};
