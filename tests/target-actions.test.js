import { describe, it, expect } from 'vitest';
import { targetActions } from '../src/lib/target-actions.js';

const base = () => ({
  day: '2026-10-21', targetMode: 'auto', goal: 'maintain', diets: [],
  body: { sex: 'f', age: 30, weightKg: 65, heightCm: 168, activity: 1.4 },
  targets: { kcal: 2000, protein: 60, carbs: 250, fat: 70 },
});
const makeStore = (init = {}) => {
  let state = { ...base(), ...init };
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  return { a: targetActions(set), get: () => state };
};

describe('target actions', () => {
  it('setTarget on a macro switches to custom and clamps bad numbers to 0', () => {
    const { a, get } = makeStore();
    a.setTarget('kcal', -50);
    expect(get().targets.kcal).toBe(0);
    expect(get().targetMode).toBe('custom');
    a.setTarget('kcal', 'abc');
    expect(get().targets.kcal).toBe(0);
  });
  it('setTarget on a non-macro key leaves the mode alone', () => {
    const { a, get } = makeStore();
    a.setTarget('fibre', 30);
    expect(get().targetMode).toBe('auto');
    expect(get().targets.fibre).toBe(30);
  });
  it('custom targets are not recalculated when body or goal change', () => {
    const { a, get } = makeStore({ targetMode: 'custom' });
    const t = get().targets;
    a.setBody({ weightKg: 90 });
    a.setGoal('lose');
    expect(get().targets).toBe(t);
  });
  it('auto targets recompute when the body changes', () => {
    const { a, get } = makeStore();
    a.setBody({ weightKg: 95 });
    expect(get().body.weightKg).toBe(95);
    expect(get().targets).not.toEqual(base().targets);
  });
  it('toggleDiet adds then removes', () => {
    const { a, get } = makeStore({ targetMode: 'custom' });
    a.toggleDiet('vegan');
    expect(get().diets).toEqual(['vegan']);
    a.toggleDiet('vegan');
    expect(get().diets).toEqual([]);
  });
  it('answerGoalScreening stores only yes/no', () => {
    const { a, get } = makeStore({ targetMode: 'custom' });
    a.answerGoalScreening('q1', 'maybe');
    a.answerGoalScreening('q2', 'yes');
    expect(get().goalScreening).toEqual({ q1: 'no', q2: 'yes' });
  });
  it('clearGoalScreening also clears the confirmation', () => {
    const { a, get } = makeStore({ targetMode: 'custom', goalScreening: { q: 'yes' }, targetConfirmation: { x: 1 } });
    a.clearGoalScreening();
    expect(get().goalScreening).toBeNull();
    expect(get().targetConfirmation).toBeNull();
  });
  it('setWeeklyKcal and setMaintenance clamp negatives', () => {
    const { a, get } = makeStore({ targetMode: 'custom' });
    a.setWeeklyKcal(-5); a.setMaintenance(-5);
    expect(get().weeklyKcal).toBe(0);
    expect(get().maintenanceKcal).toBe(0);
  });
});
