import { describe, it, expect } from 'vitest';
import { WEEK_LOOP_STEPS, WEEK_LOOP_IDS, WEEK_LOOP_PROMISE } from '../src/data/weekLoop.js';
import {
  scaleQty,
  shoppingForWeekLoop,
  householdPortionsFor,
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
    const { items: list } = shoppingForWeekLoop({
      ...state,
      portions: 2,
      household: 2,
    }, [day, '2026-07-29']);
    const names = list.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('olive'))).toBe(false); // pantry covered if recipe uses olive oil name match
    // Dedup: one row per ingredient name
    expect(new Set(list.map((i) => i.name.toLowerCase())).size).toBe(list.length);
  });

  it('scales quantities for the learned appetite when recorded cooks disagree with the profile', () => {
    // Chicken Traybake serves 4 and asks for 8 thighs. Two configured
    // portions want 4 thighs; a learned appetite of 3 wants 6.
    const base = {
      day,
      plan: { [day]: { dinner: 'chicken-traybake' } },
      pantry: [],
      portions: 2,
    };
    const configured = shoppingForWeekLoop(base, [day]);
    expect(configured.portions).toEqual({
      portions: 2, source: 'configured', configured: 2, override: 'auto', autoPortions: 2, autoLearned: false,
      evidence: { observations: 0, typical: null },
    });
    const thighs = (name) => configured.items.find((item) => item.name === name)?.qty;
    expect(thighs('Chicken thighs')).toBe('4');

    const learnedApp = {
      ...base,
      householdPreferences: { portions: { typical: 3, observations: 4 } },
    };
    const learned = shoppingForWeekLoop(learnedApp, [day]);
    expect(learned.portions.source).toBe('learned');
    expect(learned.items.find((item) => item.name === 'Chicken thighs')?.qty).toBe('6');

    // A raw-state household with no derived profile learns from cooked
    // events too — the same decision, not a second one.
    const rawLearned = shoppingForWeekLoop({
      ...base,
      cooked: [{ portions: 3 }, { portions: 3 }, { portions: 3 }],
    }, [day]);
    expect(rawLearned.portions.source).toBe('learned');
    expect(rawLearned.items.find((item) => item.name === 'Chicken thighs')?.qty).toBe('6');

    // An explicit override beats the learning: the household said 5, the list
    // is scaled for 5, even though the appetite says 3.
    const overridden = shoppingForWeekLoop({
      ...learnedApp,
      portionsOverride: 5,
    }, [day]);
    expect(overridden.portions.source).toBe('configured');
    expect(overridden.items.find((item) => item.name === 'Chicken thighs')?.qty).toBe('10');
  });

  it('keeps the configured portions until the appetite evidence is strong', () => {
    // Fewer than 3 observations, or a gap under half a portion: the
    // household's own setting still wins.
    const weak = { portions: 2, householdPreferences: { portions: { typical: 3, observations: 2 } } };
    expect(householdPortionsFor(weak)).toEqual({
      portions: 2, source: 'configured', configured: 2, override: 'auto', autoPortions: 2, autoLearned: false,
      evidence: { observations: 2, typical: 3 },
    });
    const close = { portions: 2, householdPreferences: { portions: { typical: 2.25, observations: 9 } } };
    expect(householdPortionsFor(close)).toEqual({
      portions: 2, source: 'configured', configured: 2, override: 'auto', autoPortions: 2, autoLearned: false,
      evidence: { observations: 9, typical: 2.25 },
    });
    const strong = { portions: 2, householdPreferences: { portions: { typical: 3, observations: 3 } } };
    expect(householdPortionsFor(strong).source).toBe('learned');
    expect(householdPortionsFor(strong).portions).toBe(3);
    // A broken or absent profile never breaks the list.
    expect(householdPortionsFor({ portions: 2, householdPreferences: null }).source).toBe('configured');
    expect(householdPortionsFor({}).portions).toBe(1);
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
