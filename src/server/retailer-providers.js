import { ApiError } from './api.js';
import {
  observedPriceSchema,
  priceLookupSchema,
  productDataSchema,
} from './schemas.js';

const DEFAULT_OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org';
const DEFAULT_OPEN_PRICES_URL = 'https://prices.openfoodfacts.org';
const DEFAULT_USER_AGENT = 'Forq/1.0 (+https://github.com/henrygoldsmith07-wq/Claude-Code)';
const REQUEST_TIMEOUT_MS = 8000;

const numeric = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value, max = 4000) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : null;
};

const barcode = (value) => {
  const cleaned = String(value || '').replace(/\D/g, '');
  return /^\d{8,14}$/.test(cleaned) ? cleaned : null;
};

const url = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const baseUrl = (value) => {
  const parsed = url(value);
  if (!parsed) return null;
  const protocol = new URL(parsed).protocol;
  if (process.env.NODE_ENV === 'production' && protocol !== 'https:') return null;
  return new URL(parsed);
};

const checkedAt = () => new Date().toISOString();

export const openDataStatus = () => {
  const openFoodFacts = process.env.OPEN_FOOD_FACTS_ENABLED !== 'false';
  const openPrices = process.env.OPEN_PRICES_ENABLED !== 'false';
  return { openFoodFacts, openPrices };
};

const RETAILER_TIMEOUTS = { openFoodFacts: 6000, openPrices: 5000, fallback: 8000 };
const STALE_DAYS = 30;

export const priceFreshness = (observedAt) => {
  if (!observedAt) return { level: 'unknown', label: 'date unknown', stale: true };
  const d = new Date(observedAt);
  if (Number.isNaN(d.getTime())) return { level: 'unknown', label: 'invalid date', stale: true };
  const age = (Date.now() - d.getTime()) / 86400000;
  if (age < 0) return { level: 'future', label: 'future date', stale: true };
  if (age <= 2) return { level: 'fresh', label: 'observed today', stale: false };
  if (age <= 7) return { level: 'fresh', label: `observed ${Math.round(age)}d ago`, stale: false };
  if (age <= STALE_DAYS) return { level: 'ageing', label: `observed ${Math.round(age)}d ago`, stale: false };
  return { level: 'stale', label: `observed ${Math.round(age)}d ago · stale`, stale: true };
};

export const dedupeProducts = (rows = []) => {
  const byBarcode = new Map();
  for (const row of rows) {
    const key = row.barcode || row.id || row.name?.toLowerCase();
    if (!key) continue;
    const existing = byBarcode.get(key);
    if (!existing) byBarcode.set(key, row);
    else {
      // keep fresher price, or cheaper if same date
      const aFresh = priceFreshness(existing.observedAt || existing.checkedAt);
      const bFresh = priceFreshness(row.observedAt || row.checkedAt);
      if (bFresh.level === 'fresh' && aFresh.level !== 'fresh') byBarcode.set(key, row);
      else if (existing.price != null && row.price != null && row.price < existing.price && aFresh.level === bFresh.level) byBarcode.set(key, row);
    }
  }
  return [...byBarcode.values()];
};

export const detectPackageMismatch = (listedQty, observedQty) => {
  if (!listedQty || !observedQty) return { mismatch: false, reason: 'no package data' };
  const a = String(listedQty).replace(/\s+/g, '').toLowerCase();
  const b = String(observedQty).replace(/\s+/g, '').toLowerCase();
  if (a === b) return { mismatch: false };
  // heuristic: numbers differ -> possible mismatch
  const num = (s) => Number(s.replace(/[^0-9.]/g, ''));
  const na = num(a), nb = num(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) / Math.max(na, nb) > 0.25) {
    return { mismatch: true, reason: `Package sizes differ (${listedQty} vs ${observedQty}) — compare per 100g.` };
  }
  return { mismatch: false };
};

const getJson = async (endpoint, options = {}, failureMessage = 'Provider data is temporarily unavailable.', { allowNotFound = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) => {
  let response;
  const signal = options.signal || AbortSignal.timeout(timeoutMs);
  try {
    response = await fetch(endpoint, {
      ...options,
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || String(error).includes('Timeout') || String(error).includes('abort');
    if (isTimeout) throw new ApiError(504, `${failureMessage} (timeout after ${timeoutMs}ms)`);
    throw new ApiError(502, failureMessage);
  }
  if (response.status === 404 && allowNotFound) return null;
  if (response.status === 429) throw new ApiError(429, 'Provider rate limit reached — try again shortly.');
  if (response.status >= 500) throw new ApiError(502, `${failureMessage} (provider ${response.status})`);
  if (!response.ok) throw new ApiError(502, failureMessage);
  const textBody = await response.text().catch(() => '');
  if (!textBody) throw new ApiError(502, `${failureMessage} (empty response)`);
  try {
    return JSON.parse(textBody);
  } catch {
    throw new ApiError(502, `${failureMessage} (malformed payload — not JSON)`);
  }
};

const rowsFrom = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.products)) return payload.products;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object') return rowsFrom(payload.data);
  return [];
};

const openFoodFactsBase = () => baseUrl(process.env.OPEN_FOOD_FACTS_API_BASE_URL || DEFAULT_OPEN_FOOD_FACTS_URL);
const openPricesBase = () => baseUrl(process.env.OPEN_PRICES_API_BASE_URL || DEFAULT_OPEN_PRICES_URL);
const openFoodFactsImage = (value) => {
  const parsed = url(value);
  const base = openFoodFactsBase();
  if (!parsed || !base) return null;
  const hostname = new URL(parsed).hostname.toLowerCase();
  const baseHostname = new URL(base).hostname.toLowerCase();
  const trusted = hostname === baseHostname
    || hostname.endsWith(`.${baseHostname}`)
    || hostname === 'openfoodfacts.org'
    || hostname.endsWith('.openfoodfacts.org');
  return trusted ? parsed : null;
};
const openDataHeaders = () => ({
  accept: 'application/json',
  'user-agent': process.env.OPEN_FOOD_FACTS_USER_AGENT || DEFAULT_USER_AGENT,
});

export const lookupOpenFoodFactsProduct = async (value, { signal } = {}) => {
  const code = barcode(value);
  if (!code || process.env.OPEN_FOOD_FACTS_ENABLED === 'false') return null;
  const base = openFoodFactsBase();
  if (!base) throw new ApiError(503, 'Open Food Facts is not configured.');
  const endpoint = new URL(`/api/v3/product/${code}`, base);
  endpoint.searchParams.set('product_type', 'food');
  endpoint.searchParams.set('lc', 'en');
  endpoint.searchParams.set('cc', 'gb');
  endpoint.searchParams.set('fields', [
    'code', 'product_name', 'generic_name', 'brands', 'quantity', 'product_quantity',
    'product_quantity_unit', 'image_front_url', 'image_front_small_url', 'ingredients_text',
    'allergens', 'labels', 'nutriscore_grade', 'ecoscore_grade', 'nutriments',
  ].join(','));
  const payload = await getJson(endpoint, { headers: openDataHeaders(), signal }, 'Open Food Facts is temporarily unavailable.', { allowNotFound: true, timeoutMs: RETAILER_TIMEOUTS.openFoodFacts });
  if (payload?.status === 0 || !payload?.product) return null;
  const product = payload.product;
  const nutrients = {
    kcal: numeric(product.nutriments?.['energy-kcal_100g']),
    protein: numeric(product.nutriments?.proteins_100g),
    carbohydrate: numeric(product.nutriments?.carbohydrates_100g),
    fat: numeric(product.nutriments?.fat_100g),
    fibre: numeric(product.nutriments?.fiber_100g),
    sugar: numeric(product.nutriments?.sugars_100g),
    salt: numeric(product.nutriments?.salt_100g),
  };
  const nutrition = Object.fromEntries(Object.entries(nutrients).filter(([, item]) => item !== null));
  return productDataSchema.parse({
    barcode: code,
    name: text(product.product_name ?? product.generic_name, 200) || `Barcode ${code}`,
    brand: text(product.brands, 200),
    quantity: text(product.quantity || [product.product_quantity, product.product_quantity_unit].filter(Boolean).join(' '), 120),
    imageUrl: openFoodFactsImage(product.image_front_url || product.image_front_small_url),
    ingredients: text(product.ingredients_text, 4000),
    allergens: text(product.allergens, 1000),
    labels: text(product.labels, 1000),
    nutriScore: text(product.nutriscore_grade, 20),
    ecoScore: text(product.ecoscore_grade, 20),
    nutrition: Object.keys(nutrition).length ? nutrition : undefined,
    source: 'open-food-facts',
    sourceLabel: 'Open Food Facts',
    checkedAt: checkedAt(),
  });
};

const normaliseObservedPrice = (raw) => {
  const value = raw && typeof raw === 'object' ? raw : {};
  const product = value.product && typeof value.product === 'object' ? value.product : {};
  const location = value.location && typeof value.location === 'object' ? value.location : {};
  const amount = numeric(value.price);
  const currency = text(value.currency, 3)?.toUpperCase();
  if (amount === null || amount < 0 || currency !== 'GBP') return null;
  const store = text(location.osm_brand || location.osm_name || value.store || value.location_name, 200);
  const locationText = text(location.osm_display_name || location.osm_address_city || location.osm_address_country, 300);
  return observedPriceSchema.parse({
    id: value.id === undefined ? undefined : String(value.id),
    barcode: barcode(value.product_code || product.code),
    name: text(value.product_name || product.product_name || value.product_code, 200) || 'Unknown product',
    brand: text(product.brands, 200),
    price: amount,
    currency,
    offer: value.price_is_discounted ? 'Observed discounted price' : null,
    store,
    location: locationText,
    observedAt: text(value.date, 40),
    source: 'open-prices',
    sourceLabel: 'Open Prices (community observed)',
    checkedAt: checkedAt(),
  });
};

export const lookupOpenPrices = async (input, { signal } = {}) => {
  const parsed = priceLookupSchema.parse(input);
  if (process.env.OPEN_PRICES_ENABLED === 'false') return [];
  const base = openPricesBase();
  if (!base) throw new ApiError(503, 'Open Prices is not configured.');
  const endpoint = new URL('/api/v1/prices', base);
  endpoint.searchParams.set('size', '30');
  endpoint.searchParams.set('currency', 'GBP');
  if (parsed.barcode) endpoint.searchParams.set('product_code', parsed.barcode);
  if (!parsed.barcode && parsed.query) endpoint.searchParams.set('product_name', parsed.query);
  const payload = await getJson(endpoint, { headers: openDataHeaders(), signal }, 'Open Prices is temporarily unavailable.', { timeoutMs: RETAILER_TIMEOUTS.openPrices });
  const rows = rowsFrom(payload).slice(0, 30).map(normaliseObservedPrice).filter(Boolean);
  // Enrich with freshness + fallback labeling
  const enriched = rows.map((row) => {
    const freshness = priceFreshness(row.observedAt);
    return {
      ...row,
      freshness: freshness.level,
      freshnessLabel: freshness.label,
      isStale: freshness.stale,
      fallbackLabel: freshness.stale ? 'Stale price — confirm at shelf' : null,
      unavailable: false,
    };
  });
  const deduped = dedupeProducts(enriched);
  // Handle missing price: rows without price already filtered; if none remain, signal unavailable but don't throw
  if (!deduped.length) return [];
  return deduped.slice(0, 30);
};

export const lookupProductWithPrices = async (value, { signal } = {}) => {
  const code = barcode(value);
  const product = await lookupOpenFoodFactsProduct(code, { signal });
  if (!product) return { product: null, prices: [], priceStatus: 'not-requested', fallback: 'no-product' };
  let prices = [];
  let priceStatus = 'available';
  let fallback = null;
  try {
    prices = await lookupOpenPrices({ barcode: code }, { signal });
    if (!prices.length) {
      priceStatus = 'unavailable';
      fallback = 'missing-price — no community observation for this barcode';
    } else if (prices.every((p) => p.isStale)) {
      fallback = 'stale-price — observations >30d old, confirm at shelf';
    } else if (prices.length !== dedupeProducts(prices).length) {
      fallback = 'duplicate-products deduped';
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    priceStatus = error.status === 429 ? 'rate-limited' : error.status === 504 ? 'timeout' : 'unavailable';
    fallback = error.message;
    // Always label fallback data correctly — never present stale/cached as live
    prices = [];
  }
  // Duplicate / package mismatch detection for barcode products
  const mismatches = prices
    .map((p) => ({ price: p, mismatch: detectPackageMismatch(product.quantity, p.packageSize || p.quantity) }))
    .filter((m) => m.mismatch.mismatch);
  return { product, prices, priceStatus, fallback, mismatches, isLive: false, sourceLabel: 'Open Prices (community observed) — not live' };
};
