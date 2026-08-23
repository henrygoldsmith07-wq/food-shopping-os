import { describe, it, expect } from 'vitest';
import { chooseCandidate, buildPlan } from '../src/lib/planner.js';

const meal = (id, ingredients) => ({ id, title: id, ingredients });
const ricey = meal('rice-bowl', [{ name: 'Rice', qty: '400 g' }]);
const pasta = meal('pasta-night', [{ name: 'Pasta', qty: '400 g' }]);

describe('planner ↔ optimiser integration', () => {
  const wasteOptions = {
    pantry: [{ name: 'Rice', qty: '500 g' }],
    people: 2,
    today: '2026-08-22',
  };

  it('multi-objective mode lets pantry coverage break a waste tie', () => {
    const out = chooseCandidate([[pasta], [ricey]], wasteOptions, true, true);
    expect(out.meals[0].id).toBe('rice-bowl');
    expect(out.optimiserReasons.join(' ')).toMatch(/pantry/i);
    // Legacy contract preserved: the waste model fields stay on the result.
    expect(out.score != null && out.breakdown != null).toBe(true);
  });

  it('legacy mode keeps pure waste selection with no optimiser fields', () => {
    const out = chooseCandidate([[pasta], [ricey]], wasteOptions, true, false);
    expect(out.optimiserScore).toBeUndefined();
    expect(out.meals.length).toBeGreaterThan(0);
  });

  it('buildPlan accepts multiObjective and still fills the scope under a time cap', () => {
    const plan = buildPlan({
      scope: 'A week',
      multiObjective: true,
      maxTime: 45,
      people: 2,
    }, 7);
    expect(plan.meals).toHaveLength(7);
    expect(plan.meals.every((m) => Number(m.time || 0) <= 45)).toBe(true);
    expect(plan.wasteScore != null || plan.wastePlan != null).toBe(true);
  });

  it('empty candidate lists never crash either mode', () => {
    expect(chooseCandidate([], wasteOptions, true, true).meals).toEqual([]);
    expect(chooseCandidate([], wasteOptions, true, false).meals).toEqual([]);
  });
});
