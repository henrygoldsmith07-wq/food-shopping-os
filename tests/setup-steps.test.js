import { describe, it, expect } from 'vitest';
import { setupSteps, setupProgress } from '../src/lib/setup.js';

/* Every step is a gate on a real feature, read from the same records as the
   rest of the app — so it has to tick itself off the moment you do the thing,
   and untick if you undo it. Nothing here is a stored flag. */

const done = (state) => setupSteps(state).filter((s) => s.done).map((s) => s.id);

describe('the getting-started checklist', () => {
  it('starts with nothing ticked on a brand new app', () => {
    const p = setupProgress({});
    expect(p.done).toBe(0);
    expect(p.total).toBe(6);
    expect(p.pct).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.next.id).toBe('targets');
  });

  it('every step names a screen you can actually get to', () => {
    const tabs = ['home', 'plan', 'log', 'shop', 'recipes', 'profile'];
    for (const step of setupSteps({})) {
      expect(tabs).toContain(step.go);
      expect(step.label.length).toBeGreaterThan(0);
      // The reason has to say what the step switches on, not restate the step.
      expect(step.why.length).toBeGreaterThan(20);
    }
  });

  it('counts a target only once the figure behind it is settled', () => {
    // A kcal number with no maintenance behind it isn't a resolved target.
    expect(done({ targets: { kcal: 2200 } })).not.toContain('targets');
    expect(done({ targets: { kcal: 2200 }, maintenanceKcalResolved: 2400 })).toContain('targets');
    // Typing your own figure settles it without any estimate.
    expect(done({ targets: { kcal: 1800 }, targetMode: 'custom' })).toContain('targets');
  });

  it('ticks the diary on the first entry, on any day', () => {
    expect(done({ log: {} })).not.toContain('log');
    expect(done({ log: { '2026-07-28': [] } })).not.toContain('log');
    expect(done({ log: { '2026-07-01': [{ id: 'a' }] } })).toContain('log');
  });

  it('ticks pantry, plan, shop and cook off their own records', () => {
    expect(done({ pantry: [{ id: 'p1' }] })).toContain('pantry');
    expect(done({ plan: { '2026-07-28': { dinner: 'r1' } } })).toContain('plan');
    expect(done({ shops: [{ id: 's1' }] })).toContain('shop');
    expect(done({ cooked: [{ id: 'c1' }] })).toContain('cook');
  });

  it('unticks again if the record goes away', () => {
    const withPantry = setupProgress({ pantry: [{ id: 'p1' }] });
    const without = setupProgress({ pantry: [] });
    expect(withPantry.done).toBe(1);
    expect(without.done).toBe(0);
  });

  it('points at the first thing still outstanding, in unlock order', () => {
    const p = setupProgress({ targets: { kcal: 2000 }, targetMode: 'custom', log: { d: [{}] } });
    expect(p.next.id).toBe('pantry');
    expect(p.done).toBe(2);
    expect(p.pct).toBe(33);
  });

  it('reorders the next gate when a product mode is set', () => {
    const p = setupProgress({
      productMode: 'meal_planning',
      targets: { kcal: 2000 },
      targetMode: 'custom',
      log: { d: [{}] },
    });
    // Meal planning puts plan before pantry.
    expect(p.next.id).toBe('plan');
  });

  it('reports complete, with nothing left to point at', () => {
    const p = setupProgress({
      targets: { kcal: 2000 },
      targetMode: 'custom',
      log: { d: [{}] },
      pantry: [{}],
      plan: { d: {} },
      shops: [{}],
      cooked: [{}],
    });
    expect(p.complete).toBe(true);
    expect(p.pct).toBe(100);
    expect(p.next).toBe(null);
  });

  it('survives a state object with none of the keys in it', () => {
    expect(() => setupProgress()).not.toThrow();
    expect(setupProgress().done).toBe(0);
  });
});
