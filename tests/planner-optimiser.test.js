import { describe, it, expect } from 'vitest';
import { buildPlan, chooseCandidate, pantryHits, windowBudget } from '../src/lib/planner.js';
import { rankPlans } from '../src/lib/optimiser.js';

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

describe('a month plan answers to each week, not just its total', () => {
  // Two meals only: lavish (£8 for two) and frugal (£2 for two).
  const lavish = { id: 'l1', title: 'l1', cuisine: 'fancy', costPerServing: 4, ingredients: [] };
  const frugal = { id: 'f1', title: 'f1', cuisine: 'plain', costPerServing: 1, ingredients: [] };
  const base = { people: 2, today: '2026-08-22' };
  const mealCount = (spend) => Array.from({ length: spend }, () => ({}));
  // Two candidate months of 14 dinners: A front-loads (week 1 = £56, week 2
  // = £14 — £70 total); B spends evenly (£20 each week — £40 total). Against
  // a £80 two-week window both fit, but against a £40 weekly allowance A's
  // first week is £16 over.
  const A = [...mealCount(7).map(() => lavish), ...mealCount(7).map(() => frugal)];
  const B = [lavish, ...mealCount(6).map(() => frugal), lavish, ...mealCount(6).map(() => frugal)];

  it('an evenly-spread month outranks a front-loaded one on the same total', () => {
    const out = chooseCandidate([A, B], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weeklyCap: 40, weekChunks: [7, 7],
    }, true, true);
    expect(out.meals[1].id).toBe('f1'); // B's second meal is frugal — A's is lavish
    // B's own week story is the even one; A's front-load warning is why B won.
    expect(out.optimiserReasons.join(' ')).toMatch(/Even across 2 weeks: the priciest week costs £20 of the £40 allowance\./);
    expect(out.optimiserReasons.join(' ')).not.toMatch(/Week 1 of 2 would need £56/);
    const { best } = rankPlans([A, B], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weeklyCap: 40, weekChunks: [7, 7],
    });
    expect(best.candidateIndex).toBe(1); // A's week-1 overage lost it the pick
  });

  it('the worst week decides budgetFit, and the metrics say the split plainly', () => {
    const { best } = rankPlans([A, B], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weeklyCap: 40, weekChunks: [7, 7],
    });
    // A: week fit = 100 − (16 / 40) × 200 = 20, whole fit 100 → 20.
    expect(best.candidateIndex).toBe(1);
    expect(best.metrics.weekCosts).toEqual([20, 20]);
    expect(best.metrics.weeklyCap).toBe(40);
    expect(best.metrics.budgetFit).toBe(100);
    const worst = rankPlans([A], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weeklyCap: 40, weekChunks: [7, 7],
    }).best;
    expect(worst.metrics.weekCosts).toEqual([56, 14]);
    expect(worst.metrics.budgetFit).toBe(20);
  });

  it('without a weekly cap the whole-window fit still rules the ranking', () => {
    // Same candidates, same £80 window — but no per-week allowance: A fits the
    // window too, so the tie keeps candidate 0 and no week is accused.
    const out = chooseCandidate([A, B], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weekChunks: [7, 7], // chunks alone change nothing
    }, true, true);
    expect(out.meals[1].id).toBe('l1'); // A (all lavish first) won the whole-fit tie as before
    expect(out.optimiserReasons.join(' ')).toMatch(/Inside budget at £70/);
    expect(out.optimiserReasons.join(' ')).not.toMatch(/weekly allowance|Even across/);
  });

  it('an evenly-spread month that exceeds no week keeps the whole window honest', () => {
    const out = chooseCandidate([A, B], {
      ...base,
      weeklyBudget: 80, budgetSpent: 0,
      weeklyCap: 40, weekChunks: [7, 7],
    }, true, true);
    expect(out.meals[1].id).toBe('f1');
    expect(out.optimiserReasons.join(' ')).toMatch(/Even across 2 weeks: the priciest week costs £20 of the £40 allowance\./);
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

describe('the focus pin holds under leftover-first and batch weeks', () => {
  const dish = (id, extra = {}) => ({
    id, name: id, emoji: '🍽', meal: 'dinner', cuisine: 'Test', tags: [], time: 20, prep: 5,
    difficulty: 'Easy', servings: 2, kcal: 400, protein: 20, carbs: 50, fat: 10, fibre: 5,
    costPerServing: 2, ingredients: [{ name: 'Rice', qty: '100 g' }], steps: [], ...extra,
  });
  const SPINACH_DAHL = dish('spinach-dahl', {
    name: 'Spinach Dahl',
    ingredients: [{ name: 'Spinach', qty: '150 g' }],
  });
  const LEFTOVER_BOWL = dish('leftover-bowl', { name: 'Leftover Bowl' });
  const BIG = ['k1', 'k2', 'k3'].map((id) => dish(id, { name: `Big ${id}`, servings: 6 }));
  const usesSpinach = (meals) => meals.some((m) => pantryHits(m, ['Spinach']) >= 1);

  it('pins a non-batchable focused dish into a batch week, cooked once', () => {
    // Three dishes worth batching and no spinach among them; the only
    // spinach dish is single-cook. Batching relaxes for exactly that dish.
    const plan = buildPlan({
      scope: 'A week', batch: true, focus: ['Spinach'],
      recipes: [SPINACH_DAHL, ...BIG],
    }, 7);
    expect(plan.meals).toHaveLength(7);
    expect(usesSpinach(plan.meals)).toBe(true);
    expect(plan.meals.filter((m) => m.id === 'spinach-dahl')).toHaveLength(1);
    expect(plan.note).toMatch(/Spinach Dahl is pinned in — it uses Spinach before it goes off\./);
  });

  it('pins a focused dish when leftovers already fill the whole week', () => {
    const plan = buildPlan({
      scope: 'A week', focus: ['Spinach'],
      recipes: [SPINACH_DAHL, LEFTOVER_BOWL],
      leftovers: [{ recipeId: 'leftover-bowl', portions: 7 }],
    }, 7);
    expect(plan.meals).toHaveLength(7);
    expect(usesSpinach(plan.meals)).toBe(true);
    // One leftover portion steps aside (it keeps for later) to make room.
    expect(plan.meals.filter((m) => m.id === 'spinach-dahl')).toHaveLength(1);
    expect(plan.meals.filter((m) => m.id === 'leftover-bowl')).toHaveLength(6);
    expect(plan.note).toMatch(/Spinach Dahl is pinned in/);
    expect(plan.note).toMatch(/one portion waits for later/);
  });

  it('a full-leftover week stays untouched when no dish can use the focus', () => {
    const plain = buildPlan({
      scope: 'A week',
      recipes: [SPINACH_DAHL, LEFTOVER_BOWL],
      leftovers: [{ recipeId: 'leftover-bowl', portions: 7 }],
    }, 7);
    const impossible = buildPlan({
      scope: 'A week', focus: ['Foobar unicorn spice'],
      recipes: [SPINACH_DAHL, LEFTOVER_BOWL],
      leftovers: [{ recipeId: 'leftover-bowl', portions: 7 }],
    }, 7);
    expect(impossible.meals.map((m) => m.id)).toEqual(plain.meals.map((m) => m.id));
    expect(impossible.meals.every((m) => m.id === 'leftover-bowl')).toBe(true);
    expect(impossible.note).not.toMatch(/pinned in/);
  });
});
