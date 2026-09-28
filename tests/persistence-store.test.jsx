/**
 * The store's persistence contract, exercised through the real provider.
 *
 * These are the promises the storage layer makes to the rest of the app, and
 * they are only really tested through the component that depends on them:
 *
 *   - a demo session never reaches any store, not even on the way out;
 *   - two tabs converge without localStorage carrying the state;
 *   - reset wipes every layer, so a later write cannot resurrect a deletion.
 *
 * `fake-indexeddb` supplies a real transactional database so the code under
 * test is the code that ships. Without it these are skipped rather than
 * quietly passing against a different world.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import { readSnapshot, resetStoreHandles } from '../src/lib/persistent-state.js';
import { loadCanonicalState } from '../src/lib/persistence-boot.js';

const haveIndexedDb = Boolean(new IDBFactory());

/** Read the live store so a test can act on it the way a screen would. */
function Probe({ onReady }) {
  const app = useApp();
  onReady(app);
  return null;
}

const renderStore = async () => {
  let app = null;
  await act(async () => {
    render(<AppProvider><Probe onReady={(value) => { app = value; }} /></AppProvider>);
  });
  return () => app;
};

const seeded = (overrides = {}) => ({
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  pantry: [{ id: 'p1', name: 'Rice', qty: '1 bag', location: 'Cupboard', low: false }],
  shoppingList: [{ id: 's1', name: 'Milk', qty: '1 pint', checked: false }],
  ...overrides,
});

describe.skipIf(!haveIndexedDb)('the store and its persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    resetStoreHandles();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    resetStoreHandles();
    delete globalThis.indexedDB;
    vi.restoreAllMocks();
  });

  it('migrates a legacy install on boot and then owns it in IndexedDB', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded({ name: 'Legacy Sam' })));
    const getApp = await renderStore();

    // The first paint came from the synchronous copy, so the app opened
    // instantly and never showed an empty kitchen.
    expect(getApp().name).toBe('Legacy Sam');

    // Boot is two beats: the canonical record lands a tick after the first
    // paint. Let the migration finish before asserting on it.
    await act(async () => { await loadCanonicalState(); });

    // The canonical record exists afterwards, and localStorage no longer holds
    // the app.
    const record = await readSnapshot();
    expect(record.state.name).toBe('Legacy Sam');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('never lets a demo session reach a store, on any path', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded()));
    const getApp = await renderStore();
    const realBefore = JSON.stringify(getApp().shoppingList);

    await act(async () => {
      getApp().enterDemoMode();
    });
    // A demo kitchen is fully populated so a visitor can click through it, and
    // the app reads from it entirely — that is the point of a sandbox.
    expect(getApp().isDemoMode).toBe(true);

    // Change things inside the demo.
    await act(async () => {
      getApp().addToList({ name: 'Demo-only item' });
    });
    expect(JSON.stringify(getApp().shoppingList)).toContain('Demo-only item');

    // Leaving the page writes the heartbeat; a demo must not be there for it,
    // on the visibility path or the pagehide path.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Nothing about the demo reached the local copy…
    expect(localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('Demo-only item');
    // …and leaving the sandbox puts the real state back exactly as it was.
    await act(async () => {
      getApp().exitDemoMode();
    });
    expect(JSON.stringify(getApp().shoppingList)).toBe(realBefore);
    // The canonical record, if there is one, never saw the demo either.
    const record = await readSnapshot();
    expect(JSON.stringify(record?.state?.shoppingList || [])).not.toContain('Demo-only item');
  });

  it('does not ping-pong between two tabs reading the same record', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded()));
    const getApp = await renderStore();
    await act(async () => { await loadCanonicalState(); });

    // Simulate a save from another tab: the canonical record changes and the
    // signal fires. Only the persisted fields are written — the store's context
    // is full of functions and is not what gets stored.
    const { writeSnapshot, announceState, createStateChannel } = await import('../src/lib/persistent-state.js');
    createStateChannel();
    await act(async () => {
      await writeSnapshot(
        { ...seeded(), schemaVersion: 4, shoppingList: [{ id: 's9', name: 'Eggs', qty: '6', checked: false }] },
        { schemaVersion: 4 },
      );
      announceState({ seq: 99 });
    });
    // The adopting tab read the record rather than a payload, and the state it
    // adopted is the record's — not a loop of its own write coming back.
    await act(async () => {});
    expect(JSON.stringify(getApp().shoppingList)).toContain('Eggs');
    // localStorage never carried the state, so it cannot be the thing the two
    // tabs are disagreeing about.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears every layer on reset so a later write cannot resurrect it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded({ name: 'Sam' })));
    const getApp = await renderStore();
    // Boot is two beats: the first paint is synchronous, the canonical record
    // lands a tick later. Let the migration finish before asserting on it.
    await act(async () => { await loadCanonicalState(); });
    expect(await readSnapshot()).not.toBeNull();

    await act(async () => {
      getApp().reset();
    });
    await act(async () => {});

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    // Whatever a fresh install is allowed to leave behind, it must not be the
    // household that just asked to be forgotten.
    const after = await readSnapshot();
    expect(JSON.stringify(after?.state || {})).not.toContain('Sam');
    expect(after?.state?.onboarded).toBe(false);
    expect(getApp().onboarded).toBe(false);
  });
});
