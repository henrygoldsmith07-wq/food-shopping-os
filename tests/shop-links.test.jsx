import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { absoluteUrl, productsFromMicrodata } from '../src/server/scrape-parse.js';
import { clearRobotsCache } from '../src/server/robots.js';
import { scrapeRetailer } from '../src/server/price-scraper.js';
import { shopLinksFor } from '../src/lib/live-prices.js';
import ShopLinks from '../src/components/ShopLinks.jsx';

describe('turning an href on a page into a link that opens', () => {
  it('resolves every shape a retailer actually writes', () => {
    expect(absoluteUrl('/p/123', 'https://shop.test/search?q=milk')).toBe('https://shop.test/p/123');
    expect(absoluteUrl('p/123', 'https://shop.test/search/')).toBe('https://shop.test/search/p/123');
    expect(absoluteUrl('//cdn.shop.test/p/1', 'https://shop.test/s')).toBe('https://cdn.shop.test/p/1');
    expect(absoluteUrl('https://other.test/p/1', 'https://shop.test/s')).toBe('https://other.test/p/1');
  });

  it('drops anything that would not open, rather than guessing', () => {
    // A link that 404s is worse than no link: by the time it fails the
    // person has already decided to trust it.
    for (const href of ['', '   ', '#', 'javascript:void(0)', 'mailto:a@b.c', 'tel:123']) {
      expect(absoluteUrl(href, 'https://shop.test/s'), JSON.stringify(href)).toBeNull();
    }
  });

  it('finds the product link on the card the price was read from', () => {
    const card = '<li itemscope><a href="/p/milk-227"><span itemprop="name">Semi Skimmed Milk 2.27L</span></a><meta itemprop="price" content="1.45"></li>';
    expect(productsFromMicrodata(card)[0]).toMatchObject({ name: 'Semi Skimmed Milk 2.27L', href: '/p/milk-227' });
  });
});

describe('somewhere to go at every shop', () => {
  const robots = 'User-agent: *\nAllow: /\n';
  const retailer = (id, name) => ({
    id, name, search: (query) => `https://${id}.test/search?q=${encodeURIComponent(query)}`,
  });
  const res = (body, { status = 200, type = 'text/html' } = {}) => new Response(body, {
    status, headers: { 'content-type': type },
  });

  beforeEach(() => {
    clearRobotsCache();
    vi.stubEnv('PRICE_SCRAPER_RETAILERS', '');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('links straight to the product when the shop published its own page', async () => {
    const page = `<html><body><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Semi Skimmed Milk 2.27L',
      offers: { price: '1.45', priceCurrency: 'GBP', url: '/p/milk-227' },
    })}</script></body></html>`;
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots, { type: 'text/plain' })
      : res(page)));
    const out = await scrapeRetailer(retailer('tesco', 'Tesco'), 'semi skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.rows[0].url).toBe('https://tesco.test/p/milk-227');
    expect(out.rows[0].isProductLink).toBe(true);
  });

  it('falls back to the shop’s search page rather than to nothing', async () => {
    const page = `<html><body><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Semi Skimmed Milk 2.27L', offers: { price: '1.45', priceCurrency: 'GBP' },
    })}</script></body></html>`;
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res(robots, { type: 'text/plain' })
      : res(page)));
    const out = await scrapeRetailer(retailer('asda', 'Asda'), 'semi skimmed milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.rows[0].url).toBe('https://asda.test/search?q=semi%20skimmed%20milk');
    expect(out.rows[0].isProductLink).toBe(false);
  });

  it('keeps a link for a shop whose robots.txt refused us', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).endsWith('/robots.txt')
      ? res('User-agent: *\nDisallow: /search', { type: 'text/plain' })
      : res('<html></html>')));
    const out = await scrapeRetailer(retailer('ocado', 'Ocado'), 'milk', {
      fetchImpl, allowModel: false, retryGapMs: 0,
    });
    expect(out.status).toBe('declined');
    // Refusing our reader is not refusing the person holding the phone.
    expect(shopLinksFor({ results: [out] })).toEqual([{
      retailer: 'Ocado',
      retailerId: 'ocado',
      status: 'declined',
      price: null,
      url: 'https://ocado.test/search?q=milk',
      isProductLink: false,
      productName: null,
    }]);
  });

  it('offers nothing for a shop with no public search at all', () => {
    expect(shopLinksFor({
      results: [{ retailer: 'Nowhere', retailerId: 'nowhere', status: 'no-search-url', rows: [] }],
    })).toEqual([]);
  });
});

describe('the links panel', () => {
  afterEach(cleanup);

  const links = [
    { retailerId: 'tesco', retailer: 'Tesco', status: 'ok', price: 1.45, url: 'https://tesco.test/p/1', isProductLink: true, productName: 'Semi Skimmed Milk 2.27L' },
    { retailerId: 'ocado', retailer: 'Ocado', status: 'declined', price: null, url: 'https://ocado.test/search?q=milk', isProductLink: false, productName: null },
  ];

  it('opens every shop in a new tab, without leaking the referrer', () => {
    render(<ShopLinks links={links} name="Milk" />);
    const anchors = screen.getAllByRole('link');
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toContain('noopener');
    }
  });

  it('says which links are the product and which are a list of maybes', () => {
    render(<ShopLinks links={links} name="Milk" />);
    expect(screen.getByText(/Open Milk at 2 shops · 1 straight to the product/)).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('£1.45')).toBeTruthy();
    expect(within(items[1]).getByText('search')).toBeTruthy();
  });

  it('names the destination for a screen reader, not just the shop', () => {
    render(<ShopLinks links={links} name="Milk" />);
    expect(screen.getByRole('link', { name: /open Semi Skimmed Milk 2\.27L on Tesco/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /search Ocado for Milk/i })).toBeTruthy();
  });

  it('renders nothing rather than an empty shell', () => {
    const { container } = render(<ShopLinks links={[]} name="Milk" />);
    expect(container.innerHTML).toBe('');
  });
});
