/**
 * Prices from the JSON a shop page hydrates from.
 *
 * Split from scrape-parse.js, whose passes read markup; this one reads the
 * state blob a server-rendered grocery page embeds for its own client code.
 */

import {
  decodeEntities, extractJsonLd, flattenNodes, parseMoney, parsePackSize,
} from './scrape-parse.js';

/**
 * The object literal starting at `from`, by brace matching that respects
 * strings. Null when it never closes. Used on state blobs a megabyte long, so
 * it is a single pass over the characters rather than repeated regexes.
 */
export const objectLiteralAt = (source, from) => {
  const start = source.indexOf('{', from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
};

const parseStateJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      // Server-rendered state is JavaScript, not JSON: `undefined` is legal.
      return JSON.parse(raw.replace(/:\s*undefined\b/g, ':null'));
    } catch {
      return null;
    }
  }
};

/**
 * Every JSON state blob a server-rendered shop page hydrates from:
 * `window.__INITIAL_STATE__ = {...}` (the Ocado platform — Morrisons, Ocado),
 * and `<script id="__NEXT_DATA__" type="application/json">` (Next.js).
 */
export const extractPageState = (html = '') => {
  const source = String(html);
  const states = [];
  for (const match of source.matchAll(/window\.__[A-Z][A-Z_]*__\s*=\s*/g)) {
    const parsed = parseStateJson(objectLiteralAt(source, match.index + match[0].length));
    if (parsed && typeof parsed === 'object') states.push(parsed);
  }
  for (const match of source.matchAll(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseStateJson(match[1].trim());
    if (parsed && typeof parsed === 'object') states.push(parsed);
  }
  return states;
};

/** Keys a product record carries and a category, banner or breadcrumb does not. */
const PRODUCT_ID_KEYS = ['retailerProductId', 'productId', 'sku', 'gtin', 'gtin13', 'ean', 'barcode', 'productCode', 'tpnb', 'tpnc'];

/** `{ amount, currency }` from the shapes shops use; pence (GBX) become pounds. */
const moneyOf = (value, depth = 0) => {
  if (value === null || value === undefined || depth > 3) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    const amount = parseMoney(value);
    return amount === null ? null : { amount, currency: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  // `current` is today's ticket; `original` is the "was" price beside it.
  if (value.current) return moneyOf(value.current, depth + 1);
  for (const key of ['amount', 'value', 'price']) {
    if (value[key] === undefined) continue;
    const inner = moneyOf(value[key], depth + 1);
    if (!inner) return null;
    const currency = typeof value.currency === 'string' ? value.currency.toUpperCase() : inner.currency;
    return currency === 'GBX'
      ? { amount: Math.round(inner.amount) / 100, currency: 'GBP' }
      : { amount: inner.amount, currency };
  }
  return null;
};

/** "fop.price.per.kg" / "per 100g" → "kg" / "100g". */
const unitLabel = (label) => {
  const match = String(label || '').toLowerCase().match(/(?:per[._\s]*)?(\d*\s*(?:kg|g|l|litre|ml|cl|each|ea|item|100g|100ml))$/);
  return match ? match[1].replace(/\s+/g, '') : null;
};

const textOf = (value) => (typeof value === 'string' ? value
  : value && typeof value === 'object' && typeof value.value === 'string' ? value.value
    : value && typeof value === 'object' && typeof value.description === 'string' ? value.description
      : null);

/**
 * Products from a page's hydration state.
 *
 * Most modern grocery sites render their result grid in the browser from a
 * JSON blob the server embedded in the page. The markup a plain fetch gets
 * has no JSON-LD and no microdata — but the blob is right there, holding the
 * shop's own name, ticket price, pack size and unit price for every product.
 * Reading it is as authoritative as JSON-LD: it is the data the shop renders
 * its own price labels from.
 */
export const productsFromPageState = (html = '') => {
  const rows = [];
  let visited = 0;
  // The state carries the shop's product id but not its page; the JSON-LD
  // ItemList beside it carries the pages, each ending in that id.
  const pageById = new Map();
  for (const node of flattenNodes(extractJsonLd(html))) {
    const link = typeof node?.url === 'string' ? node.url : null;
    const id = link?.match(/\/(\d{5,})\/?(?:[?#].*)?$/)?.[1];
    if (id && !pageById.has(id)) pageById.set(id, link);
  }
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12 || visited > 60000) return;
    visited += 1;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const name = typeof node.name === 'string' ? decodeEntities(node.name).replace(/\s+/g, ' ').trim() : '';
    const hasId = PRODUCT_ID_KEYS.some((key) => node[key] !== undefined && node[key] !== null);
    const money = name && hasId && node.price !== undefined ? moneyOf(node.price) : null;
    if (money && money.amount > 0 && (!money.currency || money.currency === 'GBP')) {
      const unit = node.price && typeof node.price === 'object' ? node.price.unit : null;
      const unitMoney = unit ? moneyOf(unit) : null;
      const per = unit ? unitLabel(unit.label || unit.unit) : null;
      const offer = textOf(node.offer) || (Array.isArray(node.offers) ? textOf(node.offers[0]) : null);
      rows.push({
        name: name.slice(0, 200),
        price: money.amount,
        currency: 'GBP',
        url: typeof node.url === 'string' ? node.url
          : pageById.get(String(node.retailerProductId ?? node.sku ?? '')) || null,
        href: typeof node.href === 'string' ? node.href : null,
        brand: typeof node.brand === 'string' ? node.brand : null,
        packSize: parsePackSize(textOf(node.size) || textOf(node.packSize) || '') || parsePackSize(name),
        unitPrice: unitMoney && per ? { value: unitMoney.amount, unit: per } : null,
        offer: offer ? offer.slice(0, 120) : null,
        inStock: typeof node.available === 'boolean' ? node.available : null,
        retailerProductId: node.retailerProductId ? String(node.retailerProductId) : null,
        method: 'page-state',
        confidence: 'high',
      });
      return;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  };
  for (const state of extractPageState(html)) walk(state, 0);
  return rows;
};
