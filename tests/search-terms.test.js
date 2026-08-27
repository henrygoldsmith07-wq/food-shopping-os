import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  contentTerms, isMatch, isQuantity, matchScore, missBudget, searchQueries, tokenise,
} from '../src/server/search-terms.js';
import { clearRobotsCache } from '../src/server/robots.js';
import { scrapeRetailer } from '../src/server/price-scraper.js';

describe('turning a shopping list line into something a shop can find', () => {
  it('folds the punctuation a search box cannot use', () => {
    expect(tokenise('Semi-Skimmed Milk')).toEqual(['semi', 'skimmed', 'milk']);
    expect(tokenise("Sainsbury's Crème Fraîche")).toEqual(['sainsburys', 'creme', 'fraiche']);
    expect(tokenise('tomatoes, chopped')).toEqual(['tomatoes', 'chopped']);
  });

  it('knows a quantity from a product', () => {
    for (const token of ['2', '415g', '1.13l', 'x4', '6pk', 'pints', 'kg']) {
      expect(isQuantity(token), token).toBe(true);
    }
    for (const token of ['milk', 'heinz', 'beans']) {
      expect(isQuantity(token), token).toBe(false);
    }
  });

  it('keeps only the words that identify the food', () => {
    expect(contentTerms('2 large tins of Heinz Baked Beans 415g'))
      .toEqual(['heinz', 'baked', 'beans']);
  });

  it('drops the quantity on the second rung, which is why a real product comes back', () => {
    // "2 pints" excludes every 1.13L bottle, and 1.13L is how the bottle is named.
    expect(searchQueries('2 pints semi-skimmed milk'))
      .toEqual(['2 pints semi skimmed milk', 'semi skimmed milk']);
  });

  it('drops a bracketed note outright — no shop prints it on a label', () => {
    expect(searchQueries('chicken breasts (organic)')).toEqual(['chicken breasts']);
  });

  it('adds a third rung only to shed a note written after a comma', () => {
    expect(searchQueries('milk, get the blue one')).toEqual(['milk get blue one', 'milk']);
    // A coherent phrase is not lopped down further just to have a third rung.
    expect(searchQueries('organic free range large eggs box of 6'))
      .toEqual(['organic free range eggs 6', 'organic free range eggs']);
  });

  it('costs exactly one fetch for a plain word', () => {
    expect(searchQueries('milk')).toEqual(['milk']);
  });

  it('never sends an empty search, even for a line that is all quantity', () => {
    expect(searchQueries('1kg')).toEqual(['1kg']);
    expect(searchQueries('  ')).toEqual([]);
  });
});

describe('judging whether a row is the product that was asked for', () => {
  it('ignores the quantity, so a correct bottle is not punished for its size', () => {
    expect(matchScore('Tesco British Semi Skimmed Milk 1.13L/2 Pints', '2 pints semi-skimmed milk')).toBe(1);
  });

  it('forgives how shops spell', () => {
    expect(matchScore('Heinz Baked Beanz In Tomato Sauce 415G', 'Heinz Baked Beans 415g x4')).toBe(1);
    expect(matchScore('Chicken Breast Fillets 640G', 'chicken breasts')).toBe(1);
  });

  it('will not forgive a different food that is spelt similarly', () => {
    // Three letters is where one edit stops being a spelling and starts being
    // a different thing on the shelf.
    expect(matchScore('Ready Salted Crisps', 'oat')).toBe(0);
    expect(matchScore('Pork Loin Steaks', 'corn')).toBe(0);
  });

  it('requires the food itself, not just a partial overlap', () => {
    // The "customers also bought" rail: real prices, wrong products.
    expect(matchScore('Milk Chocolate Digestives', 'semi skimmed milk yoghurt')).toBe(0);
    expect(isMatch('Milk Chocolate Digestives', 'semi skimmed milk yoghurt')).toBe(false);
  });

  it('will not let a two-word query be satisfied by one of its words', () => {
    // A chocolate bar scores 0.5 against "skimmed milk" — above any sane
    // ratio floor for a longer query, and still the wrong food entirely.
    expect(matchScore('Cadbury Dairy Milk Chocolate', 'skimmed milk')).toBe(0.5);
    expect(isMatch('Cadbury Dairy Milk Chocolate', 'skimmed milk')).toBe(false);
    expect(isMatch('Tesco Skimmed Milk 2.27L', 'skimmed milk')).toBe(true);
  });

  it('allows one word in three to be the shop’s own phrasing', () => {
    expect(missBudget(1)).toBe(0);
    expect(missBudget(2)).toBe(0);
    expect(missBudget(3)).toBe(1);
    expect(missBudget(6)).toBe(2);
    // "British" is Tesco's word, not the shopper's; "semi skimmed milk" holds.
    expect(isMatch('Tesco British Skimmed Milk 1.13L', 'semi skimmed milk')).toBe(true);
  });

  it('scores against the product, not against the note to self', () => {
    expect(matchScore('Tesco Whole Milk 2.27L', 'milk, get the blue one')).toBe(1);
    expect(matchScore('Tesco Whole Milk 2.27L', 'milk (the blue one)')).toBe(1);
  });

  it('says nothing matches nothing', () => {
    expect(matchScore('Milk', '')).toBe(0);
    expect(matchScore('', 'milk')).toBe(0);
  });
});

describe('broadening the search when a shop finds nothing', () => {
  const retailer = {
    id: 'test',
    name: 'Test Shop',
    search: (query) => `https://shop.test/search?q=${encodeURIComponent(query)}`,
  };
  const robots = 'User-agent: *\nAllow: /\n';
  const page = (name, price) => `<html><body><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name, offers: { price, priceCurrency: 'GBP' },
  })}</script></body></html>`;
  const res = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });

  /**
   * The distinct queries this shop was asked, in order.
   *
   * Deduped because one query can still be fetched more than once: the
   * strategy ladder retries the same URL through a renderer when a plain
   * fetch comes back without prices. That is a different mechanism from the
   * query ladder, and these tests are about the query ladder.
   */
  const searches = (fetchImpl) => [...new Set(fetchImpl.mock.calls
    .map(([url]) => String(url))
    .filter((url) => !url.endsWith('/robots.txt'))
    .map((url) => decodeURIComponent(new URL(url.replace(/^https:\/\/r\.jina\.ai\//, '')).searchParams.get('q'))))];

  beforeEach(() => clearRobotsCache());

  it('tries a broader query when the shop answered but had nothing', async () => {
    // The shop stocks the milk; it just does not list it under "2 pints".
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) return res(robots);
      return target.includes('2%20pints') || target.includes('2+pints')
        ? res('<html><body>No results</body></html>')
        : res(page('Tesco British Semi Skimmed Milk 1.13L', '1.45'));
    });
    const out = await scrapeRetailer(retailer, '2 pints semi-skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('ok');
    expect(out.rows[0].price).toBe(1.45);
    expect(searches(fetchImpl)).toEqual(['2 pints semi skimmed milk', 'semi skimmed milk']);
    // The row is reported against what was asked for, and says it was widened.
    expect(out.query).toBe('2 pints semi-skimmed milk');
    expect(out.searched).toBe('semi skimmed milk');
    expect(out.broadened).toBe(true);
  });

  it('does not claim a broadened search when the first rung answered', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots)
      : res(page('Semi Skimmed Milk 2.27L', '1.45'))));
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl, allowModel: false, retryGapMs: 0 });
    expect(out.status).toBe('ok');
    expect(out.broadened).toBe(false);
    expect(out.queriesTried).toEqual(['milk']);
  });

  it('asks a shop that said no exactly once — a retry is not a different question', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow: /search', { status: 200, headers: { 'content-type': 'text/plain' } })
      : res(page('Milk', '1.00'))));
    const out = await scrapeRetailer(retailer, '2 pints semi-skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('declined');
    expect(searches(fetchImpl)).toEqual([]);
  });

  it('does not send more traffic to a shop that is rate-limiting us', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots)
      : res('slow down', 429)));
    const out = await scrapeRetailer(retailer, '2 pints semi-skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('rate-limited');
    expect(searches(fetchImpl)).toEqual(['2 pints semi skimmed milk']);
  });

  it('still reports no-match when every rung of the ladder came back empty', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots)
      : res(page('Chocolate Digestives', '1.10'))));
    const out = await scrapeRetailer(retailer, '2 pints semi-skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('no-match');
    expect(out.rows).toEqual([]);
    expect(out.queriesTried).toHaveLength(2);
  });
});

describe('the cost of broadening', () => {
  const retailer = {
    id: 'test',
    name: 'Test Shop',
    search: (query) => `https://shop.test/search?q=${encodeURIComponent(query)}`,
  };
  const res = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });

  beforeEach(() => clearRobotsCache());

  it('does not ask again through a route the shop already refused', async () => {
    // Direct fetch is blocked; only the renderer gets a page. The second,
    // broader query must not spend another request on the blocked route.
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nAllow: /\n', { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      if (target.startsWith('https://r.jina.ai/')) return res('<html><body>Chocolate Digestives £1.10</body></html>');
      return res('go away', 403);
    });
    const out = await scrapeRetailer(retailer, '2 pints semi-skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('no-match');
    expect(out.queriesTried).toHaveLength(2);
    const direct = fetchImpl.mock.calls
      .map(([url]) => String(url))
      .filter((url) => !url.endsWith('/robots.txt') && !url.startsWith('https://r.jina.ai/'));
    // One refused direct attempt for the first query, and none for the second.
    expect(direct).toHaveLength(1);
  });
});
