/**
 * The manual backup escape hatch, exercised end to end through the real store.
 *
 * Cloud sync is opt-in and often switched off entirely — for a lot of installs
 * `exportData` / `restoreData` is the ONLY route between two devices, and the
 * only recovery from a wiped browser profile. Nothing else covers it: the sync
 * suites test the household path, and the migration suites test `hydrate`'s
 * purity and idempotence, but neither proves that what a user exports can be
 * put back.
 *
 * The properties under test:
 *
 *   - **round-trip** — export, wipe the install, restore, and the household is
 *     back. Not "mostly back": the day, the plan, the pantry, the list and the
 *     cooked history all survive, because a partial restore is the failure mode
 *     that looks like success until someone notices a missing week.
 *   - **the vault is not silently folded into the export** — health records
 *     live behind their own switch, and a backup taken with it off must not
 *     start carrying them.
 *   - **garbage is refused, not half-applied** — a bad file leaves the current
 *     install exactly as it was rather than replacing it with a partial state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY, HEALTH_VAULT_KEY, todayStamp } from '../src/lib/state.js';
import { resetStoreHandles } from '../src/lib/persistent-state.js';

const haveIndexedDb = Boolean(new IDBFactory());

/** Drive the real provider so the code under test is the code that ships. */
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

/**
 * A household as a real install holds it.
 *
 * `day` is today: boot deliberately rolls a stale day forward
 * (`applyBootLifecycle` → `rolloverDay`), so seeding a past date here would be
 * asserting against behaviour the product gets right on purpose. The plan is
 * keyed to the same day so the round-trip has a real slot to carry.
 */
const TODAY = todayStamp();

const seeded = (overrides = {}) => ({
  onboarded: true,
  name: 'Sam',
  day: TODAY,
  household: 2,
  plan: { [TODAY]: { dinner: 'r1' } },
  pantry: [{ id: 'p1', name: 'Rice', qty: '1 bag', location: 'Cupboard', low: false }],
  shoppingList: [{ id: 's1', name: 'Milk', qty: '1 pint', checked: false }],
  cooked: [{ recipeId: 'r1', date: '2026-07-27' }],
  healthVaultEnabled: false,
  ...overrides,
});

/** Wipe an install the way a cleared browser profile would. */
const wipeInstall = () => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  resetStoreHandles();
};

describe.skipIf(!haveIndexedDb)('backup export and restore', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    resetStoreHandles();
  });

  afterEach(() => {
    cleanup();
    wipeInstall();
    vi.restoreAllMocks();
  });

  it('round-trips a household through export, a wiped install and a restore', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded()));
    const getApp = await renderStore();
    const original = getApp();
    expect(original.name).toBe('Sam');

    const backup = await act(async () => original.exportData());
    expect(typeof backup).toBe('string');
    // The envelope names itself and the version that wrote it, so a restore can
    // tell whose file it is holding.
    expect(JSON.parse(backup).format).toBe('forq-backup');

    // The install is gone — a new device, or a cleared profile.
    cleanup();
    wipeInstall();

    const getFresh = await renderStore();
    expect(getFresh().name).not.toBe('Sam');

    const result = await act(async () => getFresh().restoreData(backup));
    expect(result.ok).toBe(true);
    const restored = getFresh();

    // The things a household would actually notice missing.
    expect(restored.name).toBe('Sam');
    expect(restored.day).toBe(TODAY);
    expect(restored.household).toBe(2);
    expect(restored.plan[TODAY].dinner).toBe('r1');
    expect(restored.pantry.map((item) => item.name)).toEqual(['Rice']);
    expect(restored.shoppingList.map((item) => item.name)).toEqual(['Milk']);
    expect(restored.cooked).toEqual([{ recipeId: 'r1', date: '2026-07-27' }]);
  });

  it('does not fold health records into a backup taken with the vault off', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded({ healthVaultEnabled: false })));
    localStorage.setItem(HEALTH_VAULT_KEY, JSON.stringify({ secret: 'never exported' }));
    const getApp = await renderStore();

    const backup = JSON.parse(await act(async () => getApp().exportData()));
    expect(backup.healthVault).toBeUndefined();
    expect(JSON.stringify(backup.state)).not.toContain('never exported');
  });

  it('refuses an unreadable file and leaves the current install untouched', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded({ name: 'Keep me' })));
    const getApp = await renderStore();
    expect(getApp().name).toBe('Keep me');

    const result = await act(async () => getApp().restoreData('{ not json at all'));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    // A failed restore is not a half-restore: the household standing here is
    // still the one that was here before the import was attempted.
    expect(getApp().name).toBe('Keep me');
    expect(getApp().pantry.map((item) => item.name)).toEqual(['Rice']);
  });

  it('accepts a bare state object, which is what pre-envelope installs wrote', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded()));
    const getApp = await renderStore();

    const result = await act(async () =>
      getApp().restoreData(JSON.stringify({ onboarded: true, name: 'Legacy install' })));
    expect(result.ok).toBe(true);
    expect(getApp().name).toBe('Legacy install');
  });

  it('rolls a restored household dated in the past forward to today', async () => {
    // Restoring is not time travel. A backup taken three months ago, opened
    // today, belongs to today — otherwise the diary, the plan and every
    // "expiring soon" surface would silently read the wrong day. This pins the
    // behaviour so it is not mistaken for a round-trip bug later.
    const stale = seeded({ day: '2020-01-01', plan: { '2020-01-01': { dinner: 'r1' } } });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
    const getApp = await renderStore();
    const backup = await act(async () => getApp().exportData());
    expect(JSON.parse(backup).state.day).toBe(TODAY);

    cleanup();
    wipeInstall();
    const getFresh = await renderStore();
    const result = await act(async () => getFresh().restoreData(backup));
    expect(result.ok).toBe(true);
    expect(getFresh().day).toBe(TODAY);
  });
});
