import { describe, expect, it } from 'vitest';
import { AUTOPILOT_CONFIDENCE_POLICY, rankAutopilotActions, shouldAutoApply } from '../src/lib/autopilot.js';
import { RECIPES } from '../src/data/recipes.js';

const base = { day: '2026-08-03', pantry: [], plan: {}, shoppingList: [], shops: [], cooked: [], portions: 2 };

describe('confidence-aware autopilot', () => {
  it('exposes a cautious policy: only cheap + high-confidence auto-applies', () => {
    expect(AUTOPILOT_CONFIDENCE_POLICY.autoApply).toEqual({ maxReversalCost: 'low', minConfidence: 'high' });
    expect(shouldAutoApply({ reversalCost: 'low', confidence: 'high' })).toBe(true);
    expect(shouldAutoApply({ reversalCost: 'medium', confidence: 'high' })).toBe(false);
    expect(shouldAutoApply({ reversalCost: 'low', confidence: 'medium' })).toBe(false);
  });

  it('tags every action with cost, confidence and confirmation need', () => {
    const actions = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'p1', name: 'Chicken', expiry: '2026-08-04' }],
    });
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a).toHaveProperty('reversalCost');
      expect(a).toHaveProperty('confidence');
      expect(a).toHaveProperty('needsConfirmation');
      expect(['low', 'medium', 'high']).toContain(a.reversalCost);
    }
  });

  it('stays cautious on inferred leftovers: confirmation required', () => {
    const actions = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'l1', name: 'Saved curry', cat: 'Leftovers', expiry: '2026-08-04', portions: 2 }],
    });
    const reuse = actions.find((a) => a.id === 'reuse-leftover');
    expect(reuse).toBeDefined();
    expect(reuse.needsConfirmation).toBe(true);
    expect(reuse.caution).toMatch(/check|limited evidence/i);
  });

  it('keeps the expiring-food nudge cheap and confident', () => {
    const [item] = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'p1', name: 'Chicken', expiry: '2026-08-04' }],
    });
    expect(item.id).toBe('use-expiring');
    expect(item.reversalCost).toBe('low');
    expect(item.confidence).toBe('high');
  });

  it('still prioritises cooking a planned meal that uses expiring food', () => {
    const actions = rankAutopilotActions({
      ...base,
      pantry: [{ id: 'p1', name: 'Chicken', expiry: '2026-08-04' }],
      plan: { '2026-08-03': { dinner: RECIPES[0].id } },
    });
    expect(actions[0].id).toBe('cook-planned');
  });
});
