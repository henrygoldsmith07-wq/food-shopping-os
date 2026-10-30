/**
 * Re-price the typical-price table from a live shelf.
 *
 *   npm run refresh:typical-prices
 *   npm run refresh:typical-prices -- --dry-run --limit 10
 *
 * For every row of the table this searches Morrisons — the one major grocer
 * whose search pages answer a polite, robots-respecting crawler — picks the
 * listing closest to the table's pack, scales it to that pack, and converts
 * it back to the mid-range baseline with the shop index. The result is written
 * to src/data/typical-prices.refreshed.js, which the table prefers for three
 * months and then ignores.
 *
 * A row is only replaced when the shelf agrees with the written figure to
 * within a sane band. Anything outside it is far more likely to be a wrong
 * product than a 250% price rise, and is reported for a human to look at.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRICES, listingContents, packAmount } from '../src/data/typical-prices.js';
import { shopIndexFor } from '../src/data/shop-index.js';
import { retailerById } from '../src/data/retailers.js';
import { scrapeRetailer } from '../src/server/price-scraper.js';

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(arg('limit', PRICES.length));
const GAP_MS = Number(arg('gap', 1500));

/** Where a pattern's first alternative is not something a shop search understands. */
const QUERY_OVERRIDES = {
  'greek yog(h)?urt|natural yog(h)?urt|yog(h)?urt|skyr|kefir': 'natural yogurt',
  'chill?ies|chill?i\\b|chili|jalape': 'red chillies',
  'tomato pur[eé]e': 'tomato puree',
  '\\beggs?\\b': 'free range eggs',
  'milk': 'semi skimmed milk 4 pints',
  'butter\\b|margarine|\\bspread\\b': 'butter',
  'cheddar|\\bcheese\\b': 'mature cheddar',
  '\\boil\\b': 'vegetable oil',
  'bread|loaf|toast': 'white bread',
  '\\brice\\b': 'long grain rice',
  'flour': 'plain flour',
  'sugar': 'granulated sugar',
  'marinade|glaze|chimichurri|dressing|sauce': 'pasta sauce',
  'curry powder|garam masala|paprika|cumin|cinnamon|turmeric|oregano|spice|seasoning|chilli flakes|chili flakes|dried herbs|nutmeg|mixed herbs|bay leaves': 'ground cumin',
  'chicken|turkey': 'chicken breast fillets',
  'steak|beef': 'beef steak',
  'tomato|tomatoes': 'tomatoes',
  'onions?|shallots?': 'brown onions',
  'potato|potatoes': 'white potatoes 2kg',
  'peppers?\\b': 'red pepper',
  'coriander|parsley|basil|mint|dill|thyme|rosemary|sage|chives|fresh herbs|herbs': 'fresh coriander',
  'rocket|salad|watercress|leaves': 'salad leaves',
  'stock|bouillon|gravy': 'stock cubes',
  'detergent|laundry|washing (powder|liquid|capsules)': 'laundry detergent',
  'strawberr|raspberr|blueberr|blackberr|berries|cherries': 'strawberries',
  juice: 'orange juice',
  '\\btea\\b|teabags': 'tea bags',
  lamb: 'lamb leg steaks',
  'pork|gammon': 'pork loin steaks',
  'whey|protein powder': 'whey protein',
  'cereal|cornflakes|weetabix|bran flakes|shreddies|rice krispies': 'cornflakes',
  chocolate: 'milk chocolate bar',
  'beer|lager|cider|\\bale\\b': 'lager 4 x 440ml',
  'wine|prosecco': 'red wine',
  seeds: 'pumpkin seeds',
  '\\boats?\\b|porridge': 'porridge oats',
  'basmati|jasmine rice|arborio|risotto rice|sushi rice': 'basmati rice',
  'butternut|squash|pumpkin': 'butternut squash',
  '\\bjam\\b|marmalade': 'strawberry jam',
  '\\bsalt\\b': 'table salt',
  tuna: 'tuna steaks',
  '\\bcod\\b|haddock|basa|pollock|hake|white fish|sea ?bass|sea bream': 'cod fillets',
  salmon: 'salmon fillets',
  duck: 'duck breasts',
  'mackerel|sardines|trout|kippers': 'mackerel fillets',
  coffee: 'instant coffee',
  '\\bcakes?\\b|brownies?|muffins?': 'chocolate muffins',
};

export const queryFor = (source) => QUERY_OVERRIDES[source] || source
  .split('|')[0]
  .replace(/\\b/g, '')
  .replace(/\(\?:/g, '(')
  .replace(/\[([^\]])[^\]]*\]/g, '$1')
  .replace(/\(([^)]*)\)\?/g, '')
  .replace(/(\w)\?/g, '$1')
  .replace(/[()\\?*+^$.]/g, '')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const VARIANT = /\b(the best|savers|organic|free from|mini|snap|cauliflower|plant ?based|reduced fat|light)\b/i;

/**
 * The price of the table's pack, read off the shop's closest listing.
 * Null when no listing is close enough to say.
 *
 * The table is own-brand, so own-brand listings are preferred whenever the
 * shop has one: a branded tin beside it is a different price point, not a
 * different reading of the same one.
 */
export const priceForPack = (rows, pack, { each = false } = {}, { ownBrand = 'morrisons' } = {}) => {
  const top = Math.max(0, ...rows.map((row) => row.relevance ?? 0));
  const relevant = rows.filter((row) => (row.relevance ?? 0) >= top - 0.05 && row.inStock !== false && row.price > 0);
  const own = relevant.filter((row) => String(row.name || '').toLowerCase().startsWith(ownBrand));
  // The table is the standard own-brand line: not the premium range, not the
  // budget range, and not a variant (mini, organic, cauliflower gnocchi).
  const standard = own.filter((row) => !VARIANT.test(row.name || ''));
  const pool = standard.length ? standard : own.length ? own : relevant;
  if (!pool.length) return null;
  const sized = pool.map((row) => ({ row, holds: listingContents(row.packSize, row.name) }));
  const closest = (entries) => entries
    .filter((entry) => entry.ratio >= 0.67 && entry.ratio <= 1.5)
    .sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)) || a.price - b.price)[0] || null;

  if (each) {
    // One loose item: a counted pack divided down, or a loose listing as is.
    // A listing sold by weight says nothing reliable about one item.
    const singles = sized
      .filter(({ holds }) => holds.count || !holds.grams)
      .map(({ row, holds }) => ({ row, price: holds.count ? row.price / holds.count : row.price }));
    if (!singles.length) return null;
    const price = median(singles.map((entry) => entry.price));
    return { price, from: singles.find((entry) => entry.price === price)?.row || singles[0].row };
  }
  const targetGrams = packAmount(pack);
  if (targetGrams) {
    const best = closest(sized
      .filter(({ holds }) => holds.grams)
      .map(({ row, holds }) => ({ row, ratio: holds.grams / targetGrams, price: row.price * (targetGrams / holds.grams) })));
    return best ? { price: best.price, from: best.row } : null;
  }
  const targetCount = /^\d+$/.test(pack.trim()) ? Number(pack) : null;
  if (targetCount) {
    const best = closest(sized
      .filter(({ holds }) => holds.count)
      .map(({ row, holds }) => ({ row, ratio: holds.count / targetCount, price: row.price * (targetCount / holds.count) })));
    return best ? { price: best.price, from: best.row } : null;
  }
  // A jar, a bottle, a bunch: one listing is one pack. Multipacks would say
  // more about the multipack than the pack.
  const singles = sized.filter(({ holds }) => !(holds.count > 1)).map(({ row }) => row);
  if (!singles.length) return null;
  const price = median(singles.map((row) => row.price));
  return { price, from: singles.find((row) => row.price === price) || singles[0] };
};

const main = async () => {
  const morrisons = retailerById('morrisons');
  const index = shopIndexFor('Morrisons');
  const prices = {};
  const report = { updated: 0, skipped: [] };
  for (const [pattern, written, pack, options = {}] of PRICES.slice(0, LIMIT)) {
    const query = queryFor(pattern.source);
    const result = await scrapeRetailer(morrisons, query, { allowModel: false, retryGapMs: GAP_MS });
    const picked = result.status === 'ok' ? priceForPack(result.rows, pack, options) : null;
    const baseline = picked ? Math.round((picked.price / index.factor) * 100) / 100 : null;
    const sane = baseline && baseline >= written * 0.5 && baseline <= written * 2;
    const line = `${query.padEnd(28)} ${pack.padEnd(18)} £${written.toFixed(2)} → `;
    if (sane) {
      prices[pattern.source] = {
        price: baseline,
        from: { name: picked.from.name, price: picked.from.price, packSize: picked.from.packSize || null, url: picked.from.url || null },
      };
      report.updated += 1;
      console.log(`${line}£${baseline.toFixed(2)}  (${picked.from.name} £${picked.from.price})`);
    } else {
      report.skipped.push(query);
      console.log(`${line}kept  (${result.status}${picked ? `, shelf said £${baseline}` : ''})`);
    }
    await new Promise((resolve) => { setTimeout(resolve, GAP_MS); });
  }
  console.log(`\n${report.updated}/${Math.min(LIMIT, PRICES.length)} rows re-priced from Morrisons (index ${index.factor}).`);
  if (DRY_RUN) return;
  const OUT = fileURLToPath(new URL('../src/data/typical-prices.refreshed.js', import.meta.url));
  const body = {
    generatedAt: new Date().toISOString(),
    source: 'Morrisons search pages, scaled to the table pack and divided by the Morrisons shop index',
    shopIndexFactor: index.factor,
    prices,
  };
  writeFileSync(OUT, `// Written by scripts/refresh-typical-prices.mjs — do not edit by hand.\nexport const REFRESHED_TYPICAL_PRICES = ${JSON.stringify(body, null, 2)};\n`);
  console.log(`Wrote ${OUT}`);
};

const invokedDirectly = () => {
  try {
    return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
};

if (invokedDirectly()) await main();
