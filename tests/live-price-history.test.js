import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bestPriceSeries, cheapestShopOverall, priceTrend, recordLivePriceCheck,
  shopSeries,
} from '../src/lib/live-price-history.js';
import {
  BATCH_SIZE, checkLivePricesForList, rankShops, rankingSpread,
} from '../src/lib/live-prices.js';

const row = (retailerId, retailer, price, extra = {}) => ({
  retailerId, retailer, price, name: `${retailer} milk`, method: 'json-ld', ...extra,
});

const entry = (rows) => ({ perRetailer: rows });

describe('ranking the shops for one item', () => {
  // No pack sizes: nothing can be normalised, so the ticket is all there is.
  it('falls back to the ticket price when no shop stated a pack size', () => {
    const ranking = rankShops([
      row('asda', 'Asda', 1.5),
      row('tesco', 'Tesco', 1.45),
      row('ocado', 'Ocado', 1.9),
    ]);
    expect(ranking.basis).toBe('price');
    expect(ranking.rows.map((r) => [r.retailer, r.rank, r.over, r.overPct])).toEqual([
      ['Tesco', 1, 0, 0],
      ['Asda', 2, 0.05, 3.4],
      ['Ocado', 3, 0.45, 31],
    ]);
    expect(ranking.rows[0].isCheapest).toBe(true);
    expect(ranking.rows.at(-1).isDearest).toBe(true);
  });

  it('ranks by what it costs per unit, which reverses the shelf edge', () => {
    // 85p for 1.13L looks cheaper than £1.45 for 2.27L and is dearer a litre.
    // This is the everyday case a price-only ranking gets backwards.
    const ranking = rankShops([
      row('aldi', 'Aldi', 0.85, { packSize: '1.13l' }),
      row('tesco', 'Tesco', 1.45, { packSize: '2.27l' }),
    ], { name: 'milk' });
    expect(ranking.basis).toBe('unit');
    expect(ranking.unitLabel).toBe('100ml');
    expect(ranking.rows.map((r) => r.retailer)).toEqual(['Tesco', 'Aldi']);
    expect(ranking.ticketMisleads).toBe(true);
    expect(ranking.cheapestByTicket.retailer).toBe('Aldi');
  });

  it('measures the gap from the unrounded figures', () => {
    // 6.39p and 7.52p per 100ml both round to a two-decimal price, and the
    // gap between the rounded pair reads as 33% where the real one is 18%.
    const ranking = rankShops([
      row('aldi', 'Aldi', 0.85, { packSize: '1.13l' }),
      row('tesco', 'Tesco', 1.45, { packSize: '2.27l' }),
    ], { name: 'milk' });
    expect(ranking.rows[1].overPct).toBe(17.8);
    expect(rankingSpread(ranking)).toMatchObject({ pct: 17.8, saving: 0.02, unitLabel: '100ml' });
  });

  it('will not rank across scales, and says why', () => {
    // Six eggs against 500g of eggs: both are eggs, neither is cheaper.
    const ranking = rankShops([
      row('tesco', 'Tesco', 1.6, { packSize: '6 pack' }),
      row('lidl', 'Lidl', 1.4, { packSize: '500g' }),
    ], { name: 'eggs' });
    expect(ranking.basis).toBe('price');
    expect(ranking.mixedScales).toBe(true);
    expect(ranking.rows.map((r) => r.retailer)).toEqual(['Lidl', 'Tesco']);
  });

  it('will not rank per unit unless every shop can be compared', () => {
    // Ranking eight shops per litre and appending a ninth on its ticket puts
    // an incomparable row inside an ordered list.
    const ranking = rankShops([
      row('tesco', 'Tesco', 1.45, { packSize: '2.27l' }),
      row('asda', 'Asda', 1.4),
    ], { name: 'milk' });
    expect(ranking.basis).toBe('price');
    expect(ranking.mixedScales).toBe(false);
  });

  it('gives tied shops the same rank, because they are not first and second', () => {
    const ranking = rankShops([
      row('a', 'A', 2),
      row('b', 'B', 2),
      row('c', 'C', 3),
    ]);
    expect(ranking.rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(ranking.rows.filter((r) => r.isCheapest)).toHaveLength(2);
  });

  it('does not mark a lone shop as dearest as well as cheapest', () => {
    const ranking = rankShops([row('a', 'A', 2)]);
    expect(ranking.rows[0]).toMatchObject({ isCheapest: true, isDearest: false, over: 0 });
    expect(rankingSpread(ranking)).toBeNull();
  });

  it('reports the spread, which is what makes a ranking worth reading', () => {
    const spread = rankingSpread(rankShops([row('a', 'A', 1), row('b', 'B', 1.5)]));
    expect(spread).toMatchObject({ saving: 0.5, pct: 50, basis: 'price' });
    expect(spread.cheapest.retailer).toBe('A');
  });

  it('ignores rows with no usable price rather than ranking them last', () => {
    expect(rankShops([row('a', 'A', 1.2), { retailerId: 'b', retailer: 'B' }]).rows).toHaveLength(1);
    expect(rankShops([]).rows).toEqual([]);
    expect(rankShops([]).basis).toBe('none');
  });
});

describe('keeping a history of checks', () => {
  it('records the cheapest price per shop, and the best across them', () => {
    const store = recordLivePriceCheck({}, 'Milk', entry([
      row('tesco', 'Tesco', 1.45), row('asda', 'Asda', 1.5),
    ]), '2026-08-01');
    const points = store.milk.points;
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: '2026-08-01', best: 1.45 });
    expect(points[0].shops.asda).toEqual({ price: 1.5, retailer: 'Asda' });
  });

  it('keeps one point per day — five checks in an afternoon are not a trend', () => {
    let store = recordLivePriceCheck({}, 'Milk', entry([row('tesco', 'Tesco', 1.45)]), '2026-08-01');
    store = recordLivePriceCheck(store, 'Milk', entry([row('tesco', 'Tesco', 1.6)]), '2026-08-01');
    expect(store.milk.points).toHaveLength(1);
    // The latest check of a day wins: it is the most current answer for it.
    expect(store.milk.points[0].best).toBe(1.6);
  });

  it('records nothing for a check that found nothing, rather than a false zero', () => {
    expect(recordLivePriceCheck({}, 'Milk', entry([]), '2026-08-01')).toEqual({});
    expect(recordLivePriceCheck({}, 'Milk', { perRetailer: null }, '2026-08-01')).toEqual({});
  });

  it('keeps points in date order however they arrive', () => {
    let store = recordLivePriceCheck({}, 'Milk', entry([row('t', 'Tesco', 2)]), '2026-08-05');
    store = recordLivePriceCheck(store, 'Milk', entry([row('t', 'Tesco', 1)]), '2026-08-01');
    expect(store.milk.points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-05']);
  });
});

describe('what the history is charted as', () => {
  const built = () => {
    let store = recordLivePriceCheck({}, 'Milk', entry([
      row('tesco', 'Tesco', 1.0), row('asda', 'Asda', 1.2),
    ]), '2026-08-01');
    store = recordLivePriceCheck(store, 'Milk', entry([
      row('tesco', 'Tesco', 1.5), row('asda', 'Asda', 1.2),
    ]), '2026-08-08');
    return store.milk;
  };

  it('gives one headline series — the cheapest price each day, and who had it', () => {
    // The cheapest shop changes between the two dates, and the series follows
    // the price rather than staying loyal to whoever was cheapest first.
    expect(bestPriceSeries(built())).toEqual([
      { date: '2026-08-01', price: 1, shop: 'Tesco' },
      { date: '2026-08-08', price: 1.2, shop: 'Asda' },
    ]);
  });

  it('splits into one series per shop, cheapest average first', () => {
    const shops = shopSeries(built());
    // Asda averages 1.20 against Tesco's 1.25, despite Tesco being cheaper on
    // the first date — which is the whole reason to average.
    expect(shops.map((s) => s.retailer)).toEqual(['Asda', 'Tesco']);
    expect(shops[0]).toMatchObject({ average: 1.2, latest: 1.2, min: 1.2, max: 1.2, change: 0 });
    expect(shops[1]).toMatchObject({ average: 1.25, change: 0.5, changePct: 50 });
  });

  it('reads the trend in the item, not in one shop', () => {
    expect(priceTrend(built())).toMatchObject({ direction: 'up', change: 0.2, pct: 20 });
  });

  it('refuses to call one check a trend', () => {
    const store = recordLivePriceCheck({}, 'Milk', entry([row('t', 'Tesco', 1)]), '2026-08-01');
    expect(priceTrend(store.milk)).toMatchObject({ direction: 'unknown', change: null });
  });

  it('says which shop is usually cheapest, not just cheapest today', () => {
    // Tesco wins the first check, Asda the second — but Tesco wins a third.
    let store = recordLivePriceCheck({}, 'Milk', entry([row('t', 'Tesco', 1), row('a', 'Asda', 2)]), '2026-08-01');
    store = recordLivePriceCheck(store, 'Milk', entry([row('t', 'Tesco', 3), row('a', 'Asda', 2)]), '2026-08-02');
    store = recordLivePriceCheck(store, 'Milk', entry([row('t', 'Tesco', 1), row('a', 'Asda', 2)]), '2026-08-03');
    expect(cheapestShopOverall(store.milk)).toMatchObject({ retailer: 'Tesco', wins: 2, of: 3 });
  });
});

describe('checking a whole list rather than a sample of it', () => {
  const scrape = (query, price) => ({
    query,
    best: { price, retailer: 'Tesco', retailerId: 'tesco' },
    cheapest: [row('tesco', 'Tesco', price)],
    results: [{ retailer: 'Tesco', retailerId: 'tesco', status: 'ok', rows: [] }],
    shopsChecked: 1,
    shopsAnswered: 1,
    checkedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const names = Array.from({ length: 11 }, (_, index) => `item ${index + 1}`);
  const items = names.map((name, index) => ({ id: `i${index}`, name }));

  it('checks every item on the list, not the first handful', async () => {
    const seen = [];
    fetch.mockImplementation(async (url, init) => {
      const sent = JSON.parse(init.body).items;
      seen.push(...sent);
      return new Response(JSON.stringify({
        checks: sent.map((name) => scrape(name, 1)), remaining: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const out = await checkLivePricesForList(items);
    expect(seen.sort()).toEqual([...names].sort());
    expect(Object.keys(out.byKey)).toHaveLength(11);
    expect(out.total).toBe(11);
  });

  it('batches rather than sending one request per item', async () => {
    fetch.mockImplementation(async (url, init) => {
      const sent = JSON.parse(init.body).items;
      expect(sent.length).toBeLessThanOrEqual(BATCH_SIZE);
      return new Response(JSON.stringify({ checks: sent.map((n) => scrape(n, 1)), remaining: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    await checkLivePricesForList(items);
    expect(fetch.mock.calls.length).toBe(Math.ceil(11 / BATCH_SIZE));
  });

  it('re-sends items the server deferred when it ran out of time', async () => {
    let call = 0;
    fetch.mockImplementation(async (url, init) => {
      const sent = JSON.parse(init.body).items;
      call += 1;
      // First response defers its last item; it must come back around.
      const defer = call === 1 ? sent.slice(-1) : [];
      const done = sent.filter((name) => !defer.includes(name));
      return new Response(JSON.stringify({
        checks: done.map((n) => scrape(n, 1)), remaining: defer,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const out = await checkLivePricesForList(items);
    expect(Object.keys(out.byKey)).toHaveLength(11);
  });

  it('a failed batch does not lose the rest of the list', async () => {
    let call = 0;
    fetch.mockImplementation(async (url, init) => {
      const sent = JSON.parse(init.body).items;
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ checks: sent.map((n) => scrape(n, 1)), remaining: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const out = await checkLivePricesForList(items);
    expect(Object.keys(out.byKey)).toHaveLength(11);
    expect(Object.values(out.byKey).filter((e) => e.error)).toHaveLength(BATCH_SIZE);
    expect(Object.values(out.byKey).filter((e) => e.best)).toHaveLength(11 - BATCH_SIZE);
  });

  it('stops the whole run when the user is signed out or rate limited', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), {
      status: 429, headers: { 'content-type': 'application/json' },
    }));
    await expect(checkLivePricesForList(items)).rejects.toMatchObject({ status: 429 });
  });

  it('serves a fresh cached answer without going to the network at all', async () => {
    fetch.mockImplementation(async (url, init) => {
      const sent = JSON.parse(init.body).items;
      return new Response(JSON.stringify({ checks: sent.map((n) => scrape(n, 1)), remaining: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    await checkLivePricesForList(items);
    fetch.mockClear();
    const second = await checkLivePricesForList(items);
    expect(fetch).not.toHaveBeenCalled();
    expect(second.fromCache).toBe(11);
    expect(second.fetched).toBe(0);
  });
});
