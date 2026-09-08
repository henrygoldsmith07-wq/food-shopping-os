import { describe, expect, it } from 'vitest';
import { PANTRY_LIFECYCLE_STATES, pantryLifecycleActions } from '../src/lib/store-pantry-slice.js';

const item = { id: 'p1', name: 'Milk', qty: '1l', cost: 1.2, cat: 'Fresh' };
const state = { day: '2026-09-01', pantry: [item], waste: [], pantryEvents: [] };
const deps = { householdPermission: () => true, uid: (p) => `${p}1` };
const run = (fn) => {
  let out = null;
  const set = (updater) => { out = updater(state); return out; };
  fn(pantryLifecycleActions(set, deps));
  return out;
};

describe('pantry domain slice (store decomposition)', () => {
  it('exposes the valid lifecycle states', () => {
    expect(PANTRY_LIFECYCLE_STATES).toContain('discarded');
    expect(PANTRY_LIFECYCLE_STATES).toContain('consumed');
  });

  it('bins an item into waste with a lifecycle event', () => {
    const out = run((a) => a.binPantryItem('p1', { reason: 'expired' }));
    expect(out.pantry).toHaveLength(0);
    expect(out.waste[0]).toMatchObject({ name: 'Milk', reason: 'expired' });
    expect(out.lastPantryEvent.to).toBe('discarded');
  });

  it('consumes an item without wasting it', () => {
    const out = run((a) => a.consumePantryItem('p1', {}));
    expect(out.pantry).toHaveLength(0);
    expect(out.waste ?? []).toHaveLength(0);
    expect(out.lastPantryEvent.to).toBe('consumed');
  });

  it('rejects unknown lifecycle states', () => {
    const out = run((a) => a.updatePantryLifecycle('p1', 'teleported', {}));
    expect(out).toEqual({});
  });

  it('marks opened/discarded transitions', () => {
    const opened = run((a) => a.updatePantryLifecycle('p1', 'opened', {}));
    expect(opened.pantry[0].lifecycleState).toBe('opened');
    const discarded = run((a) => a.updatePantryLifecycle('p1', 'discarded', {}));
    expect(discarded.waste).toHaveLength(1);
  });
});
