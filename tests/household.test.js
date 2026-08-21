import { describe, expect, it } from 'vitest';
import { householdFromShareCode, householdShareCode } from '../src/lib/household.js';

describe('household snapshots', () => {
  it('round-trips the shared household domains', () => {
    const code = householdShareCode({
      householdName: 'Home',
      members: [{ id: 'm1', name: 'Alex', role: 'child', portions: 1, diets: ['vegetarian'], permissions: { shopping: false } }],
      pantry: [{ id: 'p1', name: 'Milk', qty: '1 pint' }],
      shoppingList: [{ id: 's1', name: 'Oats', assigneeId: 'm1' }],
      myRecipes: [{ id: 'r1', name: 'Soup', ingredients: [{ name: 'Carrot' }], steps: [{ text: 'Cook it.' }] }],
      chores: [{ id: 'c1', title: 'Clear the fridge', assigneeId: 'm1', done: false }],
    });

    const out = householdFromShareCode(code);
    expect(out.householdName).toBe('Home');
    expect(out.members[0]).toMatchObject({ name: 'Alex', role: 'child' });
    expect(out.pantry[0].name).toBe('Milk');
    expect(out.shoppingList[0]).toMatchObject({ name: 'Oats', assigneeId: 'm1' });
    expect(out.myRecipes[0].name).toBe('Soup');
    expect(out.chores[0].title).toBe('Clear the fridge');
  });

  it('rejects damaged or oversized snapshots', () => {
    expect(() => householdFromShareCode('not-a-code')).toThrow(/invalid or damaged/i);
    const code = `FORQ-HOUSEHOLD-1.${btoa(JSON.stringify({ members: Array.from({ length: 51 }, (_, i) => ({ name: `Person ${i}` })) }))}`;
    expect(() => householdFromShareCode(code)).toThrow(/invalid or damaged/i);
  });
});
