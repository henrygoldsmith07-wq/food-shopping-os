import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addTrip, estimateMinutesLeft, finishTrip, readTrips, markTripStart } from '../src/lib/trip-pace.js';
import { useShoppingSession } from '../src/lib/shopping-session.js';

const MIN = 60000;
describe('trip pace', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('ignores trips that are too small, short or long', () => {
    expect(addTrip([], { items: 2, ms: 20 * MIN })).toEqual([]);
    expect(addTrip([], { items: 10, ms: MIN })).toEqual([]);
    expect(addTrip([], { items: 10, ms: 5 * 60 * MIN })).toEqual([]);
    expect(addTrip([], { items: 10, ms: 20 * MIN })).toHaveLength(1);
  });
  it('shows no estimate until two trips, then uses the median pace', () => {
    const one = addTrip([], { items: 10, ms: 20 * MIN });
    expect(estimateMinutesLeft(one, 5)).toBeNull();
    const two = addTrip(one, { items: 20, ms: 20 * MIN });
    expect(estimateMinutesLeft(two, 10)).toBe(15);
    expect(estimateMinutesLeft(two, 0)).toBeNull();
  });
  it('keeps only the last 8 trips', () => {
    let t = [];
    for (let i = 0; i < 12; i += 1) t = addTrip(t, { items: 5, ms: (10 + i) * MIN });
    expect(t).toHaveLength(8);
  });
  it('finishTrip saves a real trip and survives corrupt storage', () => {
    markTripStart(Date.now() - 30 * MIN);
    expect(finishTrip(15)).toHaveLength(1);
    localStorage.setItem('forq-trip-pace-v1', '{bad');
    expect(readTrips()).toEqual([]);
  });
  it('session stop(ticked) records, bare stop does not, and minutesLeft appears after 2 trips', () => {
    const { result } = renderHook(() => useShoppingSession());
    for (let i = 0; i < 2; i += 1) {
      act(() => result.current.start('Aldi'));
      sessionStorage.setItem('forq-trip-started-v1', String(Date.now() - 20 * MIN));
      act(() => result.current.stop(10));
    }
    act(() => result.current.start('Aldi'));
    expect(result.current.minutesLeft(5)).toBe(10);
    act(() => result.current.stop());
    expect(readTrips()).toHaveLength(2);
  });
});
