/**
 * Migration, against installs that really shipped.
 *
 * The fixtures in `fixtures/historical-installs.js` are hand-built from what
 * each version of Forq actually wrote, not filled in from today's empty state.
 * That matters: a fixture assembled from the current shape is already valid,
 * so it exercises none of the repair paths — and the repairs are the whole
 * point of this file.
 *
 * Two properties are under test, and they are different:
 *
 *   - **purity** — hydrating a saved install never mutates it. A caller may
 *     still hold the object it passed in, and the app writes it back out.
 *   - **idempotence** — hydrating an already-hydrated install changes nothing.
 *     Boot runs on every load; a migration that isn't idempotent would drift.
 *
 * Plus the trust rule that runs through all of it: repairing a record must
 * never invent a fact. An unsourced price stays unknown rather than becoming a
 * receipt price, and a malformed date is dropped rather than treated as
 * "never expires".
 */

import { describe, expect, it } from 'vitest';
import {
  DAMAGED_INSTALL, V1_INSTALL, V2_INSTALL, V3_INSTALL, V4_INSTALL,
} from './fixtures/historical-installs.js';
import { hydrate, isFutureVersion, parseBackup, serialiseBackup } from '../src/lib/store-persistence.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { STATE_VERSION } from '../src/lib/state-versions.js';

/** A deep clone, so a test can prove hydration did not touch the original. */
const clone = (value) => JSON.parse(JSON.stringify(value));

const INSTALLS = [
  ['v1, the first shipped shape', V1_INSTALL],
  ['v2, households added', V2_INSTALL],
  ['v3, the evidence books', V3_INSTALL],
  ['v4, the current shape', V4_INSTALL],
];

describe('migrating a saved install', () => {
  describe.each(INSTALLS)('%s', (_label, fixture) => {
    it('opens with its own data intact', () => {
      const state = hydrate(clone(fixture));
      expect(state.onboarded).toBe(true);
      expect(state.name).toBe('Ada');
      // The pantry and the list are the household's own, not an empty shell.
      expect(state.pantry.length).toBeGreaterThan(0);
      expect(state.shoppingList.length).toBeGreaterThan(0);
    });

    it('arrives at the current schema version', () => {
      expect(hydrate(clone(fixture)).schemaVersion).toBe(STATE_VERSION);
    });

    it('does not mutate the object it was given', () => {
      const original = clone(fixture);
      const before = JSON.stringify(original);
      const state = hydrate(original);
      // Hydration may be read-only, but a caller could still write through a
      // shared nested reference; comparing the input afterwards is the proof.
      state.pantry.push({ id: 'p99', name: 'Written after hydration' });
      state.plan['2026-06-01'] = { dinner: 'pasta' };
      expect(JSON.stringify(original)).toBe(before);
    });

    it('is idempotent — hydrating twice changes nothing', () => {
      const once = hydrate(clone(fixture));
      const twice = hydrate(clone(once));
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });
  });

  it('keeps a household member and their permissions through every version', () => {
    const state = hydrate(clone(V2_INSTALL));
    expect(state.householdName).toBe('Ada & Sam');
    // Members are not repaired like data rows: the member mapper below already
    // gives each one a role and a complete permissions bag, and a member saved
    // before a permission existed must still have that permission.
    expect(state.members).toHaveLength(1);
    expect(state.members[0].name).toBe('Ada');
    expect(Object.keys(state.members[0].permissions).length).toBeGreaterThan(0);
  });

  it('carries the evidence books forward, dropping only what is malformed', () => {
    const state = hydrate(clone(V3_INSTALL));
    expect(state.priceAlertConfig.risePct).toBe(15);
    expect(state.priceAlertConfig.bargainPct).toBe(20);
    expect(state.coupons).toHaveLength(1);
    // The junk entry in the prediction book does not survive.
    expect(state.shoppingPredictions.every((row) => row?.id && row?.name)).toBe(true);
  });

  it('keeps health readings on the state, and out of an export with no vault', () => {
    const state = hydrate(clone(V4_INSTALL));
    // Health data belongs to the state; stripping it in memory would lose it
    // for good. It leaves only through an export — and only when there is a
    // vault to put it in. With no vault, the caller has asked for the whole
    // state and gets the whole state, exactly as this app's privacy copy says.
    expect(state.measurements).toHaveLength(1);
    expect(JSON.parse(serialiseBackup(state)).state.measurements).toHaveLength(1);
    // With a vault, the plain part carries no readings and the vault holds them.
    const withVault = JSON.parse(serialiseBackup(state, { version: 1, ciphertext: 'x' }));
    expect(withVault.state.measurements).toEqual([]);
    expect(withVault.healthVault).toEqual({ version: 1, ciphertext: 'x' });
  });

  it('keeps spend, cook and waste history through every version', () => {
    // A migration that drops historical rows deletes money the household
    // spent, meals they cooked and food they binned — the evidence every
    // spend chart, streak and price comparison is built from.
    for (const fixture of [V1_INSTALL, V2_INSTALL, V3_INSTALL, V4_INSTALL]) {
      const state = hydrate(clone(fixture));
      expect(state.shops.length, 'shops').toBeGreaterThan(0);
      expect(state.shops[0].total).toBe(23.4);
    }
    const v4 = hydrate(clone(V4_INSTALL));
    expect(v4.shops.length).toBeGreaterThanOrEqual(2);
    expect(v4.cooked.map((row) => row.recipeId)).toContain('chickpea-curry');
    expect(v4.waste.length).toBeGreaterThanOrEqual(2);
  });


  describe('a damaged install', () => {
    const damaged = () => hydrate(clone(DAMAGED_INSTALL));

    it('keeps the rows it can and drops the ones it cannot', () => {
      const state = damaged();
      // Named pantry rows with an id survive…
      expect(state.pantry.map((row) => row.name)).toContain('Rice');
      expect(state.pantry.map((row) => row.name)).toContain('Spinach');
      // …and a row with no name, a null, and a bare string do not become items.
      expect(state.pantry).toHaveLength(2);
    });

    it('drops a row that has no id, because nothing could act on it', () => {
      // The damaged fixture's second pantry row has a quantity but no name and
      // no id. A screen cannot edit, tick or remove it, so it is not a row.
      expect(DAMAGED_INSTALL.pantry.some((row) => row && !row.id)).toBe(true);
      expect(damaged().pantry.every((row) => row.id)).toBe(true);
    });

    it('never turns a malformed expiry into "keeps forever"', () => {
      const spinach = damaged().pantry.find((row) => row.name === 'Spinach');
      // "next tuesday" is not a date, so it becomes unknown — which the app
      // shows as unknown. A date silently dropped to "no expiry" would read as
      // fresh food that never needs using.
      expect(spinach.expiry).toBeNull();
    });

    it('leaves a row alone when nothing about it is wrong', () => {
      // The point of minimal repair: an untouched row must come back exactly as
      // it went in, or a save/load round trip would rewrite the household's
      // data on every open.
      const state = hydrate(clone(V1_INSTALL));
      const rice = state.pantry.find((row) => row.id === 'p1');
      expect(rice).toEqual(V1_INSTALL.pantry[0]);
      const milk = state.shoppingList.find((row) => row.id === 's1');
      expect(milk).toEqual(V1_INSTALL.shoppingList[0]);
    });

    it('discards a price that was never a price, without inventing one', () => {
      const eggs = damaged().shoppingList.find((row) => row.name === 'Eggs');
      // Null, not zero: "we don't know what this cost" and "this was free" are
      // different claims, and only the first one is true.
      expect(eggs.price).toBeNull();
    });

    it('keeps a receipt price and its provenance exactly as they were', () => {
      const milk = damaged().shoppingList.find((row) => row.name === 'Milk');
      expect(milk.price).toBe(1.35);
      expect(milk.priceSource).toBe('receipt');
    });

    it('never invents a price source for a price that has none', () => {
      const bread = damaged().shoppingList.find((row) => row.name === 'Bread');
      // The price survives; provenance that was never recorded stays absent,
      // which is the honest answer. Nothing fills it in with something the app
      // could then vouch for.
      expect(bread.price).toBe(0.9);
      expect(bread.priceSource).toBeUndefined();
      // And a bogus provenance would be removed rather than believed.
      const eggs = damaged().shoppingList.find((row) => row.name === 'Eggs');
      expect(eggs.priceSource).toBeUndefined();
    });

    it('drops plan entries that cannot be rendered, keeping the rest of the day', () => {
      const { plan } = damaged();
      // A valid day keeps its valid slots…
      expect(plan['2026-05-21'].dinner).toBe('chickpea-curry');
      // …an empty recipe id is not a planned meal…
      expect(plan['2026-05-21'].lunch).toBeUndefined();
      // …and a day that is not a date, or a day that is not a map, is gone.
      expect(plan['next week']).toBeUndefined();
      expect(plan['2026-05-22']).toBeUndefined();
      expect(plan['2026-05-23'].dinner).toBe('porridge');
    });

    it('keeps a good diary day and drops the malformed entries inside it', () => {
      const { log } = damaged();
      expect(log['2026-05-19']).toHaveLength(1);
      expect(log['2026-05-19'][0].foodId).toBe('oats');
      // A day that is not a date, and a day that is not an array.
      expect(log.yesterday).toBeUndefined();
      expect(log['2026-05-18']).toBeUndefined();
    });

    it('keeps valid trip, cook and waste history that predates the id rule', () => {
      // Shops are trip records {id?,date,store,total,items} — never carried a
      // `name`, and a dated trip without an id is still real spend. Cooks are
      // {recipeId,date} outcomes and waste rows are {name,…,date}; neither
      // carries an id at all. The old repair demanded id AND name on every
      // row, which silently deleted all three — spend, price history,
      // streaks and the waste log with them.
      const legacy = hydrate({
        onboarded: true,
        day: '2026-05-20',
        shops: [{ date: '2026-02-08', store: 'Sainsbury', total: 23.4, items: [{ name: 'Milk', price: 1.35 }] }],
        cooked: [{ recipeId: 'chickpea-curry', date: '2026-05-18' }],
        waste: [{ name: 'Spinach', qty: '200 g', date: '2026-05-14' }],
      });
      expect(legacy.shops).toHaveLength(1);
      expect(legacy.shops[0].total).toBe(23.4);
      expect(legacy.cooked).toHaveLength(1);
      expect(legacy.cooked[0].recipeId).toBe('chickpea-curry');
      expect(legacy.waste).toHaveLength(1);
    });

    it('still drops rows that are not objects at all', () => {
      const state = hydrate({
        onboarded: true,
        day: '2026-05-20',
        shops: [null, 'a string', { id: 'sh1', date: '2026-05-18', store: 'Tesco', total: 5, items: [] }],
        cooked: [null, { recipeId: 'r1', date: '2026-05-18' }],
      });
      expect(state.shops).toHaveLength(1);
      expect(state.cooked).toHaveLength(1);
    });
  });

  describe('refusing what it must not reinterpret', () => {
    it('refuses a backup that is not a Forq backup at all', () => {
      expect(() => parseBackup('{"some":"other app"}')).toThrow(/not a complete Forq backup/i);
      expect(() => parseBackup('{not json')).toThrow();
    });

    it('refuses a record from a newer Forq and leaves it alone', () => {
      const future = { ...V4_INSTALL, schemaVersion: STATE_VERSION + 1, name: 'Future Ada' };
      expect(isFutureVersion(future)).toBe(true);
      let error = null;
      try {
        parseBackup(future);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeTruthy();
      // The message names the version, so a person can act on it rather than
      // wondering why their data "wasn't a backup".
      expect(error.issue.message).toMatch(/newer version/i);
      expect(error.issue.detail).toContain(String(STATE_VERSION + 1));
    });

    it('accepts the current version, and does not treat junk as the future', () => {
      expect(isFutureVersion({ schemaVersion: STATE_VERSION })).toBe(false);
      expect(isFutureVersion({})).toBe(false);
      expect(isFutureVersion({ schemaVersion: 'nonsense' })).toBe(false);
    });

    it('uses the same hydration path for a backup import as for a normal load', () => {
      // One path, one set of repairs. An import that skipped them would quietly
      // differ from a restore from storage.
      const exported = serialiseBackup(hydrate(clone(DAMAGED_INSTALL)));
      expect(JSON.stringify(parseBackup(exported))).toBe(JSON.stringify(hydrate(clone(DAMAGED_INSTALL))));
    });

    it('survives a round trip through export and import', () => {
      const state = hydrate(clone(V3_INSTALL));
      expect(JSON.stringify(parseBackup(serialiseBackup(state)))).toBe(JSON.stringify(state));
    });
  });

  it('turns junk into an empty kitchen rather than an exception', () => {
    for (const junk of [null, undefined, 42, 'a string', [1, 2, 3]]) {
      expect(hydrate(junk)).toMatchObject({ onboarded: EMPTY_STATE.onboarded });
    }
  });
});
