import { describe, it, expect } from 'vitest';
import { offlineQueue, mergeShoppingLists, resolveVersionConflict } from '../src/lib/household-concurrency.js';

describe('offline queue — queue now, replay in order on reconnect', () => {
  it('appends immutable entries with ids and timestamps', () => {
    const before = [];
    const after = offlineQueue.enqueue(before, { type: 'pantry-add', payload: { name: 'Rice' } });
    expect(after).toHaveLength(1);
    expect(after[0].type).toBe('pantry-add');
    expect(after[0].id).toMatch(/^pantry-add-\d+-/);
    expect(typeof after[0].queuedAt).toBe('number');
    expect(before).toEqual([]); // original untouched
  });

  it('replays queued operations in order exactly once', async () => {
    let queue = [];
    queue = offlineQueue.enqueue(queue, { type: 'list-check', id: 'op1' });
    queue = offlineQueue.enqueue(queue, { type: 'pantry-add', id: 'op2' });
    const applied = [];
    await offlineQueue.replay(queue, async (op) => { applied.push(op.type); });
    expect(applied).toEqual(['list-check', 'pantry-add']);
  });

  it('an empty queue replays to nothing without calling apply', async () => {
    let calls = 0;
    await offlineQueue.replay([], async () => { calls += 1; });
    expect(calls).toBe(0);
  });
});

describe('multi-user conflict resolution — deterministic under concurrency', () => {
  it('keeps both devices’ distinct items after a reconnect', () => {
    const local = [{ id: 'a', name: 'Milk' }];
    const remote = [{ id: 'b', name: 'Eggs' }];
    const merged = mergeShoppingLists(local, remote);
    expect(merged.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('same item edited offline twice: newest checkedAt wins, loser stays visible as mergedFrom', () => {
    const local = [{ id: 'a', name: 'Milk', checkedAt: 200 }];
    const remote = [{ id: 'a', name: 'Milk', checkedAt: 300 }];
    const merged = mergeShoppingLists(local, remote, { lastChangedAtLocal: 1, lastChangedAtRemote: 2 });
    expect(merged[0].checkedAt).toBe(300);
    expect(merged[0].mergedFrom).toBe('remote-wins');
  });

  it('identical timestamps break ties lexically, never randomly', () => {
    const local = [{ id: 'a', name: 'X', checkedAt: 100 }];
    const remote = [{ id: 'a', name: 'Y', checkedAt: 100 }];
    const once = mergeShoppingLists(local, remote);
    const twice = mergeShoppingLists(local, remote);
    expect(once[0].mergedFrom).toBe('tie-lexical');
    expect(once[0].id).toBe(twice[0].id);
    expect(once[0].name).toBe(twice[0].name);
  });

  it('version conflicts always resolve to a single authoritative side', () => {
    expect(resolveVersionConflict(3, 5, 'local-state', 'remote-state').winner).toBe('remote');
    expect(resolveVersionConflict(7, 2, 'local-state', 'remote-state').winner).toBe('local');
  });
});
