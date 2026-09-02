import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MonidProvenance from '../src/components/MonidProvenance.jsx';
import {
  entryFromResult, methodLabel, methodTone, monidLabel, monidTone, splitMonidRows,
} from '../src/lib/live-prices.js';

afterEach(cleanup);

describe('splitMonidRows', () => {
  it('separates the Monid result from the shop results and keeps the miss shape', () => {
    const results = [
      { retailerId: 'tesco', retailer: 'Tesco', status: 'ok', rows: [{ name: 'Beans', price: 0.9, source: 'scraped' }] },
      { source: 'monid', status: 'ok', provider: 'apify', rows: [{ name: 'Beans 4-pack', price: 1.1, source: 'monid', query: 'baked beans' }] },
    ];
    const split = splitMonidRows(results);
    expect(split.status).toBe('ok');
    expect(split.provider).toBe('apify');
    expect(split.rows).toHaveLength(1);
    expect(split.rows[0].price).toBe(1.1);
    expect(split.named('baked beans')).toHaveLength(1);
    expect(split.named('milk')).toHaveLength(0);
  });

  it('reports not-asked rather than an empty ok when Monid never ran', () => {
    const split = splitMonidRows([{ retailerId: 'tesco', status: 'ok', rows: [] }]);
    expect(split.monid).toBe(null);
    expect(split.status).toBe(null);
    expect(split.rows).toEqual([]);
  });
});

describe('method labels keep the two provenances apart', () => {
  it('has a distinct label and tone for Monid rows', () => {
    expect(monidLabel).toMatch(/paid data service/);
    expect(monidTone).not.toBe(methodTone('json-ld'));
    expect(methodLabel('monid')).not.toMatch(/monid/i); // scraped labels never claim Monid
  });
});

describe('entryFromResult carries provenance through shaping', () => {
  const base = {
    checkedAt: '2026-01-01T00:00:00Z',
    results: [],
    cheapest: [],
    best: null,
    shopsChecked: 1,
    shopsAnswered: 1,
    aiUsed: false,
    monid: { status: 'no-match', provider: null, rows: 0 },
  };

  it('keeps the monid outcome, including misses, on the entry', () => {
    const entry = entryFromResult('baked beans', base);
    expect(entry.monid).toEqual({ status: 'no-match', provider: null, rows: 0 });
  });

  it('omits the monid field entirely when Monid was off', () => {
    const entry = entryFromResult('baked beans', { ...base, monid: null });
    expect(entry.monid).toBe(null);
  });
});

describe('MonidProvenance panel', () => {
  const okFetch = (body) => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
  const failFetch = () => vi.fn(() => Promise.reject(new Error('offline')));

  it('renders priced rows as paid data and misses with their reason', async () => {
    global.fetch = okFetch({ configured: true, balance: 12 });
    const results = [
      { name: 'baked beans', monid: { status: 'ok', provider: 'apify', rows: 3 } },
      { name: 'oat milk', monid: { status: 'no-match', provider: null, rows: 0 } },
      { name: 'eggs', monid: null },
    ];
    render(<MonidProvenance results={results} />);
    await waitFor(() => expect(screen.getByText(/Paid data provenance/i)).toBeTruthy());
    expect(screen.getByText(/returned 3 prices/)).toBeTruthy();
    expect(screen.getByText(/no data for this product/i)).toBeTruthy();
    expect(screen.queryByText(/eggs:/)).toBe(null); // not-asked is not reported
    expect(screen.getByText(/12 credits left/)).toBeTruthy();
  });

  it('shows balance unknown, never zero, when the status probe fails', async () => {
    global.fetch = failFetch();
    const results = [{ name: 'baked beans', monid: { status: 'ok', provider: 'apify', rows: 1 } }];
    render(<MonidProvenance results={results} />);
    await waitFor(() => expect(screen.getByText(/balance unknown/i)).toBeTruthy());
  });

  it('renders only a quiet availability line when Monid ran for nothing', async () => {
    global.fetch = okFetch({ configured: true, balance: 5 });
    render(<MonidProvenance results={[{ name: 'eggs', monid: null }]} />);
    await waitFor(() => expect(screen.getByText(/Monid is connected/i)).toBeTruthy());
    expect(screen.queryByText(/Paid data provenance/i)).toBe(null);
  });

  it('vanishes entirely when nothing ran and Monid is not configured', async () => {
    global.fetch = okFetch({ configured: false, balance: null });
    const { container } = render(<MonidProvenance results={[{ name: 'eggs', monid: null }]} />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
