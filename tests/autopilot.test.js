import { describe, expect, it } from 'vitest';
import { autopilotPrimary, rankAutopilotActions } from '../src/lib/autopilot.js';
import { RECIPES } from '../src/data/recipes.js';

const base = { day: '2026-08-03', pantry: [], plan: {}, shoppingList: [], shops: [], cooked: [], portions: 2 };

describe('household food autopilot', () => {
  it('prioritises food that is about to expire before ordinary restocking', () => {
    const [item] = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'p1', name: 'Chicken', expiry: '2026-08-04' }],
      shoppingList: [],
    });
    expect(item.id).toBe('use-expiring');
    expect(item.action.kind).toBe('pantry');
  });

  it('prioritises cooking a planned meal that uses expiring food', () => {
    const actions = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'p1', name: 'Chicken', expiry: '2026-08-04' }],
      plan: { '2026-08-03': { dinner: RECIPES[0].id } },
    });
    expect(actions[0].id).toBe('cook-planned');
    expect(actions[0].priority).toBe('high');
  });

  it('returns a calm fallback when there is no supported urgent action', () => {
    expect(autopilotPrimary(base).id).toBe('steady');
  });
});
