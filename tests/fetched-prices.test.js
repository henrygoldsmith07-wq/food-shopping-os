import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productsFromMicrodata, productsFromText } from '../src/server/scrape-parse.js';
import { bestAnswer, isMatch } from '../src/server/search-terms.js';
import { scrapePrices } from '../src/server/price-scraper.js';
import { clearRobotsCache } from '../src/server/robots.js';
import { normaliseMarketRows } from '../src/server/monid-market.js';
import { rowsFromMonidReply } from '../src/server/monid-prices.js';
import { bestPerRetailer } from '../src/lib/shop-ranking.js';
import { cacheableEntry } from '../src/lib/live-prices.js';

const page = (products) => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'ItemList',
  itemListElement: products.map(([name, price, availability]) => ({
    '@type': 'Product', name, offers: { price, priceCurrency: 'GBP', availability },
  })),
})}</script></head><body></body></html>`;

const stubFetch = (html) => vi.fn(async (url) => (String(url).endsWith('/robots.txt')
  ? new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } })
  : new Response(html, { headers: { 'content-type': 'text/html' } })));

beforeEach(() => {
  clearRobotsCache();
  vi.unstubAllEnvs();
});

describe('reading the shelf price off page text', () => {
  it('does not take a unit price printed above the pack price', () => {
    const rows = productsFromText('Heinz Baked Beans 415g\n£0.34/100g\n£1.40', { query: 'baked beans' });
    expect(rows).toEqual([expect.objectContaining({ name: 'Heinz Baked Beans 415g', price: 1.4 })]);
  });

  it('skips the old price on a "was / now" line', () => {
    const inline = productsFromText('Heinz Baked Beans 415g Was £2.00 Now £1.40', { query: 'baked beans' });
    expect(inline).toEqual([expect.objectContaining({ name: 'Heinz Baked Beans 415g', price: 1.4 })]);
    const below = productsFromText('Heinz Baked Beans 415g\nWas £2.00 Now £1.40', { query: 'baked beans' });
    expect(below).toEqual([expect.objectContaining({ name: 'Heinz Baked Beans 415g', price: 1.4 })]);
  });

  it('does not read a multibuy or a saving as the price of one', () => {
    expect(productsFromText('Heinz Baked Beans\nAny 3 for £5', { query: 'baked beans' })).toEqual([]);
    expect(productsFromText('Heinz Baked Beans\nSave 50p', { query: 'baked beans' })).toEqual([]);
  });

  it('never borrows a name from across another product’s price', () => {
    const rows = productsFromText('Branston Beans\n£0.95\n£0.30/100g\n£1.40', { query: 'beans' });
    expect(rows.map((row) => row.price)).toEqual([0.95]);
  });
});

describe('pairing a data-price wrapper with its own card', () => {
  it('reads the name inside each card, not the card before it', () => {
    const rows = productsFromMicrodata(
      '<div data-price="1.45"><h3>Heinz Baked Beans</h3></div>'
      + '<div data-price="2.00"><h3>Branston Beans</h3></div>',
    );
    expect(rows.map((row) => [row.name, row.price])).toEqual([
      ['Heinz Baked Beans', 1.45], ['Branston Beans', 2],
    ]);
  });

  it('still reads an itemprop price after its name', () => {
    const rows = productsFromMicrodata(
      '<li><h3>Heinz Baked Beans</h3><span itemprop="price" content="1.45"></span></li>'
      + '<li><h3>Branston Beans</h3><span itemprop="price" content="0.95"></span></li>',
    );
    expect(rows.map((row) => [row.name, row.price])).toEqual([
      ['Heinz Baked Beans', 1.45], ['Branston Beans', 0.95],
    ]);
  });
});

describe('a food named as the flavour of something else', () => {
  it.each([
    ['Cadbury Dairy Milk Chocolate Bar 45g', 'milk'],
    ['Milk Chocolate Digestives', 'milk'],
    ['Heinz Tomato Ketchup', 'tomatoes'],
    ['Napolina Tomato Puree', 'tomatoes'],
    ['Chicken Flavour Noodles', 'chicken'],
    ['Banana Bread', 'bananas'],
    ['Apple Pies x6', 'apples'],
    ['Tomato Pasta Sauces', 'tomatoes'],
    ['Cheese & Onion Crisps', 'onions'],
  ])('rejects "%s" for "%s"', (name, query) => {
    expect(isMatch(name, query)).toBe(false);
  });

  it.each([
    ['Tesco Semi Skimmed Milk 4 Pints', 'milk'],
    ['Heinz Baked Beans In Tomato Sauce 415g', 'baked beans'],
    ['John West Tuna Chunks in Sunflower Oil', 'tuna'],
    ['British Chicken Breast Fillets 300g', 'chicken'],
    ['Oxo Chicken Stock Cubes', 'chicken stock'],
    ['Cadbury Dairy Milk Chocolate Bar', 'milk chocolate'],
    ['Apple Pies x6', 'apple pies'],
    ['Pink Lady Apples Crisp & Sweet', 'apples'],
  ])('keeps "%s" for "%s"', (name, query) => {
    expect(isMatch(name, query)).toBe(true);
  });
});

describe('choosing the answer, not just the cheapest ticket', () => {
  it('prefers the closer match over a cheaper partial one', () => {
    const best = bestAnswer([
      { name: 'Skimmed Milk 2.27L', price: 1.1 },
      { name: 'Semi Skimmed Milk 2.27L', price: 1.25 },
    ], 'semi skimmed milk');
    expect(best).toMatchObject({ name: 'Semi Skimmed Milk 2.27L', price: 1.25, relevance: 1 });
  });

  it('prefers a line in stock, and falls back to one that is not', () => {
    const inStock = { name: 'Baked Beans', price: 0.9, inStock: true, relevance: 1 };
    const gone = { name: 'Baked Beans', price: 0.5, inStock: false, relevance: 1 };
    expect(bestAnswer([gone, inStock], 'baked beans')).toBe(inStock);
    expect(bestAnswer([gone], 'baked beans')).toBe(gone);
  });

  it('is null when nothing is priced', () => {
    expect(bestAnswer([{ name: 'Baked Beans', price: 0 }], 'baked beans')).toBeNull();
    expect(bestAnswer([], 'baked beans')).toBeNull();
  });

  it('scrapePrices reports the matching product as best', async () => {
    const out = await scrapePrices('semi skimmed milk', {
      retailerIds: ['tesco'],
      fetchImpl: stubFetch(page([
        ['Skimmed Milk 2.27L', '1.10', 'https://schema.org/InStock'],
        ['Semi Skimmed Milk 2.27L', '1.25', 'https://schema.org/InStock'],
      ])),
      allowModel: false,
      gapMs: 0,
    });
    expect(out.cheapest[0].price).toBe(1.1);
    expect(out.best).toMatchObject({ name: 'Semi Skimmed Milk 2.27L', price: 1.25 });
  });

  it('the per-shop table picks the same row', () => {
    const rows = bestPerRetailer({ cheapest: [
      { retailerId: 'tesco', name: 'Skimmed Milk', price: 1.1, relevance: 0.67 },
      { retailerId: 'tesco', name: 'Semi Skimmed Milk', price: 1.25, relevance: 1 },
    ] });
    expect(rows).toEqual([expect.objectContaining({ name: 'Semi Skimmed Milk' })]);
  });
});

describe('price strings from hosted endpoints', () => {
  it('reads the first amount from a Monid price string', () => {
    const rows = rowsFromMonidReply({ products: [
      { name: 'Baked Beans', price: '£1.50 (£3.00/kg)' },
      { name: 'Spaghetti', price: 'GBP 0.75' },
    ] }, { retailer: null, query: 'beans' });
    expect(rows.map((row) => row.price)).toEqual([1.5, 0.75]);
  });

  it('keeps the thousands in a Google Shopping price', () => {
    const rows = normaliseMarketRows([{ title: 'Champagne Magnum', price: '£1,049.00' }]);
    expect(rows[0].price).toBe(1049);
  });
});

describe('what the 3h cache keeps', () => {
  it('keeps a price, and a clean "no shop had it"', () => {
    expect(cacheableEntry({ best: { price: 1 }, unanswered: [{ status: 'aborted' }] })).toBe(true);
    expect(cacheableEntry({ best: null, unanswered: [{ status: 'no-match' }, { status: 'declined' }] })).toBe(true);
  });

  it('does not keep an empty answer from a check that was cut short', () => {
    for (const status of ['aborted', 'rate-limited', 'unreachable', 'network-blocked']) {
      expect(cacheableEntry({ best: null, unanswered: [{ status: 'no-match' }, { status }] })).toBe(false);
    }
  });
});
