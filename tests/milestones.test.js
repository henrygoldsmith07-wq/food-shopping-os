import { describe, it, expect } from 'vitest';
import { firstSessionMilestones, milestonesComplete } from '../src/lib/milestones.js';

/**
 * Milestones are counted from what the household actually did — never from
 * taps on the card itself — and the card's whole existence ends the moment
 * all four are done.
 */
describe('first-session milestones', () => {
  it('starts with all four open for an empty household', () => {
    const milestones = firstSessionMilestones({});
    expect(milestones.map((m) => m.id)).toEqual(['item', 'meal', 'list', 'shop']);
    expect(milestonesComplete(milestones)).toBe(false);
  });

  it('marks each one from real state', () => {
    const pantryOnly = firstSessionMilestones({ pantry: [{ id: 'p1' }] });
    expect(pantryOnly.find((m) => m.id === 'item').done).toBe(true);
    expect(pantryOnly.find((m) => m.id === 'meal').done).toBe(false);

    const planned = firstSessionMilestones({ plan: { '2026-09-01': { dinner: 'r1' } } });
    expect(planned.find((m) => m.id === 'meal').done).toBe(true);

    const listed = firstSessionMilestones({ shoppingList: [{ id: 's1' }] });
    expect(listed.find((m) => m.id === 'list').done).toBe(true);

    const shopped = firstSessionMilestones({ shops: [{ id: 't1' }] });
    expect(shopped.find((m) => m.id === 'shop').done).toBe(true);
  });

  it('an item added via the shopping list counts as "add your first item"', () => {
    const milestones = firstSessionMilestones({ shoppingList: [{ id: 's1' }] });
    expect(milestones.find((m) => m.id === 'item').done).toBe(true);
  });

  it('an empty plan object does not complete the meal milestone', () => {
    const milestones = firstSessionMilestones({ plan: {} });
    expect(milestones.find((m) => m.id === 'meal').done).toBe(false);
  });

  it('completing all four ends the card', () => {
    const done = firstSessionMilestones({
      pantry: [{}], shoppingList: [{}], plan: { '2026-09-01': { dinner: 'r' } }, shops: [{}],
    });
    expect(milestonesComplete(done)).toBe(true);
  });
});
