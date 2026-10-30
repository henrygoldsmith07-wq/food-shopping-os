import { describe, expect, it } from 'vitest';
import { productsFromPageState, stripMarkdown, mergeCandidates } from '../src/server/scrape-parse.js';
import { deterministicPass, scrapeRetailer } from '../src/server/price-scraper.js';
import { isMatch, matchScore, bestAnswer } from '../src/server/search-terms.js';
import { observationsFor } from '../src/server/retailer-providers.js';
import { packsToBuy, typicalPriceFor } from '../src/data/typical-prices.js';
import { rowEstimate } from '../src/lib/basket-estimate.js';
import { shoppingNameKey } from '../src/lib/shopping-names.js';
import { RETAILERS, retailerById } from '../src/data/retailers.js';
import { pickObserved } from '../src/lib/observed-prices.js';

/** A cut-down Ocado-platform search page, shaped like groceries.morrisons.com. */
const ocadoPage = (entities) => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: Object.values(entities).map((entity, position) => ({
    '@type': 'ListItem', position, url: `https://groceries.morrisons.com/products/slug/${entity.retailerProductId}`,
  })),
})}</script></head><body><div id="root"></div>
<script>window.__INITIAL_STATE__=${JSON.stringify({ data: { products: { productEntities: entities } }, banner: { name: 'Offers', price: '£1' } })}</script>
</body></html>`;

const entity = (id, name, amount, extra = {}) => ({
  productId: `uuid-${id}`,
  retailerProductId: id,
  brand: 'Morrisons',
  available: true,
  name,
  price: {
    original: { amount: String(amount + 1), currency: 'GBP' },
    current: { amount: String(amount), currency: 'GBP' },
    unit: { label: 'fop.price.per.kg', current: { amount: '91.5', currency: 'GBX' } },
  },
  size: { value: '4 x 410g' },
  ...extra,
});

describe('reading prices from page hydration state', () => {
  const html = ocadoPage({
    a: entity('105859348', 'Morrisons Baked Beans 4x410g', 1.5, { offer: { description: 'Unbeatable Price' } }),
    b: entity('107697944', 'Branston Baked Beans', 3.75, { size: { value: '6 x 410g' } }),
    c: entity('100000001', 'Heinz Beanz 415g', 1.4, { available: false, size: { value: '415g' } }),
  });

  it('takes the current ticket, pack size, unit price, link and stock from the state', () => {
    const rows = productsFromPageState(html);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: 'Morrisons Baked Beans 4x410g',
      price: 1.5,
      packSize: '4x410g',
      unitPrice: { value: 0.92, unit: 'kg' },
      offer: 'Unbeatable Price',
      inStock: true,
      url: 'https://groceries.morrisons.com/products/slug/105859348',
      method: 'page-state',
      confidence: 'high',
    });
    // A name without a size borrows the size field rather than losing it.
    expect(rows[1].packSize).toBe('6x410g');
    expect(rows[2].inStock).toBe(false);
  });

  it('ignores objects that have a name and a price but are not products', () => {
    expect(productsFromPageState(html).some((row) => row.name === 'Offers')).toBe(false);
  });

  it('is what the deterministic pass reads first', () => {
    const { rows } = deterministicPass({ html }, 'baked beans');
    expect(rows.filter((row) => isMatch(row.name, 'baked beans')).map((row) => row.method)).toContain('page-state');
  });

  it('survives state written as JavaScript rather than JSON', () => {
    const js = '<script>window.__INITIAL_STATE__={"x":{"retailerProductId":"1","name":"Milk 2 Pints","price":{"current":{"amount":"1.45","currency":"GBP"}},"extra":undefined}}</script>';
    expect(productsFromPageState(js)).toMatchObject([{ name: 'Milk 2 Pints', price: 1.45 }]);
  });

  it('keeps two packs that share a name as two products', () => {
    const merged = mergeCandidates([[
      { name: 'Branston Baked Beans', price: 3, packSize: '4x410g', confidence: 'high' },
      { name: 'Branston Baked Beans', price: 3.75, packSize: '6x410g', confidence: 'high' },
    ]]);
    expect(merged).toHaveLength(2);
  });
});

describe('rendered-markdown product names', () => {
  it('drops image labels, link targets and truncated brackets', () => {
    expect(stripMarkdown('[![Image 3: Heinz Beans 415g](https://x/i.jpg)](https://x/p/1) £1.40')).toBe('Heinz Beans 415g £1.40');
    expect(stripMarkdown('[![Image 7: Baked Beans in a Rich, Thick, To')).toBe('Baked Beans in a Rich, Thick, To');
  });
});

describe('matching the product that was asked for', () => {
  it('does not find a word inside another word', () => {
    expect(isMatch('Dopamine Chamber', 'ham')).toBe(false);
    expect(isMatch('Pork Shoulder Steaks', 'tea bags')).toBe(false);
    expect(isMatch('Serrano Ham Slices', 'ham')).toBe(true);
  });

  it('does not treat a one-letter change at the start as a spelling variant', () => {
    expect(isMatch('Whipped Toffee', 'coffee')).toBe(false);
    expect(isMatch('Greek Yogurt', 'greek yoghurt')).toBe(true);
  });

  it('prefers the plain ingredient over a cooked or flavoured version at the same price rank', () => {
    expect(matchScore('Tikka Chicken Breast Pieces 240g', 'chicken breast'))
      .toBeLessThan(matchScore('British Chicken Breast Fillets 330g', 'chicken breast'));
    const best = bestAnswer([
      { name: 'Savers Tikka Chicken Breast Pieces 240g', price: 1.99 },
      { name: 'British Chicken Breast Fillets 330g', price: 2.51 },
    ], 'chicken breast');
    expect(best.name).toBe('British Chicken Breast Fillets 330g');
    expect(matchScore('Roast Chicken Breast', 'roast chicken breast')).toBe(1);
  });

  it('reads a snack made from the food as a different product', () => {
    expect(isMatch('Banana Chips', 'bananas')).toBe(false);
  });
});

describe('retailer configuration', () => {
  it('searches the Ocado-platform shops with the parameter they still honour', () => {
    expect(retailerById('morrisons').search('baked beans')).toBe('https://groceries.morrisons.com/search?q=baked%20beans');
    expect(retailerById('ocado').search('milk')).toBe('https://www.ocado.com/search?q=milk');
  });

  it('sends Asda searches to the domain groceries now live on', () => {
    expect(retailerById('asda').search('milk')).toBe('https://www.asda.com/groceries/search/milk');
  });

  it('does not spend a fetch on a shop with no online shelf prices', async () => {
    const lidl = RETAILERS.find((entry) => entry.id === 'lidl');
    let calls = 0;
    const result = await scrapeRetailer(lidl, 'milk', { fetchImpl: async () => { calls += 1; throw new Error('no'); } });
    expect(calls).toBe(0);
    expect(result.status).toBe('no-search-url');
    expect(result.note).toMatch(/does not sell groceries online/);
  });
});

describe('pricing the quantity a row needs', () => {
  it('buys as many listings as the need takes, not one per item counted', () => {
    expect(packsToBuy('6', { price: 1.85, name: 'Free Range Eggs 6 pack' }, 'eggs')).toBe(1);
    expect(packsToBuy('12', { price: 1.85, name: 'Free Range Eggs 6 Pack' }, 'eggs')).toBe(2);
    expect(packsToBuy('2 tins', { price: 1.6, packSize: '4x400g', name: 'Chopped Tomatoes' }, 'chopped tomatoes')).toBe(1);
    expect(packsToBuy('2 tins', { price: 0.45, packSize: '400g', name: 'Chopped Tomatoes' }, 'chopped tomatoes')).toBe(2);
    expect(packsToBuy('750 g', { price: 3.2, packSize: '500g', name: 'Beef Mince' }, 'beef mince')).toBe(2);
    expect(packsToBuy('3', { price: 0.85, packSize: '1kg', name: 'Brown Onions' }, 'onions')).toBe(1);
    expect(packsToBuy('3', { price: 0.3, name: 'Lemons' }, 'lemons')).toBe(3);
    expect(packsToBuy('', { price: 3, name: 'Heinz Baked Beans 4x415g' }, 'baked beans')).toBe(1);
  });

  it('reads an unlabelled box from its price rather than charging six of them', () => {
    // £1.85 is about six eggs at a typical 31p each.
    expect(packsToBuy('6', { price: 1.85, name: 'Free Range Eggs' }, 'eggs')).toBe(1);
  });

  it('applies to the basket estimate for live and community prices', () => {
    const key = shoppingNameKey('eggs');
    const live = { [key]: { best: { price: 1.85, name: 'Medium Free Range Eggs 6 Pack', retailer: 'Morrisons' } } };
    expect(rowEstimate({ name: 'eggs', qty: '6' }, { live })).toMatchObject({ price: 1.85, source: 'live' });
    const observed = { [key]: { price: 2.89, name: '12 Large Free Range Eggs', packSize: '12', store: 'Lidl' } };
    expect(rowEstimate({ name: 'eggs', qty: '6' }, { observed })).toMatchObject({ price: 2.89, source: 'observed' });
  });
});

describe('typical prices that used to land on the wrong pattern', () => {
  it('prices the food named, not a word inside it', () => {
    expect(typicalPriceFor('pineapple')).toMatchObject({ price: 1.2 });
    expect(typicalPriceFor('grapefruit')).toMatchObject({ pack: 'each' });
    expect(typicalPriceFor('strong white bread flour')).toMatchObject({ pack: '1.5 kg' });
    expect(typicalPriceFor('mince pies')).toMatchObject({ pack: '6' });
    expect(typicalPriceFor('buttermilk')).toMatchObject({ pack: '284 ml' });
  });
});

describe('community observations', () => {
  const raw = (name, price, date, extra = {}) => ({
    price, currency: 'GBP', date, product: { product_name: name, code: '5000000000001', quantity: '400g' },
    location: { osm_brand: 'Lidl' }, ...extra,
  });
  const now = Date.parse('2026-10-30T12:00:00Z');

  it('matches by name, drops the typo outliers and ranks best match then newest', () => {
    const rows = observationsFor([
      raw('Chopped Tomatoes', 0.45, '2026-01-25'),
      raw('Chopped Tomatoes In Tomato Juice', 0.43, '2026-08-19'),
      raw('Italian Finely Chopped Tomatoes', 90, '2026-10-24'),
      raw('Cherry Tomatoes', 0.85, '2026-10-01'),
      raw('Chopped Tomatoes', 0.5, '2023-01-01'),
    ], 'chopped tomatoes', { now });
    expect(rows.map((row) => row.price)).toEqual([0.43, 0.45]);
    expect(rows[0]).toMatchObject({ store: 'Lidl', packSize: '400g', source: 'open-prices' });
  });

  it('the client takes the best-ranked fresh row, not the cheapest', () => {
    const picked = pickObserved([
      { name: 'Semi Skimmed Milk 4 pints', price: 1.65, isStale: false },
      { name: 'Semi-Skimmed Goats Milk', price: 0.47, isStale: false },
    ]);
    expect(picked.price).toBe(1.65);
    expect(pickObserved([{ price: 1, isStale: true }, { price: 2, isStale: false }]).price).toBe(2);
  });
});
