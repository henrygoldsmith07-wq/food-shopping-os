import { describe, it, expect } from 'vitest';
import { WEEK_LOOP_STEPS, WEEK_LOOP_IDS, WEEK_LOOP_PROMISE } from '../src/data/weekLoop.js';
import {
  scaleQty,
  shoppingForWeekLoop,
  pantryCheckForPlan,
  nextWeekLoopStep,
  prevWeekLoopStep,
  weekLoopSnapshot,
} from '../src/lib/week-loop.js';
import { EMPTY_STATE } from '../src/lib/state.js';
import { deriveApp } from '../src/lib/derive.js';

const day = '2026-07-28';

describe('week loop workflow', () => {
  it('defines the full plan→shop→cook→leftover hand-off chain', () => {
    expect(WEEK_LOOP_IDS).toEqual([
      'plan', 'portions', 'pantry', 'list', 'prices', 'shop', 'stock', 'cook', 'leftovers', 'reuse',
    ]);
    expect(WEEK_LOOP_STEPS).toHaveLength(10);
    expect(WEEK_LOOP_PROMISE).toMatch(/plan meals/i);
  });

  it('walks next/prev steps in order', () => {
    expect(nextWeekLoopStep('plan').id).toBe('portions');
    expect(nextWeekLoopStep('reuse')).toBe(null);
    expect(prevWeekLoopStep('portions').id).toBe('plan');
    expect(prevWeekLoopStep('plan')).toBe(null);
  });

  it('scales free-text quantities for household portions', () => {
    expect(scaleQty('200 g', 2)).toBe('400 g');
    expect(scaleQty('1', 3)).toBe('3');
    expect(scaleQty('handful', 2)).toBe('handful');
    expect(scaleQty('100g', 1)).toBe('100g');
  });

  it('builds a deduplicated shopping list reduced by pantry', () => {
    const state = {
      ...EMPTY_STATE,
      day,
      plan: {
        [day]: { dinner: 'chicken-traybake' },
        '2026-07-29': { dinner: 'chicken-traybake' }, // same dish twice → one ingredient set
      },
      pantry: [{ id: 'p1', name: 'Olive oil', cat: 'Cupboard' }],
      household: 2,
      portions: 2,
    };
    // derive not required; shoppingForWeekLoop reads plan/pantry/portions
    const list = shoppingForWeekLoop({
      ...state,
      portions: 2,
      household: 2,
    }, [day, '2026-07-29']);
    const names = list.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('olive'))).toBe(false); // pantry covered if recipe uses olive oil name match
    // Dedup: one row per ingredient name
    expect(new Set(list.map((i) => i.name.toLowerCase())).size).toBe(list.length);
  });

  it('pantry check reports planned vs missing', () => {
    const app = {
      day,
      plan: { [day]: { dinner: 'chicken-traybake' } },
      pantry: [],
      portions: 1,
    };
    const check = pantryCheckForPlan(app, [day]);
    expect(check.plannedMeals).toBe(1);
    expect(check.missing).toBeGreaterThan(0);
    expect(check.missingItems.length).toBe(check.missing);
  });

  it('snapshot points at plan when nothing is scheduled', () => {
    const state = { ...EMPTY_STATE, day, onboarded: true };
    const app = { ...state, ...deriveApp(state) };
    const snap = weekLoopSnapshot(app);
    expect(snap.done.plan).toBe(false);
    expect(snap.nextStepId).toBe('plan');
    expect(snap.dates).toHaveLength(7);
  });

  it('snapshot marks plan done once a meal is set', () => {
    const state = {
      ...EMPTY_STATE,
      day,
      onboarded: true,
      plan: { [day]: { dinner: 'chicken-traybake' } },
    };
    const app = { ...state, ...deriveApp(state) };
    const snap = weekLoopSnapshot(app);
    expect(snap.done.plan).toBe(true);
    expect(snap.stats.meals).toBeGreaterThan(0);
  });
});
