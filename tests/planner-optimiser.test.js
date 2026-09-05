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

describe('multi-objective budget headroom', () => {
  // Cost-only meals: with no pantry or price table in play, the ranking's only
  // active dimension is budget fit, so the winner is decided by headroom alone.
  const lavish = { id: 'l1', title: 'l1', cuisine: 'fancy', costPerServing: 4, ingredients: [] };
  const frugal = { id: 'f1', title: 'f1', cuisine: 'plain', costPerServing: 1, ingredients: [] };
  const base = { people: 2, today: '2026-08-22' };

  it('spend flips the winner against the same weekly budget', () => {
    // Nothing spent: both fit the full £10 budget, so the tie keeps candidate 0.
    const untouched = chooseCandidate([[lavish], [frugal]], { ...base, weeklyBudget: 10, budgetSpent: 0 }, true, true);
    expect(untouched.meals[0].id).toBe('l1');
    // £5 already spent: £5 left. Lavish (£8 for two) is over; frugal (£2) fits.
    const spent = chooseCandidate([[lavish], [frugal]], { ...base, weeklyBudget: 10, budgetSpent: 5 }, true, true);
    expect(spent.meals[0].id).toBe('f1');
    expect(spent.optimiserReasons.join(' ')).toMatch(/£3 left\./);
  });

  it('without a weekly budget, spend never enters the ranking', () => {
    const out = chooseCandidate([[lavish], [frugal]], { ...base, budgetSpent: 5 }, true, true);
    expect(out.meals[0].id).toBe('l1'); // tie stands — no budget dimension
    expect(out.optimiserReasons.join(' ')).not.toMatch(/budget|left|Over the/i);
  });

  it('costs are judged for the household size, not a single eater', () => {
    // Four people at £4/serving costs £16 a meal — over a £10 week; the £1 dish
    // (£4 for four) fits. A people-less ranking would flatter the lavish meal.
    const out = chooseCandidate([[lavish], [frugal]], { ...base, people: 4, weeklyBudget: 10, budgetSpent: 0 }, true, true);
    expect(out.meals[0].id).toBe('f1');
  });
});
