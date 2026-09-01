const STOP_WORDS = new Set(['the', 'pack', 'packet', 'size', 'each', 'of', 'tesco', 'aldi', 'asda', 'lidl', 'sainsburys', 'sainsbury', 'cowbelle', 'heinz', 'own', 'brand']);
const VARIANT_WORDS = new Set(['organic', 'light', 'free', 'free-range', 'wholemeal', 'wholegrain', 'reduced', 'salt', 'sugar', 'vegan', 'vegetarian', 'smoked', 'plain', 'original', 'hot', 'mild', 'british']);

const clean = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (value) => value === 'beanz' ? 'bean' : value.endsWith('ies') ? `${value.slice(0, -3)}y` : value.endsWith('s') && !value.endsWith('ss') ? value.slice(0, -1) : value;
const tokens = (value) => clean(value).split(' ').filter(Boolean).map(singular);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const UNIT_TO_GRAMS = { g: 1, kg: 1000, ml: 1, l: 1000 };
const parseQuantity = (text) => {
  const source = clean(text);
  const matches = [...source.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/gi)];
  const quantities = matches.map((match) => ({ value: Number(match[1]), unit: match[2].toLowerCase() }));
  const packs = source.match(/\b(\d+)\s*(?:x|pack|packs)\b/i);
  const count = packs ? Number(packs[1]) : 1;
  if (!quantities.length) return { count, value: null, unit: null, total: null };
  const first = quantities[0];
  const factor = UNIT_TO_GRAMS[first.unit];
  return { count, value: first.value, unit: first.unit, total: factor ? first.value * count * factor : null };
};

export const normaliseProduct = (offer = {}) => {
  const rawName = offer.name || offer.product || offer.title || '';
  const words = tokens(rawName);
  const brand = clean(offer.brand || '').trim();
  const quantity = parseQuantity(`${rawName} ${offer.packSize || ''}`);
  const variants = [...new Set(words.filter((word) => VARIANT_WORDS.has(word)))];
  const productWords = words.filter((word) => !STOP_WORDS.has(word) && !VARIANT_WORDS.has(word) && !/^\d/.test(word) && !/^(kg|g|ml|l|x)$/.test(word));
  return {
    raw: rawName,
    brand: brand || null,
    product: productWords.join(' '),
    variant: variants.sort().join(' ') || null,
    packCount: number(offer.packCount) ?? quantity.count,
    packValue: number(offer.packValue) ?? quantity.value,
    packUnit: offer.packUnit || quantity.unit,
    totalQuantity: number(offer.totalQuantity) ?? quantity.total,
    unitPrice: number(offer.unitPrice) ?? null,
  };
};

const same = (a, b) => a && b && a === b;

export const classifyProductMatch = (left, right) => {
  const a = normaliseProduct(left);
  const b = normaliseProduct(right);
  const reasons = [];
  if (!a.product || !b.product) return { classification: 'unknown', confidence: 0, equivalent: false, left: a, right: b, reasons: ['product name is incomplete'] };
  // Different brands can still be comparable when the underlying product and variant match.
  // Brand is retained as provenance, but it must not hide the like-for-like unit-price answer.
  if (a.brand && b.brand && a.brand !== b.brand && a.product !== b.product) return { classification: 'unknown', confidence: 0.05, equivalent: false, left: a, right: b, reasons: ['different brands'] };
  if (a.variant !== b.variant && a.variant && b.variant) return { classification: 'approximation', confidence: 0.35, equivalent: false, left: a, right: b, reasons: ['variant differs'] };
  const stripBrand = (value, brand) => brand ? value.replace(new RegExp(`^${brand}\\s+`), '') : value;
  const productEquivalent = a.product === b.product
    || stripBrand(a.product, a.brand) === stripBrand(b.product, b.brand);
  if (!productEquivalent) return { classification: 'unknown', confidence: 0.15, equivalent: false, left: a, right: b, reasons: ['product description differs'] };
  if (a.totalQuantity !== null && b.totalQuantity !== null && a.totalQuantity !== b.totalQuantity) return { classification: 'approximation', confidence: 0.45, equivalent: false, left: a, right: b, reasons: ['total quantity differs'] };
  if (a.brand && b.brand && same(a.brand, b.brand) && a.totalQuantity !== null && b.totalQuantity !== null) {
    reasons.push('brand, product and total quantity agree');
    return { classification: 'exact', confidence: 0.99, equivalent: true, left: a, right: b, reasons };
  }
  if (productEquivalent && a.brand === b.brand && a.totalQuantity !== null && b.totalQuantity !== null) {
    reasons.push('brand, product and total quantity agree');
    return { classification: 'exact', confidence: 0.99, equivalent: true, left: a, right: b, reasons };
  }
  if (productEquivalent && (a.brand === b.brand || !a.brand || !b.brand)) {
    reasons.push('product and variant agree; some pack evidence is missing');
    return { classification: 'likely equivalent', confidence: 0.78, equivalent: true, left: a, right: b, reasons };
  }
  return { classification: 'unknown', confidence: 0.2, equivalent: false, left: a, right: b, reasons: ['insufficient evidence'] };
};

export const matchLabel = (classification) => ({ exact: 'Exact match', 'likely equivalent': 'Likely equivalent', approximation: 'Approximation', unknown: 'Unknown' }[classification] || 'Unknown');

/**
 * Whether a ranking may treat two rows as one shopping decision.
 *
 * The same product in a different pack size is exactly what per-unit
 * comparison exists for — a 4-pack is not a different product. A different
 * brand, variant or description is a different product, and ranking it as if
 * it were the same item is the miscomparison this module exists to prevent.
 */
export const comparableForRanking = (match) => match.classification === 'exact'
  || match.classification === 'likely equivalent'
  || (match.classification === 'approximation'
    && (match.reasons || []).includes('total quantity differs'));

/** The short words for why two rows are not the same product. */
export const matchDifferenceLabel = (match) => ({
  'different brands': 'different brand',
  'variant differs': 'different variant',
  'product description differs': 'not the same product',
  'insufficient evidence': 'not enough to match',
  'product name is incomplete': 'unnamed product',
}[(match?.reasons || [])[0]] || 'not the same product');

/**
 * The row the others should be judged against: the one most rows agree with,
 * cheapest ticket on ties, first on further ties — so the same input always
 * picks the same reference.
 */
export const majorityReference = (rows = []) => {
  const counts = rows.map((row, i) => rows.reduce(
    (sum, other, j) => (i === j || !comparableForRanking(classifyProductMatch(row, other)) ? sum : sum + 1),
    0,
  ));
  let best = 0;
  counts.forEach((count, i) => {
    if (count > counts[best]
      || (count === counts[best] && Number(rows[i]?.price) < Number(rows[best]?.price))) best = i;
  });
  return best;
};
