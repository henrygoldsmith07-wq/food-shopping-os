import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { fetchObservedForList, clearObservedPriceCache, checkLivePricesForList } = vi.hoisted(() => ({
  fetchObservedForList: vi.fn(),
  clearObservedPriceCache: vi.fn(),
  checkLivePricesForList: vi.fn(),
}));
vi.mock('../src/lib/observed-prices.js', () => ({ fetchObservedForList, clearObservedPriceCache }));
vi.mock('../src/lib/live-prices.js', () => ({ checkLivePricesForList }));

// tests/setup.js imports the real screens first, so the real modules are
// already cached: drop the cache and import the hook fresh against the mocks.
vi.resetModules();
const { useObservedPrices } = await import('../src/lib/use-observed-prices.js');
const items = [{ name: 'milk' }];
const base = { items, offlineMode: false, isOnline: true };

beforeEach(() => {
  vi.clearAllMocks();
  fetchObservedForList.mockResolvedValue({ byKey: { milk: 1 }, checkedAt: 5, fromCache: false, fetched: 1 });
});

describe('useObservedPrices', () => {
  it('does not ask when the list is empty, offline mode is on, or the device is offline', async () => {
    for (const props of [{ ...base, items: [] }, { ...base, offlineMode: true }, { ...base, isOnline: false }]) {
      const { result } = renderHook(() => useObservedPrices(props));
      await act(async () => { await result.current.check(); });
    }
    expect(fetchObservedForList).not.toHaveBeenCalled();
  });

  it('stores prices and meta on success', async () => {
    const { result } = renderHook(() => useObservedPrices(base));
    await act(async () => { await result.current.check(); });
    expect(result.current.byKey).toEqual({ milk: 1 });
    expect(result.current.meta).toMatchObject({ checkedAt: 5, fetched: 1 });
    expect(result.current.busy).toBe(false);
  });

  it('maps error statuses to plain messages', async () => {
    const cases = [[401, /Sign in/], [429, /Too many/], [503, /backend/], [undefined, /unavailable/]];
    for (const [status, re] of cases) {
      fetchObservedForList.mockRejectedValueOnce(Object.assign(new Error(''), { status }));
      const { result } = renderHook(() => useObservedPrices(base));
      await act(async () => { await result.current.check(); });
      expect(result.current.error).toMatch(re);
      expect(result.current.busy).toBe(false);
    }
  });

  it('checks live prices first when live is on and counts shops with a best price', async () => {
    checkLivePricesForList.mockResolvedValue({ byKey: { a: { best: 1 }, b: {} } });
    const { result } = renderHook(() => useObservedPrices({ ...base, live: true }));
    await act(async () => { await result.current.check(); });
    expect(result.current.meta.live).toBe(1);
    expect(result.current.liveAt).toBeGreaterThan(0);
  });

  it('refresh clears the cache and re-fetches', async () => {
    const { result } = renderHook(() => useObservedPrices(base));
    await act(async () => { await result.current.refresh(); });
    expect(clearObservedPriceCache).toHaveBeenCalledTimes(1);
    expect(fetchObservedForList).toHaveBeenCalledTimes(1);
  });
});
