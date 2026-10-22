import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShoppingSession } from '../src/lib/shopping-session.js';

const KEY = 'forq-shopping-session-v1';

describe('useShoppingSession', () => {
  beforeEach(() => sessionStorage.clear());

  it('starts inactive with no saved session', () => {
    const { result } = renderHook(() => useShoppingSession());
    expect(result.current.active).toBe(false);
    expect(result.current.store).toBe('');
  });

  it('start persists the session and survives a remount', () => {
    const first = renderHook(() => useShoppingSession());
    act(() => first.result.current.start('Tesco'));
    expect(JSON.parse(sessionStorage.getItem(KEY))).toEqual({ active: true, store: 'Tesco' });
    const second = renderHook(() => useShoppingSession());
    expect(second.result.current).toMatchObject({ active: true, store: 'Tesco' });
  });

  it('stop clears storage and marks inactive', () => {
    const { result } = renderHook(() => useShoppingSession());
    act(() => result.current.start('Aldi'));
    act(() => result.current.stop());
    expect(result.current.active).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('selectStore only persists while a trip is active', () => {
    const { result } = renderHook(() => useShoppingSession());
    act(() => result.current.selectStore('Lidl'));
    expect(result.current.store).toBe('Lidl');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    act(() => result.current.start('Lidl'));
    act(() => result.current.selectStore('Asda'));
    expect(JSON.parse(sessionStorage.getItem(KEY)).store).toBe('Asda');
  });

  it('ignores corrupt or inactive saved data', () => {
    sessionStorage.setItem(KEY, '{bad');
    expect(renderHook(() => useShoppingSession()).result.current.active).toBe(false);
    sessionStorage.setItem(KEY, JSON.stringify({ active: false, store: 'X' }));
    expect(renderHook(() => useShoppingSession()).result.current.active).toBe(false);
  });

  it('keeps working when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const { result } = renderHook(() => useShoppingSession());
    expect(() => act(() => result.current.start('Co-op'))).not.toThrow();
    expect(result.current.active).toBe(true);
    spy.mockRestore();
  });
});
