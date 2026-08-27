import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearRobotsCache } from '../src/server/robots.js';
import { diagnoseRetailer, diagnoseScraper, ladderFor, probeControl } from '../src/server/scrape-diagnostics.js';

const res = (body, { status = 200, type = 'text/html' } = {}) => new Response(body, {
  status, headers: { 'content-type': type },
});
const ALLOW = 'User-agent: *\nAllow: /\n';
const PROXY_403 = 'Host not in allowlist: example.com. Add this host to your network egress settings.';

const product = (name, price) => `<html><body><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', name, offers: { price, priceCurrency: 'GBP' },
})}</script></body></html>`;

const shop = (id, name) => ({
  id, name, search: (q) => `https://${id}.test/search?q=${encodeURIComponent(q)}`,
});

beforeEach(() => clearRobotsCache());

describe('proving the machine can reach the web before judging a shop', () => {
  it('reports a reachable control host', async () => {
    const fetchImpl = vi.fn(async () => res('<html>ok</html>'));
    expect(await probeControl({ fetchImpl })).toMatchObject({ ok: true });
  });

  it('recognises a proxy answering on the web’s behalf', async () => {
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403, type: 'text/plain' }));
    const out = await probeControl({ fetchImpl });
    expect(out).toMatchObject({ ok: false, status: 403, intercepted: true });
  });

  it('contacts no shop at all when the control host fails', async () => {
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403, type: 'text/plain' }));
    const report = await diagnoseScraper('milk', { fetchImpl });
    expect(report.networkBlocked).toBe(true);
    expect(report.shops).toEqual([]);
    expect(report.skipped.length).toBeGreaterThan(0);
    // Only the control host was ever requested.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports no hit rate rather than a hit rate of zero', async () => {
    // "Not measured" and "measured as nought" are different claims, and only
    // one of them is true when nothing was contacted.
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403, type: 'text/plain' }));
    const report = await diagnoseScraper('milk', { fetchImpl });
    expect(report.hitRate).toBeNull();
  });
});

describe('what the diagnostic reports about a shop', () => {
  const netUp = (handler) => vi.fn(async (url, init) => {
    const target = String(url);
    if (target.startsWith('https://example.com')) return res('<html>ok</html>');
    if (target.endsWith('/robots.txt')) return res(ALLOW, { type: 'text/plain' });
    return handler(target, init);
  });

  it('reports a price with the strategy and the rung that found it', async () => {
    const fetchImpl = netUp(() => res(product('Heinz Baked Beans 415g', '1.40')));
    const out = await diagnoseRetailer(shop('tesco', 'Tesco'), 'baked beans', { fetchImpl });
    expect(out).toMatchObject({
      status: 'ok', via: 'direct', price: 1.4, broadened: false, method: 'json-ld',
    });
  });

  it('separates a page of wrong products from an empty page', async () => {
    // The distinction that makes this report worth reading: twelve parsed
    // products and none matching needs completely different work from a page
    // that yielded nothing at all.
    const fetchImpl = netUp(() => res(product('Chocolate Digestives', '1.10')));
    const out = await diagnoseRetailer(shop('tesco', 'Tesco'), 'baked beans', { fetchImpl });
    expect(out.status).toBe('no-match');
    const best = out.attempts.filter((a) => a.ok).sort((a, b) => b.parsed - a.parsed)[0];
    expect(best.parsed).toBe(1);
    expect(best.matching).toBe(0);
  });

  it('says a shop declined, and never fetches its pages', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.startsWith('https://example.com')) return res('<html>ok</html>');
      if (target.endsWith('/robots.txt')) return res('User-agent: *\nDisallow: /search', { type: 'text/plain' });
      return res(product('Heinz Baked Beans 415g', '1.40'));
    });
    const out = await diagnoseRetailer(shop('ocado', 'Ocado'), 'baked beans', { fetchImpl });
    expect(out.status).toBe('declined');
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/robots.txt'))).toBe(true);
  });

  it('marks a network block as its own thing, not as the shop refusing', async () => {
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403, type: 'text/plain' }));
    const out = await diagnoseRetailer(shop('tesco', 'Tesco'), 'baked beans', { fetchImpl });
    expect(out.status).toBe('network-blocked');
  });

  it('walks the query ladder and says which rung answered', async () => {
    const fetchImpl = netUp((target) => (target.toLowerCase().includes('heinz')
      ? res(product('Heinz Baked Beans In Tomato Sauce 415g', '1.40'))
      : res('<html><body>Meal deals</body></html>')));
    const out = await diagnoseRetailer(shop('asda', 'Asda'), 'baked beans', { fetchImpl });
    expect(out.status).toBe('ok');
    expect(out.broadened).toBe(true);
    expect(out.searched).toBe('Heinz Baked Beans');
  });
});

describe('the hit rate it reports', () => {
  const mixed = vi.fn(async (url) => {
    const target = String(url);
    if (target.startsWith('https://example.com')) return res('<html>ok</html>');
    if (target.endsWith('/robots.txt')) {
      // Two shops refuse; the rest allow.
      return /ocado|waitrose/.test(target)
        ? res('User-agent: *\nDisallow: /', { type: 'text/plain' })
        : res(ALLOW, { type: 'text/plain' });
    }
    return /tesco|asda|aldi/.test(target)
      ? res(product('Heinz Baked Beans 415g', '1.40'))
      : res('<html><body>nothing here</body></html>');
  });

  it('measures over shops actually reached, and shows its working', async () => {
    const report = await diagnoseScraper('baked beans', { fetchImpl: mixed });
    expect(report.networkBlocked).toBe(false);
    expect(report.priced).toBe(3);
    // Declined shops count as reached — the shop answered, with a refusal.
    expect(report.reached).toBe(report.shops.filter((s) => s.status !== 'network-blocked').length);
    expect(report.hitRate).toBe(Math.round((report.priced / report.reached) * 100));
    expect(report.tally.ok).toBe(3);
    expect(report.tally.declined).toBe(2);
  });

  it('names the shops it ran out of time for rather than counting them as failures', async () => {
    const slow = vi.fn(async (url) => {
      if (String(url).startsWith('https://example.com')) return res('<html>ok</html>');
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      return res(ALLOW, { type: 'text/plain' });
    });
    const report = await diagnoseScraper('baked beans', { fetchImpl: slow, deadlineMs: 1 });
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.shops.length + report.skipped.length).toBe(9);
  });
});

describe('the ladder the diagnostic reports', () => {
  it('is the ladder the scraper actually walks', () => {
    expect(ladderFor('2 pints semi-skimmed milk')).toEqual([
      '2 pints semi skimmed milk', 'semi skimmed milk', 'Cravendale Semi-Skimmed Milk',
    ]);
    expect(ladderFor('milk')).toEqual(['milk']);
  });
});
