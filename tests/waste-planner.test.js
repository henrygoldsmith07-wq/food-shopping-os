import { describe, expect, it } from 'vitest';
import {
  chooseWasteMinimisingPlan, learnWasteProfile, scoreWastePlan,
} from '../src/lib/waste-planner.js';

const meal = (id, ingredients, extra = {}) => ({
  id,
  name: id,
  meal: 'dinner',
  servings: 1,
  costPerServing: 1,
  time: 20,
  kcal: 400,
  protein: 20,
  tags: [],
  ingredients,
  ...extra,
});

describe('waste-minimising planner', () => {
  it('detects ingredient fragmentation and rewards a later reuse', () => {
    const halfPepper = meal('half-pepper', [{ name: 'Peppers', qty: '½ pepper' }]);
    const single = scoreWastePlan([halfPepper], {
      people: 1,
      dates: ['2026-08-24'],
      today: '2026-08-20',
      packageSizes: { peppers: '1 pepper' },
    });
    const paired = scoreWastePlan([halfPepper, { ...halfPepper, id: 'later-half' }], {
      people: 1,
      dates: ['2026-08-24', '2026-08-27'],
      today: '2026-08-20',
      packageSizes: { peppers: '1 pepper' },
    });

    expect(single.fragmentationRisks[0].name).toBe('Peppers');
    expect(single.expectedUnusedCount).toBe(1);
    expect(paired.fragmentationRisks).toHaveLength(0);
    expect(paired.packUtilisation).toBe(100);
    expect(paired.score).toBeGreaterThan(single.score);
  });

  it('scores two 300 g meals as a full 600 g pack', () => {
    const chicken = meal('chicken', [{ name: 'Chicken breast', qty: '300 g' }]);
    const full = scoreWastePlan([chicken, { ...chicken, id: 'chicken-later' }], {
      people: 1,
      packageSizes: { 'chicken breast': '600 g' },
    });
    const remainder = scoreWastePlan([{ ...chicken, ingredients: [{ name: 'Chicken breast', qty: '180 g' }] }], {
      people: 1,
      packageSizes: { 'chicken breast': '600 g' },
    });

    expect(full.packUtilisation).toBe(100);
    expect(full.expectedUnusedCount).toBe(0);
    expect(remainder.packUtilisation).toBe(30);
    expect(remainder.expectedUnusedCount).toBe(1);
  });

  it('prioritises dated perishable stock before a non-matching meal', () => {
    const spinachMeal = meal('spinach-meal', [{ name: 'Spinach', qty: '200 g' }]);
    const otherMeal = meal('other-meal', [{ name: 'Rice', qty: '200 g' }]);
    const pantry = [{ name: 'Spinach', qty: '200 g', cat: 'Fresh', expiry: '2026-08-21' }];
    const use = scoreWastePlan([spinachMeal], {
      pantry, dates: ['2026-08-20'], today: '2026-08-20', people: 1,
    });
    const skip = scoreWastePlan([otherMeal], {
      pantry, dates: ['2026-08-20'], today: '2026-08-20', people: 1,
    });

    expect(use.perishableUtilisation).toBe(100);
    expect(skip.perishableUtilisation).toBe(0);
    expect(use.score).toBeGreaterThan(skip.score);
  });

  it('learns repeated household waste without inventing a rule from one event', () => {
    const profile = learnWasteProfile([
      { name: 'Salad leaves', cost: 1.2, date: '2026-08-01' },
      { name: 'salad leaves', cost: 1.1, date: '2026-08-08' },
      { name: 'Bread', cost: 0.9, date: '2026-08-10' },
    ]);
    expect(profile.repeated.map((row) => row.key)).toEqual(['lettuce']);
    expect(profile.repeated[0].count).toBe(2);
    expect(profile.ingredients.find((row) => row.key === 'crusty bread').repeated).toBe(false);

    const saladPlan = scoreWastePlan([
      meal('salad', [{ name: 'Salad leaves', qty: '50 g' }]),
    ], { wasteProfile: profile });
    expect(saladPlan.learnedWaste).toHaveLength(1);
    expect(saladPlan.expectedUnusedIngredients[0].learned).toBe(true);
  });

  it('ranks a low-remainder candidate above a fragmented candidate', () => {
    const half = meal('half', [{ name: 'Peppers', qty: '½ pepper' }]);
    const paired = meal('paired', [{ name: 'Peppers', qty: '1 pepper' }]);
    const result = chooseWasteMinimisingPlan(
      [[half, half], [paired, paired]],
      { people: 1, packageSizes: { peppers: '1 pepper' } },
    );
    expect(result.meals.map((item) => item.id)).toEqual(['paired', 'paired']);
    expect(result.score).toBe(100);
  });
});
