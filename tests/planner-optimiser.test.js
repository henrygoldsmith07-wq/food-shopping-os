import { describe, it, expect } from 'vitest';
import { buildPlan, chooseCandidate, pantryHits, windowBudget } from '../src/lib/planner.js';

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

  it('a month plan competes against its scaled budget and the month spend', () => {
    // The caller scales the weekly allowance to the window — here £10 × a
    // 28-day month (4 weeks) = £40. With £36 of that month already spent, £4
    // is left: lavish (£8 for two) is over, frugal (£2) fits and its reason
    // says so in the same language the week scope uses.
    const out = chooseCandidate([[lavish], [frugal]], { ...base, weeklyBudget: 40, budgetSpent: 36 }, true, true);
    expect(out.meals[0].id).toBe('f1');
    expect(out.optimiserReasons.join(' ')).toMatch(/£2 left\./);
  });
});

describe('windowBudget — the weekly allowance scaled to a plan window', () => {
  it('a 7-day window scales ×1 and longer windows scale by their weeks', () => {
    expect(windowBudget(10, 7)).toBe(10); // one week is unchanged
    expect(windowBudget(10, 14)).toBe(20); // two weeks
    expect(windowBudget(10, 31)).toBeCloseTo(44.29, 2); // 31/7 weeks, exact not rounded up
  });

  it('no budget or no window keeps the cost dimension off', () => {
    expect(windowBudget(0, 7)).toBeNull();
    expect(windowBudget(null, 31)).toBeNull();
    expect(windowBudget(10, 0)).toBeNull(); // a day or single meal has no window
  });
});

describe('a focused pantry tap is pinned into the plan', () => {
  const base = { scope: 'A week', people: 2, today: '2026-08-22', budget: 4, goal: 'maintain' };
  const usesSpinach = (meals) => meals.some((m) => pantryHits(m, ['Spinach']) >= 1);

  it('guarantees the item lands in the week whatever the seed', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const plan = buildPlan({ ...base, focus: ['Spinach'] }, seed);
      expect(plan.meals.length).toBe(7);
      expect(usesSpinach(plan.meals), `seed ${seed}`).toBe(true);
      // The plan says what it promised, naming the dish that uses the item.
      expect(plan.note).toMatch(/is pinned in — it uses Spinach before it goes off\./);
    }
  });

  it('pins a dish in when the same seed would otherwise skip the item', () => {
    // Seed 2's unfocused week contains no spinach dish at all — the focused
    // run must change the outcome, not just talk about favouring it.
    const without = buildPlan({ ...base }, 2);
    expect(usesSpinach(without.meals)).toBe(false);
    const withFocus = buildPlan({ ...base, focus: ['Spinach'] }, 2);
    expect(usesSpinach(withFocus.meals)).toBe(true);
    expect(withFocus.note).toMatch(/uses Spinach before it goes off\./);
  });

  it('covers a single-meal scope too', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const plan = buildPlan({ ...base, scope: '1 meal', focus: ['Spinach'] }, seed);
      expect(plan.meals).toHaveLength(1);
      expect(usesSpinach(plan.meals), `seed ${seed}`).toBe(true);
    }
  });

  it('stays honest when no dish can use the focused item', () => {
    // A focused item nothing in the book cooks: the plan is unchanged and no
    // pin is claimed — a silent false promise is worse than no promise.
    const plain = buildPlan({ ...base }, 5);
    const impossible = buildPlan({ ...base, focus: ['Foobar unicorn spice'] }, 5);
    expect(impossible.meals.map((m) => m.id)).toEqual(plain.meals.map((m) => m.id));
    expect(impossible.note).toBeNull();
  });
});
