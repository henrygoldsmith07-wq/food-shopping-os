import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { usePersistence } from '../src/lib/store-persistence-hook.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { STORAGE_KEY } from '../src/lib/state-versions.js';

const setup = (over = {}) => {
  const setStorageIssue = vi.fn();
  const props = {
    state: { ...EMPTY_STATE }, theme: 'dark', accent: 'green',
    latest: { current: { ...EMPTY_STATE } }, demoRef: { current: false },
    blockPersistence: { current: false }, setState: vi.fn(), setStorageIssue,
    vaultKey: { current: null }, vaultSalt: { current: null }, vaultWrites: { current: Promise.resolve() },
    undoHistory: { current: [] }, undoBatch: { current: null }, storage: 'localStorage', ...over,
  };
  return { props, setStorageIssue };
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('usePersistence (localStorage fallback)', () => {
  it('writes the state on mount and sets the theme on the document', async () => {
    const { props } = setup();
    renderHook(() => usePersistence(props));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).schemaVersion).toBeTruthy();
    // The theme sync is lazy-loaded (the pre-paint script covers first paint),
    // so it lands a tick after mount.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(document.documentElement.dataset.accent).toBe('green');
  });

  it('does not write while persistence is blocked', () => {
    const { props } = setup({ blockPersistence: { current: true } });
    renderHook(() => usePersistence(props));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reports a write failure and returns false', () => {
    const { props, setStorageIssue } = setup({ blockPersistence: { current: true } });
    const { result } = renderHook(() => usePersistence(props));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    let ok;
    act(() => { ok = result.current({ ...EMPTY_STATE }); });
    expect(ok).toBe(false);
    expect(setStorageIssue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'write', detail: 'quota' }));
  });

  it('never writes a demo session on the way out', () => {
    const { props } = setup({ blockPersistence: { current: true }, demoRef: { current: true } });
    renderHook(() => usePersistence(props));
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('stamps lastSeenAt on pagehide', () => {
    const { props } = setup();
    renderHook(() => usePersistence(props));
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).lastSeenAt).toBeGreaterThan(0);
  });
});
