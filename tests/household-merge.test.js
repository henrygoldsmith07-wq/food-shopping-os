/**
 * Household concurrency — real simultaneous-edit scenarios.
 *
 * These drive the same pure folds the sync paths use (cloud.js wires them
 * into the 409 and pull flows). The rules under test:
 *
 *   - independent changes on two devices always coexist
 *   - one row changed differently on both sides becomes an explicit
 *     conflict holding both copies — never a silent winner
 *   - measurable pantry quantities merge; unmeasurable ones do not
 *   - a pull never throws away this device's unsynced edits
 *   - hard lines (allergens) survive every merge
 *   - the same merge run twice is a no-op (no duplicate rows or conflicts)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  adoptRemoteSharedState, baseStateSnapshot, mergeSharedState,
} from '../src/lib/household-merge.js';
import {
  mergeRowFields, threeWayMap, threeWayRecords, threeWayRows, threeWaySets,
} from '../src/lib/state-merge.js';
import { planActions } from '../src/lib/plan-actions.js';
import { pantryActions } from '../src/lib/pantry-actions.js';

const baseFor = (rows, fields) => Object.fromEntries(
  rows.filter((row) => row?.id).map((row) => [row.id, JSON.stringify(fields.map((f) => [f, row[f] ?? null]))]),
);

describe('three-way row mechanics', () => {
  const fields = ['name', 'qty', 'note'];

  it('merges disjoint field edits on one row instead of raising a fight', () => {
    const base = baseFor([{ id: 'a', name: 'Rice', qty: '500g', note: null }], fields);
    const { rows, fights } = threeWayRows(
      [{ id: 'a', name: 'Rice', qty: '500g', note: 'for risotto' }], // mine: added a note
      [{ id: 'a', name: 'Basmati rice', qty: '500g', note: null }], // theirs: renamed
      base,
      { fields },
    );
    expect(fights).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('for risotto');
    expect(rows[0].name).toBe('Basmati rice');
  });

  it('fights only when both sides changed the same field differently', () => {
    const base = baseFor([{ id: 'a', name: 'Rice', qty: '500g', note: null }], fields);
    const { rows, fights } = threeWayRows(
      [{ id: 'a', name: 'Rice', qty: '1kg', note: null }],
      [{ id: 'a', name: 'Rice', qty: '250g', note: null }],
      base,
      { fields },
    );
    expect(fights).toHaveLength(1);
    expect(fights[0].contested).toEqual(['qty']);
    expect(rows).toEqual([]); // parked in the fight, no silent winner
  });

  it('respects a deletion the other side never touched, but never loses an edit', () => {
    const base = baseFor([
      { id: 'a', name: 'Rice', qty: '500g', note: null },
      { id: 'b', name: 'Pasta', qty: '1', note: null },
    ], fields);
    // Remote deleted Rice (untouched here) and edited Pasta (untouched here? no — local edited Pasta).
    const { rows } = threeWayRows(
      [{ id: 'b', name: 'Pasta', qty: '1', note: 'edited here' }],
      [{ id: 'b', name: 'Penne', qty: '1', note: null }],
      base,
      { fields },
    );
    expect(rows.map((r) => r.id)).toEqual(['b']); // Rice stays deleted
    // The edited row survives a deletion on the other side:
    const { rows: kept } = threeWayRows(
      [{ id: 'a', name: 'Rice', qty: '750g', note: null }],
      [],
      base,
      { fields },
    );
    expect(kept.map((r) => r.id)).toEqual(['a']);
  });

  it('excludes rows parked in an open conflict so re-merging is a no-op', () => {
    const rows = [{ id: 'a', name: 'Rice', qty: '500g', note: null }];
    const first = threeWayRows(rows, [{ id: 'a', name: 'Rice', qty: '1kg', note: null }], {}, { fields });
    expect(first.fights).toHaveLength(1);
    const parked = new Set(['a']);
    const second = threeWayRows(
      [], // the row is parked inside the conflict locally
      [{ id: 'a', name: 'Rice', qty: '1kg', note: null }],
      {},
      { fields, parked },
    );
    expect(second.rows).toEqual([]);
    expect(second.fights).toEqual([]); // the parked row does not re-fight
  });

  it('merges rows whose fields compare equal even without a base', () => {
    const merged = mergeRowFields(
      { id: 'a', name: 'Rice', qty: '500g' },
      { id: 'a', name: 'Rice', qty: '500g' },
      undefined,
      fields,
    );
    expect(merged.contested).toEqual([]);
    expect(merged.row.qty).toBe('500g');
  });
});

describe('set, map and record mechanics', () => {
  it('keeps additions from either side and respects removals', () => {
    expect(threeWaySets(['nuts'], ['dairy'], [])).toEqual(['nuts', 'dairy']);
    // Removed locally while the household left it alone → stays removed.
    expect(threeWaySets([], ['dairy'], ['dairy'])).toEqual([]);
    // Added on both sides → one copy.
    expect(threeWaySets(['nuts'], ['nuts'], [])).toEqual(['nuts']);
  });

  it('map keys: one-sided wins, double edits take the household copy', () => {
    expect(threeWayMap({ a: 1 }, { a: 2, b: 3 }, { a: 1 })).toEqual({ a: 2, b: 3 });
    expect(threeWayMap({ a: 9 }, { a: 2 }, { a: 1 })).toEqual({ a: 2 }); // both changed
  });

  it('records merge by id and never resurrect an untouched deletion', () => {
    const base = [{ id: 'r1', name: 'Chilli' }, { id: 'r2', name: 'Soup' }];
    const merged = threeWayRecords(
      [{ id: 'r1', name: 'Chilli' }], // deleted r2 locally
      [{ id: 'r1', name: 'Chilli' }, { id: 'r2', name: 'Soup' }, { id: 'r3', name: 'Stew' }],
      base,
    );
    expect(merged.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
  });

  it('records without ids merge by content (cooked meals, CGM readings)', () => {
    const merged = threeWayRecords(
      [{ recipeId: 'pasta', date: '2026-09-20' }],
      [{ recipeId: 'pasta', date: '2026-09-20' }, { recipeId: 'curry', date: '2026-09-21' }],
      [],
    );
    expect(merged).toHaveLength(2);
  });
});

describe('mergeSharedState: real concurrent edits', () => {
  const household = (over = {}) => ({
    onboarded: true,
    shoppingList: [],
    pantry: [],
    plan: {},
    log: {},
    myRecipes: [],
    allergies: [],
    weeklyBudget: 0,
    ...over,
  });

  it('pantry: one device edits a quantity while the other adds an item — both survive', () => {
    const base = household({
      pantry: [{ id: 'p1', name: 'Rice', qty: '500g', unit: 'g', cat: 'Cupboard', location: 'Cupboard', expiry: null, note: null, low: false }],
    });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({
      pantry: [{ id: 'p1', name: 'Rice', qty: '1kg', unit: 'g', cat: 'Cupboard', location: 'Cupboard', expiry: null, note: null, low: false }],
    });
    const theirs = household({
      pantry: [
        { id: 'p1', name: 'Rice', qty: '500g', unit: 'g', cat: 'Cupboard', location: 'Cupboard', expiry: null, note: null, low: false },
        { id: 'p2', name: 'Pasta', qty: '1', unit: 'pack', cat: 'Cupboard', location: 'Cupboard', expiry: null, note: null, low: false },
      ],
    });
    const { state, conflicts } = mergeSharedState(mine, theirs, snapshot);
    expect(conflicts.pantry).toEqual([]);
    expect(state.pantry.map((p) => [p.id, p.qty])).toEqual([['p1', '1kg'], ['p2', '1']]);
  });

  it('pantry: both devices change one quantity measurably → one merged amount', () => {
    const base = household({
      pantry: [{ id: 'p1', name: 'Rice', qty: '500g', ingredientKey: 'rice' }],
    });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ pantry: [{ id: 'p1', name: 'Rice', qty: '750g', ingredientKey: 'rice' }] });
    const theirs = household({ pantry: [{ id: 'p1', name: 'Rice', qty: '1kg', ingredientKey: 'rice' }] });
    const { state, conflicts } = mergeSharedState(mine, theirs, snapshot);
    expect(conflicts.pantry).toEqual([]);
    expect(state.pantry).toHaveLength(1);
    expect(state.pantry[0].merged).toBe(true);
    // 750 g + 1 kg is measurable and adds up.
    expect(String(state.pantry[0].qty)).toMatch(/1\.?75\s?kg|1750/);
  });

  it('pantry: an unmeasurable double edit becomes a conflict holding both copies', () => {
    const base = household({
      pantry: [{ id: 'p1', name: 'Rice', qty: 'some', ingredientKey: 'rice' }],
    });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ pantry: [{ id: 'p1', name: 'Rice', qty: 'a bag', ingredientKey: 'rice' }] });
    const theirs = household({ pantry: [{ id: 'p1', name: 'Rice', qty: 'two mugs', ingredientKey: 'rice' }] });
    const { state, conflicts } = mergeSharedState(mine, theirs, snapshot);
    expect(conflicts.pantry).toHaveLength(1);
    expect(conflicts.pantry[0].mine.qty).toBe('a bag');
    expect(conflicts.pantry[0].theirs.qty).toBe('two mugs');
    // This device's row stays on the shelf — the pantry never goes blank.
    expect(state.pantry.map((p) => p.qty)).toEqual(['a bag']);
  });

  it('plan: independent slots on two devices coexist', () => {
    const base = household({ plan: {} });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ plan: { '2026-09-28': { dinner: 'chicken-traybake' } } });
    const theirs = household({ plan: { '2026-09-29': { lunch: 'chickpea-curry' } } });
    const { state, conflicts } = mergeSharedState(mine, theirs, snapshot);
    expect(conflicts.plan).toEqual([]);
    expect(state.plan).toEqual({
      '2026-09-28': { dinner: 'chicken-traybake' },
      '2026-09-29': { lunch: 'chickpea-curry' },
    });
  });

  it('plan: the same slot changed differently becomes a conflict, not a silent winner', () => {
    const base = household({ plan: { '2026-09-28': { dinner: 'salmon-teriyaki' } } });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ plan: { '2026-09-28': { dinner: 'chicken-traybake' } } });
    const theirs = household({ plan: { '2026-09-28': { dinner: 'chickpea-curry' } } });
    const { state, conflicts } = mergeSharedState(mine, theirs, snapshot);
    expect(conflicts.plan).toHaveLength(1);
    expect(conflicts.plan[0]).toMatchObject({
      date: '2026-09-28',
      slot: 'dinner',
      mine: { recipeId: 'chicken-traybake' },
      theirs: { recipeId: 'chickpea-curry' },
    });
    // This device's plan stays on screen until someone picks.
    expect(state.plan['2026-09-28'].dinner).toBe('chicken-traybake');
  });

  it('preferences: an allergen added on one device survives the other device’s edits', () => {
    const base = household({ allergies: [], weeklyBudget: 0 });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ allergies: [], weeklyBudget: 80 }); // edited the budget
    const theirs = household({ allergies: ['nuts'], weeklyBudget: 0 }); // added a hard line
    const { state } = mergeSharedState(mine, theirs, snapshot);
    expect(state.allergies).toContain('nuts');
    expect(state.weeklyBudget).toBe(80);
  });

  it('my recipes: each device’s new recipe survives the other’s edit', () => {
    const base = household({ myRecipes: [] });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ myRecipes: [{ id: 'm1', name: 'My chilli' }] });
    const theirs = household({ myRecipes: [{ id: 'm2', name: 'Their soup' }] });
    const { state } = mergeSharedState(mine, theirs, snapshot);
    expect(state.myRecipes.map((r) => r.id).sort()).toEqual(['m1', 'm2']);
  });

  it('the diary merges day by day without losing either side’s entries', () => {
    const base = household({ log: { '2026-09-20': [{ id: 'e1', name: 'Toast' }] } });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ log: { '2026-09-20': [{ id: 'e1', name: 'Toast' }, { id: 'e2', name: 'Yogurt' }] } });
    const theirs = household({ log: {
      '2026-09-20': [{ id: 'e1', name: 'Toast' }],
      '2026-09-21': [{ id: 'e3', name: 'Curry' }],
    } });
    const { state } = mergeSharedState(mine, theirs, snapshot);
    expect(state.log['2026-09-20'].map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(state.log['2026-09-21'].map((e) => e.id)).toEqual(['e3']);
  });

  it('a pull never discards this device’s unsynced edits (the old wholesale replace did)', () => {
    // Ada ticks Milk locally but has not pushed yet. The household copy lands
    // with a pantry item Sam added. Before the three-way merge the pull
    // replaced local state wholesale and the tick vanished.
    const base = household({
      shoppingList: [{ id: 'm1', name: 'Milk', qty: '2', checked: false, checkedAt: null, checkedBy: null }],
      pantry: [],
    });
    const snapshot = baseStateSnapshot(base, 3);
    const local = household({
      shoppingList: [{ id: 'm1', name: 'Milk', qty: '2', checked: true, checkedAt: 500, checkedBy: 'ada' }],
      pantry: [],
    });
    const remote = household({
      shoppingList: [{ id: 'm1', name: 'Milk', qty: '2', checked: false, checkedAt: null, checkedBy: null }],
      pantry: [{ id: 'p9', name: 'Eggs', qty: '6', ingredientKey: 'eggs' }],
    });
    const adopted = adoptRemoteSharedState(local, remote, snapshot);
    expect(adopted).not.toBeNull();
    expect(adopted.state.shoppingList[0].checked).toBe(true); // the tick survived
    expect(adopted.state.pantry.map((p) => p.id)).toEqual(['p9']); // their addition survived
    expect(adopted.conflicts).toBe(0);
  });

  it('running the same merge twice is a no-op', () => {
    const base = household({ plan: { '2026-09-28': { dinner: 'salmon-teriyaki' } } });
    const snapshot = baseStateSnapshot(base, 3);
    const mine = household({ plan: { '2026-09-28': { dinner: 'chicken-traybake' } } });
    const theirs = household({ plan: { '2026-09-28': { dinner: 'chickpea-curry' } } });
    const first = mergeSharedState(mine, theirs, snapshot);
    const again = mergeSharedState(first.state, theirs, snapshot);
    expect(again.conflicts.plan).toEqual([]); // the fight is parked in an open conflict
    expect(again.state.plan).toEqual(first.state.plan);
    expect(again.state.planConflicts.filter((c) => c.status === 'open')).toHaveLength(1);
  });

  it('adopts the household copy exactly when this device has nothing of its own', () => {
    const base = household({});
    const snapshot = baseStateSnapshot(base, 3);
    const remote = household({ weeklyBudget: 60, plan: { '2026-09-28': { dinner: 'chickpea-curry' } } });
    const adopted = adoptRemoteSharedState(household({}), remote, snapshot);
    expect(adopted.state.weeklyBudget).toBe(60);
    expect(adopted.state.plan).toEqual(remote.plan);
    // ...and returns null when the copies already agree.
    expect(adoptRemoteSharedState(remote, remote, snapshot)).toBeNull();
  });
});

describe('resolving merged conflicts through the real actions', () => {
  const drive = (slice, state) => {
    const ref = { state };
    const actions = slice((patch) => {
      const changes = typeof patch === 'function' ? patch(ref.state) : patch;
      ref.state = { ...ref.state, ...changes };
      return ref.state;
    });
    return { state: () => ref.state, actions };
  };

  it('resolvePlanConflict puts the household’s meal in the slot when picked', () => {
    const conflict = {
      id: 'plc_2026-09-28|dinner_x', type: 'plan', status: 'open',
      date: '2026-09-28', slot: 'dinner',
      mine: { recipeId: 'chicken-traybake' }, theirs: { recipeId: 'chickpea-curry' },
    };
    const app = drive(planActions, {
      plan: { '2026-09-28': { dinner: 'chicken-traybake' } },
      planConflicts: [conflict],
    });
    app.actions.resolvePlanConflict(conflict.id, 'theirs');
    expect(app.state().plan['2026-09-28'].dinner).toBe('chickpea-curry');
    expect(app.state().planConflicts[0].status).toBe('resolved');
    // Keeping mine leaves the slot alone and still settles the conflict.
    const keep = drive(planActions, {
      plan: { '2026-09-28': { dinner: 'chicken-traybake' } },
      planConflicts: [{ ...conflict, id: 'plc_2' }],
    });
    keep.actions.resolvePlanConflict('plc_2', 'mine');
    expect(keep.state().plan['2026-09-28'].dinner).toBe('chicken-traybake');
    expect(keep.state().planConflicts[0].status).toBe('resolved');
  });

  it('resolvePantryConflict shelves both copies on keep-separate and merges on combine', () => {
    const mine = { id: 'p1', name: 'Rice', qty: 'a bag', ingredientKey: 'rice' };
    const theirs = { id: 'p1', name: 'Rice', qty: 'two mugs', ingredientKey: 'rice' };
    const conflict = {
      id: 'pc_p1_x', type: 'divergence', status: 'open', ingredientKey: 'rice',
      itemIds: ['p1'], itemNames: ['Rice'], title: 'Check Rice', reason: 'x', action: 'y',
      mine, theirs,
    };
    const separate = drive(pantryActions, { pantry: [{ ...mine }], pantryConflicts: [{ ...conflict }], aliasMemory: {}, day: '2026-09-26', pantryEvents: [] });
    separate.actions.resolvePantryConflict(conflict.id, 'keep_separate');
    expect(separate.state().pantry).toHaveLength(2); // both copies visible
    expect(separate.state().pantryConflicts[0].status).toBe('resolved');

    const merged = drive(pantryActions, { pantry: [{ ...mine }], pantryConflicts: [{ ...conflict, id: 'pc_p1_y' }], aliasMemory: {}, day: '2026-09-26', pantryEvents: [] });
    merged.actions.resolvePantryConflict('pc_p1_y', 'merge');
    expect(merged.state().pantry).toHaveLength(1); // one shelf row after combine
    expect(merged.state().pantryConflicts[0].status).toBe('resolved');
  });
});

describe('base snapshots', () => {
  beforeEach(() => localStorage.clear());

  it('value fingerprints are stable across key order', () => {
    const a = baseStateSnapshot({ b: 1, a: { y: 2, x: 1 } }, 1);
    const b = baseStateSnapshot({ a: { x: 1, y: 2 }, b: 1 }, 1);
    expect(a.keys).toEqual(b.keys);
  });

  it('a snapshot round-trips through the cloud base storage helpers', async () => {
    // Regression: the base used to be saved through an unimported function
    // inside a silent try/catch, so every save failed and the divergence base
    // was permanently empty — every sync difference looked like a fight.
    const cloud = await import('../src/lib/cloud.js');
    const state = { shoppingList: [{ id: 'm1', name: 'Milk', qty: '2' }], pantry: [], plan: {} };
    cloud.saveBaseState(state, 7);
    const read = cloud.readBaseState();
    expect(read.version).toBe(7);
    expect(Object.keys(read.keys)).toContain('shoppingList');
    expect(read.keys.shoppingList).toBe(baseStateSnapshot(state, 7).keys.shoppingList);
  });
});
