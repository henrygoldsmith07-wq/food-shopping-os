import { describe, expect, it } from 'vitest';
import {
  adoptRemoteListRows,
  baseListFingerprint,
  offlineQueue,
  reconcileShoppingDivergence,
  mergePantry,
} from '../src/lib/household-concurrency.js';
import { mergePermittedState } from '../src/server/household-scope.js';

const row = (over) => ({
  id: 'milk', name: 'Milk', qty: '2', checked: false, checkedBy: null, checkedAt: null, price: 0,
  ...over,
});

describe('multi-device sync sequences — nothing silently discarded', () => {
  it('merges concurrent pantry edits by quantity instead of dropping one side', () => {
    const local = [{ id: 'p1', name: 'Flour', qty: '500 g' }];
    const remote = [{ id: 'p2', name: 'flour', qty: '500 g' }];
    const { pantry, conflicts } = mergePantry(local, remote, { today: '2026-09-27' });
    // Same measurable quantity: one merged row, no conflict, no loss.
    expect(conflicts).toEqual([]);
    expect(pantry).toHaveLength(1);
    expect(pantry[0].merged).toBe(true);
  });

  it('replays an offline queue after a stale reconnect without duplicating', async () => {
    const fixed = { now: () => 1727400000000, random: () => 0.123456789 };
    const op = { type: 'check', id: 'milk', checked: true };
    const q1 = offlineQueue.enqueue([], op, fixed);
    const q2 = offlineQueue.enqueue(q1, op, fixed);
    // Same op at the same instant keeps a stable id: dedupe drops the retry.
    expect(q1[0].id).toBe(q2[1].id);
    const seen = new Set();
    const applied = [];
    const results = await offlineQueue.replay(q2, async (item) => {
      if (seen.has(item.id)) return { deduped: true };
      seen.add(item.id);
      applied.push(item);
      return { ok: true };
    });
    expect(results).toHaveLength(2);
    expect(applied).toHaveLength(1);
  });

  it('derives the same conflict id for the same divergence, every retry', () => {
    const base = baseListFingerprint([row({ qty: '1' })]);
    const first = reconcileShoppingDivergence([row({ qty: '3' })], [row({ qty: '2' })], base);
    const second = reconcileShoppingDivergence([row({ qty: '3' })], [row({ qty: '2' })], base);
    expect(first.conflicts).toHaveLength(1);
    expect(first.conflicts[0].id).toBe(second.conflicts[0].id);
    expect(first.conflicts[0].id.startsWith('lc_milk_')).toBe(true);
  });

  it('adopts remote rows after another remote write without losing local additions', () => {
    const base = baseListFingerprint([row({})]);
    const localState = { shoppingList: [row({}), { ...row({ id: 'eggs', name: 'Eggs' }), qty: '6' }], listConflicts: [] };
    // Remote ticked milk AND added bread while we added eggs offline.
    const remoteRows = [row({ checked: true, checkedAt: 999, checkedBy: 'ada' }), { ...row({ id: 'bread', name: 'Bread' }), qty: '1' }];
    const next = adoptRemoteListRows(localState, remoteRows, base);
    expect(next).not.toBeNull();
    const names = next.shoppingList.map((r) => r.name).sort();
    expect(names).toEqual(['Bread', 'Eggs', 'Milk']);
    // Milk was untouched locally: the remote tick wins, nothing to settle.
    expect(next.conflicts).toBe(0);
  });

  it('preserves health-scoped fields when the writer lacks permission', () => {
    const current = { shoppingList: [{ id: 's1', name: 'Milk' }], log: { mood: 'ok' } };
    const incoming = { shoppingList: [{ id: 's1', name: 'Milk' }, { id: 's2', name: 'Bread' }], log: { mood: 'hacked' } };
    const next = mergePermittedState(current, incoming, ['shopping'], []);
    expect(next.shoppingList).toHaveLength(2);
    expect(next.log).toEqual({ mood: 'ok' });
  });
});
