import { describe, it, expect } from 'vitest';
import { householdActions } from '../src/lib/household-actions.js';

let n = 0;
const uid = (p) => `${p}${++n}`;
const makeStore = (init = {}) => {
  let state = { day: '2026-10-21', members: [], shoppingList: [], chores: [], householdEvents: [], pantry: [], myRecipes: [], activeMemberId: null, householdName: 'Home', ...init };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { a: householdActions(set, uid), get: () => state };
};

describe('household actions', () => {
  it('adds members with safe defaults and logs an event', () => {
    const { a, get } = makeStore();
    a.addMember({ name: '  ', portions: 0, role: 'child' });
    const m = get().members[0];
    expect(m).toMatchObject({ name: 'Person 1', portions: 1, role: 'child' });
    expect(get().householdEvents).toHaveLength(1);
  });
  it('toggles diets even when a legacy member has no diets array', () => {
    const { a, get } = makeStore({ members: [{ id: 'x', role: 'adult' }] });
    a.toggleMemberDiet('x', 'vegan');
    expect(get().members[0].diets).toEqual(['vegan']);
    a.toggleMemberDiet('x', 'vegan');
    expect(get().members[0].diets).toEqual([]);
  });
  it('removing a member unassigns their items and chores', () => {
    const { a, get } = makeStore({ members: [{ id: 'x', name: 'Sam' }], shoppingList: [{ id: 'i', assigneeId: 'x' }], chores: [{ id: 'c', assigneeId: 'x' }], activeMemberId: 'x' });
    a.removeMember('x');
    expect(get().members).toEqual([]);
    expect(get().shoppingList[0].assigneeId).toBeNull();
    expect(get().chores[0].assigneeId).toBeNull();
    expect(get().activeMemberId).toBeNull();
  });
  it('allergy toggle lowercases, trims and ignores blanks', () => {
    const { a, get } = makeStore({ members: [{ id: 'x' }] });
    a.toggleMemberAllergy('x', '  Peanut ');
    a.toggleMemberAllergy('x', '  ');
    expect(get().members[0].allergies).toEqual(['peanut']);
    a.toggleMemberAllergy('x', 'PEANUT');
    expect(get().members[0].allergies).toEqual([]);
  });
  it('chores: blank titles rejected, toggle logs open/done', () => {
    const { a, get } = makeStore();
    a.addChore({ title: '   ' });
    expect(get().chores).toEqual([]);
    a.addChore({ title: 'Bins' });
    const id = get().chores[0].id;
    a.toggleChore(id);
    expect(get().chores[0].done).toBe(true);
    expect(get().householdEvents.at(-1).message).toBe('Bins marked done.');
    a.toggleChore('nope');
  });
  it('setActiveMember ignores unknown ids; events cap at 50', () => {
    const { a, get } = makeStore({ members: [{ id: 'x', name: 'S' }] });
    a.setActiveMember('zzz');
    expect(get().activeMemberId).toBeNull();
    for (let i = 0; i < 60; i += 1) a.addChore({ title: `t${i}` });
    expect(get().householdEvents).toHaveLength(50);
  });
  it('importHousehold keeps existing lists when the snapshot omits them', () => {
    const { a, get } = makeStore({ members: [{ id: 'x', name: 'S' }], pantry: [{ id: 'p' }] });
    a.importHousehold({ householdName: 'New' });
    expect(get().members).toHaveLength(1);
    expect(get().pantry).toHaveLength(1);
    expect(get().householdName).toBe('New');
    a.importHousehold();
    expect(get().chores).toEqual([]);
  });
});
