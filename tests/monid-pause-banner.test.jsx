import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LivePriceCheck from '../src/components/LivePriceCheck.jsx';

/**
 * The pause banner.
 *
 * When Monid's balance drops below its floor mid-run, the rung stamps
 * `paused: true` on the items it could not price. The shop page must say so
 * where the shopper is looking — not only inside the provenance panel — and
 * it must never imply the shops themselves stopped working.
 */

const pausedStamp = (checkedAt = new Date().toISOString()) => ({
  checkedAt,
  best: null,
  status: 'no-match',
  rows: [],
  shopsChecked: 3,
  shopsAnswered: 3,
  aiUsed: false,
  monid: { status: 'disabled', provider: null, rows: 0, paused: true },
});

describe('the Monid pause banner', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests'))));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('appears when a run paused the paid rung, without blaming the shops', async () => {
    localStorage.setItem('forq.livePrices.v1', JSON.stringify({ milk: pausedStamp() }));
    render(<LivePriceCheck items={[{ id: 'i1', name: 'Milk' }]} isOnline />);
    fireEvent.click(screen.getByRole('button', { name: /check all/i }));
    await waitFor(() => expect(screen.getByText(/Monid is paused/i)).toBeTruthy());
    expect(screen.getByText(/shops were still read normally/i)).toBeTruthy();
  });

  it('stays hidden when the rung was live and healthy', async () => {
    localStorage.setItem('forq.livePrices.v1', JSON.stringify({
      milk: { ...pausedStamp(), monid: { status: 'ok', provider: 'apify', rows: 2, paused: false }, best: { name: 'Milk 2 pints', price: 1.19 } },
    }));
    render(<LivePriceCheck items={[{ id: 'i1', name: 'Milk' }]} isOnline />);
    fireEvent.click(screen.getByRole('button', { name: /check all/i }));
    await waitFor(() => expect(screen.getByText(/1 of 1 item priced/i)).toBeTruthy());
    expect(screen.queryByText(/Monid is paused/i)).toBe(null);
  });
});
