/**
 * Turning a retailer's search page into candidate prices.
 *
 * Everything here is pure and offline: HTML in, structured rows out. That
 * split matters, because it is what lets the scraper try honest, deterministic
 * extraction first and only reach for a language model when the page gives it
 * nothing to work with.
 *
 * Three passes, in descending order of trust:
 *   1. JSON-LD  — the retailer's own schema.org Product/Offer data. If it is
 *                 there it is authoritative, and we take it verbatim.
 *   2. Microdata — itemprop="price" attributes, the same data one layer down.
 *   3. Text     — a price-shaped string near a product-shaped string. This is
 *                 a guess, and it is labelled as one.
 *
 * A pass never invents a number. Where a page yields nothing, the caller is
 * told "nothing", which is a better answer than a plausible price.
 */

/** Tags whose contents are never product copy and only bloat an LLM prompt. */
const NOISE_TAGS = ['script', 'style', 'noscript', 'svg', 'iframe', 'template', 'head'];

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£',
  '#39': "'", '#163': '£', '#160': ' ', euro: '€', hellip: '…', ndash: '–', mdash: '—',
};

/** Decode the handful of entities that actually show up in retailer markup. */
export const decodeEntities = (value = '') => String(value)
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    const lower = code.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTITIES, lower)) return ENTITIES[lower];
    if (lower.startsWith('#x')) {
      const point = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    if (lower.startsWith('#')) {
      const point = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return whole;
  });

const stripTag = (html, tag) =>
  html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ')
    .replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), ' ');

/**
 * Flatten a page to the text a reader would see, capped in size.
 *
 * The cap is not politeness — it is the difference between a prompt a free
 * model will answer and one it refuses, so it is applied before anything is
 * sent anywhere.
 */
export const condenseHtml = (html = '', maxChars = 12000) => {
  let out = String(html);
  for (const tag of NOISE_TAGS) out = stripTag(out, tag);
  out = out
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  out = decodeEntities(out)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n…[truncated]` : out;
};

/**
 * Keep only the lines that could plausibly carry a price, plus the line above
 * each (usually the product name). Cuts nav, footers and cookie banners so the
 * model sees products rather than boilerplate.
 */
export const priceRelevantText = (text = '', maxChars = 8000) => {
  const lines = String(text).split('\n');
  const keep = new Set();
  lines.forEach((line, index) => {
    // A bare "1.45" or a "GBP 1.45" counts: plenty of retailers render the
    // currency in a sibling element, and those are exactly the pages the
    // deterministic passes fail on and the model is asked about.
    if (!/[£$€]\s?\d|\b\d+\.\d{2}\b|\bgbp\b|\d+\s?p\b|\bper\s+(?:kg|litre|l|100g|100ml|each)\b/i.test(line)) return;
    if (index > 0) keep.add(index - 1);
    keep.add(index);
  });
  const picked = [...keep].sort((a, b) => a - b).map((index) => lines[index].trim()).filter(Boolean);
  const joined = picked.join('\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
};

/** "£2.50" / "250p" / "2.50" → 2.5. Null when the string is not a price. */
export const parseMoney = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const pence = raw.match(/^(\d{1,4})\s?p$/i);
  if (pence) return Number(pence[1]) / 100;
  const match = raw.match(/-?\d{1,7}(?:[,\d]{0,10})?(?:\.\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) return null;
  return Math.round(parsed * 100) / 100;
};

/** "£1.50/kg", "35p per 100g" → { value, unit }. Null when absent. */
export const parseUnitPrice = (value) => {
  const raw = decodeEntities(String(value ?? '')).replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const match = raw.match(/([£$€]\s?\d+(?:\.\d{1,2})?|\d{1,4}\s?p)\s*(?:\/|per\s+)\s*(\d*\s*(?:kg|g|l|litre|ltr|ml|cl|each|item|sheet|wash))/i);
  if (!match) return null;
  const amount = parseMoney(match[1]);
  if (amount === null) return null;
  return { value: amount, unit: match[2].replace(/\s+/g, '').toLowerCase() };
};

/** The pack size a listing states, e.g. "500g", "6 x 330ml", "1.5 litre". */
export const parsePackSize = (value) => {
  const raw = decodeEntities(String(value ?? '')).replace(/\s+/g, ' ');
  const match = raw.match(/\b(\d+(?:\.\d+)?\s?(?:x\s?\d+(?:\.\d+)?\s?)?(?:kg|g|ml|cl|l|litre|ltr|pack|pk)\b)/i);
  return match ? match[1].replace(/\s+/g, '').toLowerCase() : null;
};

const CURRENCY_SYMBOLS = { '£': 'GBP', $: 'USD', '€': 'EUR' };

/** ISO currency for a code or a symbol; defaults to GBP for a bare number. */
export const normaliseCurrency = (value, fallback = 'GBP') => {
  const raw = String(value ?? '').trim();
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) return code;
  }
  return fallback;
};

/** Every parseable <script type="application/ld+json"> block on the page. */
export const extractJsonLd = (html = '') => {
  const blocks = [...String(html).matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];
  const nodes = [];
  for (const [, body] of blocks) {
    const cleaned = body.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      nodes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // A retailer shipping malformed JSON-LD is not our problem to repair.
    }
  }
  return nodes;
};

const typeOf = (node) => {
  const raw = node?.['@type'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map((entry) => String(entry).toLowerCase());
};

/** Walk @graph / itemListElement so nested Products are found, not just top level. */
const flattenNodes = (nodes, depth = 0) => {
  if (depth > 4) return [];
  const out = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    out.push(node);
    // A schema.org ItemList wraps each entry in a ListItem whose `item` holds
    // the actual Product. Not following that finds the wrappers and no prices.
    for (const key of ['@graph', 'itemListElement', 'mainEntity', 'item', 'hasVariant', 'isSimilarTo', 'itemOffered']) {
      const child = node[key];
      if (Array.isArray(child)) out.push(...flattenNodes(child, depth + 1));
      else if (child && typeof child === 'object') out.push(...flattenNodes([child], depth + 1));
    }
  }
  return out;
};

/**
 * The offer carrying a price.
 *
 * An AggregateOffer has no `price` of its own — it has `lowPrice`, which for a
 * shopping list is the number that matters. Walking past it because the key is
 * spelled differently loses every retailer that publishes a range.
 */
const firstOffer = (node) => {
  const offers = node?.offers;
  const list = (Array.isArray(offers) ? offers : [offers]).filter(
    (offer) => offer && typeof offer === 'object',
  );
  const priced = list.find((offer) => offer.price !== undefined);
  if (priced) return priced;
  const aggregate = list.find((offer) => offer.lowPrice !== undefined);
  if (aggregate) return aggregate;
  // An AggregateOffer often nests the real offers one level down.
  for (const offer of list) {
    const nested = offer.offers;
    const inner = (Array.isArray(nested) ? nested : [nested]).find(
      (row) => row && typeof row === 'object' && row.price !== undefined,
    );
    if (inner) return inner;
  }
  return null;
};

/**
 * Turn whatever a page put in an href into a link that will actually open.
 *
 * Retailers write product links every way the spec allows — absolute,
 * root-relative, protocol-relative, and relative to the search path. A link
 * that 404s is worse than no link, because the person has already decided to
 * trust it by the time it fails, so anything that will not resolve against
 * the page it was found on is dropped rather than guessed at.
 */
export const absoluteUrl = (href, base) => {
  const raw = String(href || '').trim();
  if (!raw || /^(?:javascript|mailto|tel):/i.test(raw) || raw.startsWith('#')) return null;
  try {
    const resolved = new URL(raw, base || undefined);
    return /^https?:$/.test(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
};

/** The href of the last anchor opened before this point in the markup. */
const anchorNear = (before, after) => {
  const preceding = [...String(before).matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].pop()?.[1];
  if (preceding) return preceding;
  return String(after).match(/<a\b[^>]*\bhref=["']([^"']+)["']/i)?.[1] || null;
};

/**
 * schema.org Products with a price. This is the retailer stating its own
 * price in a machine-readable format — the highest-confidence source we have.
 */
export const productsFromJsonLd = (html = '') => {
  const nodes = flattenNodes(extractJsonLd(html));
  const rows = [];
  for (const node of nodes) {
    if (!typeOf(node).includes('product')) continue;
    const offer = firstOffer(node);
    const price = parseMoney(offer?.price ?? offer?.lowPrice ?? node?.price);
    const name = typeof node.name === 'string' ? decodeEntities(node.name).trim() : '';
    if (price === null || !name) continue;
    const availability = String(offer?.availability || '').toLowerCase();
    rows.push({
      name: name.slice(0, 200),
      price,
      currency: normaliseCurrency(offer?.priceCurrency),
      url: typeof offer?.url === 'string' ? offer.url : typeof node.url === 'string' ? node.url : null,
      brand: typeof node.brand === 'string' ? node.brand : node.brand?.name || null,
      packSize: parsePackSize(name),
      inStock: availability ? !/outofstock|soldout|discontinued/.test(availability) : null,
      method: 'json-ld',
      confidence: 'high',
    });
  }
  return rows;
};

/**
 * itemprop="price" microdata, plus the `data-price` attributes UK retailers
 * use in place of it — the same claim, one layer less structured.
 *
 * Three shapes, because real markup uses all three: the price in a `content`
 * attribute, the price as the element's own text, and the price on a
 * `data-*` attribute with no microdata at all. Reading only the first finds
 * a fraction of the pages that actually state a price.
 */
export const productsFromMicrodata = (html = '') => {
  const source = String(html);
  const rows = [];
  const matches = [
    // itemprop="price" content="1.45"
    ...source.matchAll(/<[^>]*itemprop=["']price["'][^>]*?(?:content|value)=["']([^"']+)["'][^>]*>/gi),
    // <span itemprop="price">£1.45</span>
    ...source.matchAll(/<[^>]*itemprop=["']price["'][^>]*>([^<]{1,40})</gi),
    // data-price="1.45" / data-product-price="145"
    ...source.matchAll(/<[^>]*\bdata-(?:product-)?price=["']([^"']{1,20})["'][^>]*>/gi),
  ].sort((a, b) => a.index - b.index);
  const seen = new Set();
  for (const match of matches) {
    if (seen.has(match.index)) continue;
    seen.add(match.index);
    const price = parseMoney(match[1]);
    if (price === null) continue;
    const before = source.slice(Math.max(0, match.index - 1200), match.index);
    // A card that carries the price on its wrapper has the name inside it, so
    // looking only backwards misses every shop that markets up that way.
    const after = source.slice(match.index, match.index + 1200);
    const name = [...before.matchAll(/itemprop=["']name["'][^>]*>([^<]{2,200})</gi)].pop()?.[1]
      || [...before.matchAll(/<(?:h2|h3|a)\b[^>]*>([^<]{4,200})</gi)].pop()?.[1]
      || after.match(/itemprop=["']name["'][^>]*>([^<]{2,200})</i)?.[1]
      || '';
    const cleanName = decodeEntities(name).replace(/\s+/g, ' ').trim();
    if (!cleanName) continue;
    rows.push({
      name: cleanName.slice(0, 200),
      price,
      currency: normaliseCurrency(match[0]),
      // The product's own page, when the card links to one. Kept raw here
      // and resolved against the page URL by the caller, which is the only
      // place that knows what this markup was fetched from.
      href: anchorNear(before, after),
      url: null,
      brand: null,
      packSize: parsePackSize(cleanName),
      inStock: null,
      method: 'microdata',
      confidence: 'medium',
    });
  }
  return rows;
};

/**
 * Last deterministic resort: a price-shaped string with a product-shaped
 * string near it. Marked low confidence because that is exactly what it is.
 */
export const productsFromText = (text = '', { query = '' } = {}) => {
  const terms = String(query).toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  const lines = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const rows = [];
  lines.forEach((line, index) => {
    // Also matches a currency code, because plenty of pages render the symbol
    // in a separate element and the flattened text reads "GBP 1.45".
    const priceMatch = line.match(
      /[£$€]\s?\d+(?:\.\d{1,2})?|\bGBP\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?GBP\b|\b\d{1,3}p\b/i,
    );
    if (!priceMatch) return;
    const price = parseMoney(priceMatch[0]);
    if (price === null || price === 0) return;
    // Strip every price token, not just the matched one: a line reading
    // "£2.15 — £0.94/litre" has no product name left in it, and the name is
    // on the line above. Letters are what make a remainder a name.
    const inline = line
      .replace(/[£$€]\s?\d+(?:\.\d{1,2})?(?:\s*(?:\/|per\s+)\s*[\w.]+)?/gi, ' ')
      .replace(/\bGBP\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?GBP\b/gi, ' ')
      .replace(/\b\d{1,3}p\b/gi, ' ')
      .replace(/[^\p{L}\p{N} .,'&%()-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hasWords = (value) => (value.match(/\p{L}/gu) || []).length >= 4;
    const name = (hasWords(inline) ? inline : lines[index - 1] || '').replace(/\s+/g, ' ').trim();
    if (!hasWords(name)) return;
    // Without a query every £ on the page qualifies, which is noise not data.
    if (terms.length && !terms.some((term) => name.toLowerCase().includes(term))) return;
    rows.push({
      name: name.slice(0, 200),
      price,
      currency: normaliseCurrency(priceMatch[0]),
      url: null,
      brand: null,
      packSize: parsePackSize(name),
      inStock: null,
      unitPrice: parseUnitPrice(line),
      method: 'text',
      confidence: 'low',
    });
  });
  return rows;
};

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Collapse the passes into one list: same product name keeps the
 * highest-confidence reading, then the cheapest. Sorted cheapest first so the
 * caller can take the head without re-sorting.
 */
export const mergeCandidates = (groups = []) => {
  const byName = new Map();
  for (const row of groups.flat()) {
    if (!row?.name || typeof row.price !== 'number') continue;
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    const better = CONFIDENCE_RANK[row.confidence] - CONFIDENCE_RANK[existing.confidence];
    if (better < 0 || (better === 0 && row.price < existing.price)) byName.set(key, row);
  }
  return [...byName.values()].sort((a, b) => a.price - b.price);
};

/**
 * How well a row answers the query. Used to drop the "customers also bought"
 * rail, which is a real price for a product nobody asked about.
 */
export const relevanceScore = (name = '', query = '') => {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const lower = String(name).toLowerCase();
  const hits = terms.filter((term) => lower.includes(term)).length;
  return Math.round((hits / terms.length) * 100) / 100;
};
