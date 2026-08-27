import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LivePriceCheck from '../src/components/LivePriceCheck.jsx';
import { dailyCheckSettings, recordDailyCheck, setDailyCheckEnabled } from '../src/lib/daily-price-check.js';

const point = (date, best, shops = { tesco: { price: best, retailer: 'Tesco' } }) => ({ date, best, shops });
const entry = (name, points) => ({ name, points });

describe('the watch panel', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in tests'))));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const history = {
    milk: entry('Milk', [point('2026-08-01', 1.0), point('2026-08-02', 1.5)]),
    jam: entry('Jam', [point('2026-08-01', 2.0), point('2026-08-02', 1.4)]),
    eggs: entry('Eggs', [point('2026-08-01', 2.0), point('2026-08-02', 2.01)]),
  };

  const show = (extra = {}) => render(
    <LivePriceCheck items={[{ id: 'i1', name: 'Milk' }]} isOnline={false} {...extra} />,
  );

  it('names what moved, by how much, and where the price came from', () => {
    localStorage.setItem('forq.livePriceHistory.v1', JSON.stringify(history));
    show();
    expect(screen.getByText('Price watch')).toBeTruthy();
    expect(screen.getByText(/Up £0\.50 \(50%\)/)).toBeTruthy();
    expect(screen.getByText(/Down £0\.60 \(30%\)/)).toBeTruthy();
    expect(screen.getAllByText(/from shop pages Forq checked/).length).toBeGreaterThan(0);
  });

  it('counts the steady items instead of warning about them', () => {
    localStorage.setItem('forq.livePriceHistory.v1', JSON.stringify(history));
    show();
    expect(screen.getByText(/Watching 3 items · 1 up · 1 down · 1 steady/)).toBeTruthy();
    expect(screen.queryByText(/Eggs/)).toBeNull();
  });

  it('says there is nothing to say before anything has been checked', () => {
    show();
    expect(screen.getByText(/Check your list a couple of times/)).toBeTruthy();
  });

  it('leaves the daily check off until it is switched on, and remembers the choice', () => {
    show();
    expect(screen.getByText(/Daily checking is off\./)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Check prices once a day'));
    expect(dailyCheckSettings().enabled).toBe(true);
  });

  it('does not start checking on its own while offline', () => {
    setDailyCheckEnabled(true);
    show();
    expect(screen.getByText(/No connection — will check when back online\./)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not start checking on its own in offline shopping mode', () => {
    setDailyCheckEnabled(true);
    show({ isOnline: true, offlineMode: true });
    expect(screen.getByText(/Offline shopping mode is on\./)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks by itself, once, when a day is owed', async () => {
    setDailyCheckEnabled(true);
    show({ isOnline: true });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const calls = fetch.mock.calls.length;
    // A re-render must not start a second run at the same list.
    await waitFor(() => expect(screen.queryByText('Checking shops…')).toBeNull());
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it('does not check again the same day', () => {
    setDailyCheckEnabled(true);
    recordDailyCheck({ priced: 1, total: 1 });
    show({ isOnline: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/next in about/)).toBeTruthy();
  });
});
