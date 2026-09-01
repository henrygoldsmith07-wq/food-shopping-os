import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearRobotsCache, isScrapeAllowed, looksIntercepted } from '../src/server/robots.js';
import { scrapeRetailer } from '../src/server/price-scraper.js';
import { coverageFor } from '../src/lib/price-coverage.js';

const res = (body, { status = 200, headers = {} } = {}) => new Response(body, {
  status, headers: { 'content-type': 'text/plain', ...headers },
});

/** What a filtering egress proxy actually returns for a blocked host. */
const PROXY_403 = 'Host not in allowlist: www.tesco.com. Add this host to your network egress settings to allow access.';

beforeEach(() => clearRobotsCache());

describe('telling a blocked network apart from a shop that said no', () => {
  it('recognises a proxy explaining itself', () => {
    expect(looksIntercepted(PROXY_403)).toBe(true);
    expect(looksIntercepted('Access denied by network policy')).toBe(true);
    expect(looksIntercepted('Blocked by your organisation’s firewall')).toBe(true);
  });

  it('does not mistake a shop’s own refusal for a proxy', () => {
    // A robots.txt served with a 403 still looks like a robots.txt.
    expect(looksIntercepted('User-agent: *\nDisallow: /search')).toBe(false);
    expect(looksIntercepted('Forbidden')).toBe(false);
    expect(looksIntercepted('')).toBe(false);
  });

  it('will not read a robots-shaped body as interception even if it says proxy', () => {
    // The shape wins: a real robots.txt mentioning a proxy path is still the
    // shop talking, and this must never become a way to ignore one.
    expect(looksIntercepted('User-agent: *\nDisallow: /proxy\n')).toBe(false);
  });

  it('reports a blocked network as its own reason, and still refuses to fetch', () => {
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403 }));
    return isScrapeAllowed('https://www.tesco.com/groceries/search?q=milk', { fetchImpl })
      .then((permission) => {
        expect(permission.reason).toBe('network-blocked');
        // The whole point: the diagnosis changed, the permission did not.
        expect(permission.allowed).toBe(false);
      });
  });

  it('still calls a genuine 403 from the shop a refusal', async () => {
    const fetchImpl = vi.fn(async () => res('Forbidden', { status: 403 }));
    const permission = await isScrapeAllowed('https://shop.test/search?q=milk', { fetchImpl });
    expect(permission.reason).toBe('robots-forbidden');
    expect(permission.allowed).toBe(false);
  });

  it('keeps the distinction when the answer comes from cache', async () => {
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403 }));
    await isScrapeAllowed('https://shop.test/search?q=milk', { fetchImpl });
    const second = await isScrapeAllowed('https://shop.test/search?q=bread', { fetchImpl });
    expect(second.cached).toBe(true);
    expect(second.allowed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never fetches the page either way', async () => {
    const retailer = { id: 'tesco', name: 'Tesco', search: (q) => `https://shop.test/search?q=${q}` };
    const fetchImpl = vi.fn(async () => res(PROXY_403, { status: 403 }));
    const out = await scrapeRetailer(retailer, 'milk', { fetchImpl, allowModel: false, retryGapMs: 0 });
    expect(out.status).toBe('network-blocked');
    expect(out.note).toMatch(/not the retailer/i);
    expect(fetchImpl.mock.calls.every(([url]) => String(url).endsWith('/robots.txt'))).toBe(true);
  });
});

describe('a whole run blocked is not a hit rate of zero', () => {
  const blocked = (name) => ({ name, unanswered: [{ status: 'network-blocked' }] });

  it('says the network is the problem rather than reporting 0% priced', () => {
    const out = coverageFor({ milk: blocked('milk'), bread: blocked('bread') });
    expect(out.pct).toBe(0);
    expect(out.networkBlocked).toBe(true);
  });

  it('does not claim a network problem when some items priced', () => {
    const out = coverageFor({ milk: { best: { price: 1.2 } }, bread: blocked('bread') });
    expect(out.networkBlocked).toBe(false);
  });

  it('does not claim a network problem when the shops actually refused', () => {
    const out = coverageFor({
      milk: { unanswered: [{ status: 'declined' }] },
      bread: { unanswered: [{ status: 'declined' }] },
    });
    expect(out.networkBlocked).toBe(false);
    expect(out.reasons[0].label).toMatch(/robots\.txt/);
  });

  it('does not claim a network problem from a mixture of failures', () => {
    const out = coverageFor({ milk: blocked('milk'), bread: { unanswered: [{ status: 'declined' }] } });
    expect(out.networkBlocked).toBe(false);
  });
});
