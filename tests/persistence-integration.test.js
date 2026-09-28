/**
 * Persistence, as it actually behaves at runtime.
 *
 * The individual functions are tested elsewhere. What matters here is the
 * *sequence* — a legacy install booting, migrating, and reloading; a canonical
 * record beating a stale local copy; a failed upgrade leaving the old data
 * alone; two tabs agreeing; and a burst of writes not landing out of order.
 * Those are integration facts about the wiring, and no amount of unit testing
 * the parts establishes them.
 *
 * `fake-indexeddb` gives a real, transactional IndexedDB, so the code under
 * test is the same code that runs in a browser. When it is absent these tests
 * are skipped rather than silently passing against a localStorage-only world.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

let persistentState;
let boot;
let freshModules = true;

const load = async () => {
  if (freshModules) {
    vi.resetModules();
    persistentState = await import('../src/lib/persistent-state.js');
    boot = await import('../src/lib/persistence-boot.js');
    freshModules = false;
  }
  return { persistentState, boot };
};

const STORAGE_KEY = 'forq-state-v2';
const POINTER_KEY = 'forq-state-pointer-v1';

/** A state that passes hydration and is recognisable when it comes back. */
const savedState = (overrides = {}) => ({
  onboarded: true,
  name: 'Ada',
  day: '2026-07-28',
  pantry: [{ id: 'p1', name: 'Spinach', qty: '200 g' }],
  shoppingList: [{ id: 's1', name: 'Milk', qty: '2 l', checked: false }],
  ...overrides,
});

const haveIndexedDb = Boolean(new IDBFactory());

describe.skipIf(!haveIndexedDb)('the canonical store, end to end', () => {
  beforeEach(async () => {
    freshModules = true;
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    const { persistentState: ps } = await load();
    ps.resetStoreHandles();
  });

  afterEach(async () => {
    const { persistentState: ps } = await load();
    await ps.clearPersistedState().catch(() => {});
    ps.resetStoreHandles();
    localStorage.clear();
    delete globalThis.indexedDB;
  });

  it('migrates a legacy localStorage install and reloads from IndexedDB', async () => {
    const { persistentState: ps, boot: b } = await load();
    // A pre-migration install: the whole app in localStorage, nothing in IDB.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState()));

    const first = await b.loadCanonicalState();
    expect(first.storage).toBe('indexedDB');
    expect(first.migrated).toBe(true);
    expect(first.state.name).toBe('Ada');
    expect(first.state.pantry).toHaveLength(1);
    // The legacy copy is dropped only after the record is committed.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // The record really is canonical now.
    const record = await ps.readSnapshot();
    expect(record.state.name).toBe('Ada');
    expect(record.seq).toBeGreaterThan(0);

    // A fresh boot — no localStorage to read — comes back from IndexedDB.
    const second = await b.loadCanonicalState();
    expect(second.storage).toBe('indexedDB');
    expect(second.state.name).toBe('Ada');
    expect(second.state.shoppingList[0].name).toBe('Milk');
  });

  it('prefers IndexedDB over a stale localStorage copy', async () => {
    const { persistentState: ps, boot: b } = await load();
    // The canonical record is newer, and a stale legacy copy is still around
    // (e.g. a tab that had not yet noticed the migration).
    await ps.writeSnapshot(savedState({ name: 'Newer', pantry: [{ id: 'p9', name: 'Rice' }] }), { schemaVersion: 4 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState({ name: 'Older' })));

    const result = await b.loadCanonicalState();
    expect(result.storage).toBe('indexedDB');
    expect(result.state.name).toBe('Newer');
  });

  it('keeps localStorage usable when the migration write fails', async () => {
    const { persistentState: ps, boot: b } = await load();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState({ name: 'Legacy Ada' })));
    // A database that refuses to open: the upgrade cannot complete.
    const realOpen = globalThis.indexedDB.open;
    globalThis.indexedDB.open = () => { throw new Error('storage is blocked'); };

    const result = await b.loadCanonicalState();
    globalThis.indexedDB.open = realOpen;
    ps.resetStoreHandles();

    // The app still opens, on the copy it always had, and says why.
    expect(result.storage).toBe('localStorage');
    expect(result.state.name).toBe('Legacy Ada');
    expect(result.issue?.kind).toBe('unavailable');
    // And nothing was destroyed.
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Legacy Ada');
  });

  it('never destroys unreadable data', async () => {
    const { boot: b } = await load();
    const broken = '{ this is not json';
    localStorage.setItem(STORAGE_KEY, broken);

    const result = await b.loadCanonicalState();
    expect(result.issue?.kind).toBe('corrupt');
    expect(result.issue.raw).toBe(broken);
    // The original bytes are still there, byte for byte.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(broken);
  });

  it('refuses a record from a newer Forq without rewriting it', async () => {
    const { persistentState: ps, boot: b } = await load();
    await ps.writeSnapshot(savedState({ schemaVersion: 99, name: 'Future Ada' }), { schemaVersion: 99 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState({ name: 'Legacy Ada' })));

    const result = await b.loadCanonicalState();
    // A future record is not "corrupt" and is not adopted: it is somebody's
    // data, produced by a version that knows more than this build.
    expect(result.issue?.kind).toBe('future');
    const record = await ps.readSnapshot();
    expect(record.state.schemaVersion).toBe(99);
    expect(record.state.name).toBe('Future Ada');
  });

  it('clears every persistence layer on reset', async () => {
    const { persistentState: ps, boot: b } = await load();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState()));
    await b.loadCanonicalState();
    expect(await ps.readSnapshot()).not.toBeNull();

    await b.wipeEverything([STORAGE_KEY]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(POINTER_KEY)).toBeNull();
    // The record is gone, and a subsequent write starts from seq 1 rather than
    // continuing a sequence that described deleted data.
    expect(await ps.readSnapshot()).toBeNull();
    const written = await ps.writeSnapshot(savedState({ name: 'Fresh start' }), { schemaVersion: 4 });
    expect(written.seq).toBe(1);
  });

  it('lets a restored backup repopulate the canonical record', async () => {
    const { persistentState: ps } = await load();
    await ps.writeSnapshot(savedState({ name: 'Before' }), { schemaVersion: 4 });

    // A restore replaces the record rather than merging with it.
    const { serialiseBackup, parseBackup } = await import('../src/lib/store-persistence.js');
    const restored = parseBackup(serialiseBackup(savedState({ name: 'After restore' })));
    const written = await ps.writeSnapshot(restored, { schemaVersion: restored.schemaVersion });

    expect(written.saved).toBe(true);
    const record = await ps.readSnapshot();
    expect(record.state.name).toBe('After restore');
  });

  it('does not let an older async write land on top of a newer one', async () => {
    const { persistentState: ps } = await load();
    // Fire three writes without awaiting between them — the same thing a burst
    // of edits does. Each is issued in order but resolves on its own schedule.
    const first = ps.writeSnapshot(savedState({ name: 'Edit 1' }), { schemaVersion: 4 });
    const second = ps.writeSnapshot(savedState({ name: 'Edit 2' }), { schemaVersion: 4 });
    const third = ps.writeSnapshot(savedState({ name: 'Edit 3' }), { schemaVersion: 4 });
    const results = await Promise.all([first, second, third]);

    // The last write wins, and the sequence never goes backwards.
    const record = await ps.readSnapshot();
    expect(record.state.name).toBe('Edit 3');
    expect(record.seq).toBe(Math.max(...results.map((r) => r.seq)));
  });

  it('keeps the heartbeat out of the state snapshot', async () => {
    const { persistentState: ps } = await load();
    await ps.writeSnapshot(savedState(), { schemaVersion: 4 });
    const at = Date.now();
    await ps.writeHeartbeat(at);
    expect(await ps.readHeartbeat()).toBe(at);
    // Stamping the heartbeat must not have reserialised the app state.
    const record = await ps.readSnapshot();
    expect(record.state.name).toBe('Ada');
  });

  it('signals another tab without passing it the state', async () => {
    const { persistentState: ps } = await load();
    const seen = [];
    ps.createStateChannel();
    const stop = ps.openStateChannel((signal) => seen.push(signal));
    const written = await ps.writeSnapshot(savedState(), { schemaVersion: 4 });
    ps.announceState({ seq: written.seq });
    // Give the message a turn of the event loop to arrive.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    stop();

    expect(seen.length).toBeGreaterThan(0);
    // The signal is a sequence, not a payload: the other tab reads the record.
    expect(seen[0].type).toBe('state');
    expect(seen[0].state).toBeUndefined();
  });

  it('falls back to localStorage, honestly, when IndexedDB is missing', async () => {
    const { boot: b } = await load();
    delete globalThis.indexedDB;
    const { persistentState: ps } = await load();
    ps.resetStoreHandles();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState({ name: 'Fallback Ada' })));

    const result = await b.loadCanonicalState();
    expect(result.storage).toBe('localStorage');
    expect(result.state.name).toBe('Fallback Ada');
    expect(result.migrated).toBe(false);
  });
});
