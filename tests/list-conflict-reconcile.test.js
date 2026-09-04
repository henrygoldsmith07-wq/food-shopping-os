import { describe, it, expect } from 'vitest';
import {
  applyListConflictResolution, baseListFingerprint, reconcileShoppingDivergence, rowFingerprint,
} from '../src/lib/household-concurrency.js';

const row = (over) => ({
  id: 'milk', name: 'Milk', qty: '2', checked: false, checkedBy: null, checkedAt: null, price: 0,
  ...over,
});

describe('reconciling a shared list after a version split', () => {
  it('passes identical rows through untouched', () => {
    const shared = [row({}), row({ id: 'bread', name: 'Bread' })];
    const { rows, conflicts } = reconcileShoppingDivergence(shared, shared, baseListFingerprint(shared));
    expect(conflicts).toEqual([]);
    expect(rows).toEqual(shared);
  });

  it('keeps additions from either side without a fight', () => {
    const base = baseListFingerprint([row({})]);
    const { rows, conflicts } = reconcileShoppingDivergence(
      [row({})],
      [row({}), row({ id: 'bread', name: 'Bread', checkedBy: 'ada' })],
      base,
    );
    expect(conflicts).toEqual([]);
    expect(rows.map((r) => r.name)).toEqual(['Milk', 'Bread']);
  });

  it('lets the side that changed win when the other side did not touch the row', () => {
    const base = baseListFingerprint([row({ qty: '1' })]);
    // Local bumped the quantity; the household copy is still the base version.
    const { rows, conflicts } = reconcileShoppingDivergence(
      [row({ qty: '2' })],
      [row({ qty: '1' })],
      base,
    );
    expect(conflicts).toEqual([]);
    expect(rows[0].qty).toBe('2');
    // And the other way round: the household ticked it, we never touched it.
    const ticked = reconcileShoppingDivergence(
      [row({ qty: '1' })],
      [row({ qty: '1', checked: true, checkedAt: 900, checkedBy: 'ada' })],
      base,
    );
    expect(ticked.conflicts).toEqual([]);
    expect(ticked.rows[0].checked).toBe(true);
  });

  it('turns a row both sides changed differently into a conflict, not a silent winner', () => {
    const base = baseListFingerprint([row({ checked: false })]);
    const { rows, conflicts } = reconcileShoppingDivergence(
      [row({ checked: true, checkedAt: 100, checkedBy: 'sam' })],
      [row({ checked: false })],
      base,
    );
    // Local ticked it; the household copy still shows it unticked — but only
    // because the household never changed it. One-sided: local wins.
    expect(conflicts).toEqual([]);
    expect(rows[0].checked).toBe(true);

    // Now both sides changed it: Sam ticked it on this device while Ada
    // ticked it on hers — two different marks from one shared base. Nobody
    // can decide this silently.
    const untickedBase = baseListFingerprint([row({ checked: false })]);
    const fight = reconcileShoppingDivergence(
      [row({ checked: true, checkedAt: 100, checkedBy: 'sam' })],
      [row({ checked: true, checkedAt: 200, checkedBy: 'ada' })],
      untickedBase,
    );
    expect(fight.conflicts).toHaveLength(1);
    expect(fight.conflicts[0].name).toBe('Milk');
    expect(fight.rows).toEqual([]); // neither copy is assumed
    expect(fight.conflicts[0].mine.checkedBy).toBe('sam');
    expect(fight.conflicts[0].theirs.checkedBy).toBe('ada');
  });

  it('flags a quantity edited on both sides even when the tick state agrees', () => {
    const base = baseListFingerprint([row({ qty: '1' })]);
    const { conflicts } = reconcileShoppingDivergence(
      [row({ qty: '3' })],
      [row({ qty: '2' })],
      base,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('qty');
  });

  it('stays deterministic and stable for the same inputs', () => {
    const base = baseListFingerprint([row({ qty: '1' })]);
    const inputs = () => [
      [row({ qty: '3' })],
      [row({ qty: '2' })],
    ];
    const first = reconcileShoppingDivergence(...inputs(), base);
    const second = reconcileShoppingDivergence(...inputs(), base);
    expect(first.conflicts.length).toBe(second.conflicts.length);
  });
});

describe('resolving a list conflict', () => {
  const make = () => {
    const base = baseListFingerprint([row({ qty: '1' })]);
    const mine = row({ qty: '3' });
    const theirs = row({ qty: '2', checked: true, checkedAt: 500, checkedBy: 'ada' });
    const { rows, conflicts } = reconcileShoppingDivergence([mine], [theirs], base);
    return { rows, conflicts };
  };

  it('keeps my copy and clears the conflict when I pick it', () => {
    const { rows, conflicts } = make();
    const { rows: next, conflicts: nextConflicts } = applyListConflictResolution(rows, conflicts, conflicts[0].id, 'mine');
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe('3');
    expect(next[0].checked).toBe(false);
    expect(nextConflicts[0].status).toBe('resolved');
    expect(nextConflicts[0].resolution).toBe('mine');
  });

  it('keeps the household copy — tick and all — when I pick theirs', () => {
    const { rows, conflicts } = make();
    const { rows: next } = applyListConflictResolution(rows, conflicts, conflicts[0].id, 'theirs');
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe('2');
    expect(next[0].checked).toBe(true);
    expect(next[0].checkedBy).toBe('ada');
  });

  it('is a no-op for an unknown or already-resolved conflict', () => {
    const { rows, conflicts } = make();
    const resolved = applyListConflictResolution(rows, conflicts, conflicts[0].id, 'theirs');
    const again = applyListConflictResolution(resolved.rows, resolved.conflicts, conflicts[0].id, 'mine');
    expect(again.rows).toEqual(resolved.rows);
    expect(again.conflicts).toEqual(resolved.conflicts);
    expect(applyListConflictResolution(rows, conflicts, 'missing', 'mine').rows).toEqual(rows);
  });
});

describe('list fingerprints', () => {
  it('record the fields a row comparison cares about', () => {
    const a = row({ qty: '2' });
    const b = row({ qty: '2', emoji: '🥛' }); // decoration is not a change
    expect(rowFingerprint(a)).toBe(rowFingerprint(b));
    expect(rowFingerprint(row({ qty: '2' }))).not.toBe(rowFingerprint(row({ qty: '3' })));
    expect(rowFingerprint(row({ checked: false }))).not.toBe(
      rowFingerprint(row({ checked: true, checkedAt: 1, checkedBy: 'ada' })),
    );
  });

  it('map ids to fingerprints of the synced base', () => {
    const fp = baseListFingerprint([row({}), row({ id: 'bread', name: 'Bread' })]);
    expect(Object.keys(fp)).toEqual(['milk', 'bread']);
    expect(fp.milk).toBe(rowFingerprint(row({})));
  });
});
