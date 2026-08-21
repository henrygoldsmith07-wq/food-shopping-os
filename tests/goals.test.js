import { describe, it, expect } from 'vitest';
import {
  bmr, computeTargets, defaultWeeklyKcal, dietConflicts, dietTargetPatch, filterByDiet,
  goalSummary, macroBreakdown, macroMismatch, maintenanceFrom, recipeAllowed, recipeConflicts,
  resolveMaintenance, targetsFor, weekProgress,
} from '../src/lib/goals.js';
import { agreedDeficit } from './helpers/target-safety.js';
import { BODY_GOALS, DIET_PATTERNS, KCAL_PER_G } from '../src/data/goals.js';
import { hardFilter } from '../src/lib/planner.js';
import { RECIPES } from '../src/data/recipes.js';
import { FOODS } from '../src/data/foods.js';

const STATS = { weightKg: 75, heightCm: 178, age: 34, sex: 'male', activity: 'moderate' };
const kcalOfMacros = (t) => t.protein * 4 + t.carbs * 4 + t.fat * 9;

describe('the goal catalogue', () => {
  it('covers every body goal and dietary pattern asked for', () => {
    expect(BODY_GOALS.map((g) => g.id)).toEqual(['lose', 'gain', 'maintain', 'muscle', 'recomp']);
    expect(DIET_PATTERNS.map((d) => d.id)).toEqual([
      'keto', 'low-carb', 'high-protein', 'mediterranean',
      'vegan', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free',
    ]);
  });
});

describe('maintenance energy', () => {
  it('runs Mifflin-St Jeor and applies activity', () => {
    // 10×75 + 6.25×178 − 5×34 + 5 = 1697.5 → 1698
    expect(bmr(STATS)).toBe(1698);
    expect(maintenanceFrom(STATS)).toBe(Math.round(1698 * 1.55));
  });

  it('takes the midpoint rather than assuming a sex', () => {
    const male = bmr({ ...STATS, sex: 'male' });
    const female = bmr({ ...STATS, sex: 'female' });
    const unstated = bmr({ ...STATS, sex: 'unspecified' });
    expect(unstated).toBeGreaterThan(female);
    expect(unstated).toBeLessThan(male);
  });

  it('needs the stats, and falls back to what you typed', () => {
    expect(bmr({ weightKg: 75 })).toBeNull();
    expect(maintenanceFrom({})).toBeNull();
    expect(resolveMaintenance({ maintenanceKcal: 2400 })).toBe(2400);
    expect(resolveMaintenance({ body: STATS, maintenanceKcal: 9999 })).toBe(maintenanceFrom(STATS));
    expect(resolveMaintenance({})).toBeNull();
  });
});

describe('body goals set the energy and the split', () => {
  const base = { maintenanceKcal: 2500, weightKg: 75 };

  it('moves calories the way the goal implies', () => {
    expect(computeTargets({ ...base, goal: 'maintain' }).kcal).toBe(2500);
    expect(computeTargets({ ...base, goal: 'lose' }).kcal).toBe(2000);
    expect(computeTargets({ ...base, goal: 'gain' }).kcal).toBe(2875);
    expect(computeTargets({ ...base, goal: 'muscle' }).kcal).toBe(2750);
    expect(computeTargets({ ...base, goal: 'recomp' }).kcal).toBe(2375);
  });

  it('sets protein per kilo when it knows your weight', () => {
    expect(computeTargets({ ...base, goal: 'muscle' }).protein).toBe(150); // 2.0 g/kg
    expect(computeTargets({ ...base, goal: 'recomp' }).protein).toBe(165); // 2.2 g/kg
    expect(computeTargets({ ...base, goal: 'maintain' }).protein).toBe(120); // 1.6 g/kg
  });

  it('falls back to a share of energy without a weight', () => {
    const t = computeTargets({ maintenanceKcal: 2000, goal: 'lose' });
    expect(t.protein).toBe(Math.round((2000 * 0.8 * 0.32) / 4));
  });

  it('always produces a split that adds up to the calorie target', () => {
    for (const goal of BODY_GOALS.map((g) => g.id)) {
      const t = computeTargets({ ...base, goal });
      expect(Math.abs(kcalOfMacros(t) - t.kcal), goal).toBeLessThan(30);
    }
  });
});

describe('dietary patterns reshape the split', () => {
  const base = { maintenanceKcal: 2500, weightKg: 75, goal: 'maintain' };

  it('keto holds carbs very low and lets fat carry the energy', () => {
    const t = computeTargets({ ...base, diets: ['keto'] });
    expect(t.carbs).toBeLessThanOrEqual(30);
    expect(t.fat * KCAL_PER_G.fat).toBeGreaterThan(t.kcal * 0.55);
    expect(Math.abs(kcalOfMacros(t) - t.kcal)).toBeLessThan(30);
  });

  it('low-carb caps carbs without going that far', () => {
    const t = computeTargets({ ...base, diets: ['low-carb'] });
    expect(t.carbs).toBeLessThanOrEqual(100);
    expect(t.carbs).toBeGreaterThan(30);
  });

  it('high-protein applies a floor on top of the goal', () => {
    const plain = computeTargets({ ...base });
    const high = computeTargets({ ...base, diets: ['high-protein'] });
    expect(high.protein).toBe(165); // 2.2 g/kg
    expect(high.protein).toBeGreaterThan(plain.protein);
  });

  it('combines a body goal with several patterns', () => {
    const t = computeTargets({ ...base, goal: 'muscle', diets: ['low-carb', 'high-protein', 'vegan'] });
    expect(t.kcal).toBe(2750);
    expect(t.protein).toBe(165);
    expect(t.carbs).toBeLessThanOrEqual(100);
    expect(Math.abs(kcalOfMacros(t) - t.kcal)).toBeLessThan(30);
  });

  it('nudges the micronutrient targets a pattern implies', () => {
    expect(dietTargetPatch(['mediterranean'])).toMatchObject({ fibre: 35, satFat: 15 });
    expect(dietTargetPatch(['keto']).fibre).toBe(25);
    expect(dietTargetPatch([])).toEqual({});
  });

  it('builds the full target set, micros included', () => {
    // A deficit is only in force once the screen is clear and the target has
    // been confirmed; see target-safety.test.js for what happens before that.
    const targets = targetsFor(agreedDeficit({
      goal: 'lose',
      diets: ['mediterranean'],
      maintenanceKcal: 2400,
      body: { sex: 'male', age: 34, weightKg: 70 },
    }));
    expect(targets.kcal).toBe(1920);
    expect(targets.fibre).toBe(35);
    expect(targets.iron).toBeGreaterThan(0); // reference intakes still there
  });
});

describe('what a split comes to', () => {
  it('reports grams, calories and percentages', () => {
    const rows = macroBreakdown({ kcal: 2000, protein: 150, carbs: 200, fat: 56 });
    expect(rows.map((r) => r.key)).toEqual(['protein', 'carbs', 'fat']);
    expect(rows[0].kcal).toBe(600);
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeGreaterThan(98);
  });

  it('spots a custom split that does not match its calorie target', () => {
    // 600 + 800 + 603 = 2,003 kcal against a 2,000 target
    expect(Math.abs(macroMismatch({ kcal: 2000, protein: 150, carbs: 200, fat: 67 }))).toBeLessThan(30);
    expect(macroMismatch({ kcal: 2000, protein: 50, carbs: 50, fat: 20 })).toBeLessThan(-1000);
    expect(macroMismatch({ kcal: 1500, protein: 200, carbs: 200, fat: 100 })).toBeGreaterThan(500);
  });
});

describe('weekly targets', () => {
  const today = '2026-07-29'; // a Wednesday
  const log = {
    '2026-07-27': [{ per100: { kcal: 100 }, grams: 1000 }], // 1,000 kcal
    '2026-07-28': [{ nutrients: { kcal: 2000 } }],
    '2026-07-29': [{ nutrients: { kcal: 500 } }],
  };

  it('defaults to seven daily targets', () => {
    expect(defaultWeeklyKcal(2000)).toBe(14000);
  });

  it('reads the week as one budget', () => {
    const w = weekProgress(log, { weeklyKcal: 14000, today });
    expect(w.eaten).toBe(3500);
    expect(w.left).toBe(10500);
    expect(w.elapsed).toBe(3);
    expect(w.daysLeft).toBe(4);
    expect(w.loggedDays).toBe(3);
    expect(w.pct).toBe(25);
    expect(w.onTrack).toBe(true);
  });

  it('knows when the week is running hot', () => {
    const w = weekProgress({ '2026-07-27': [{ nutrients: { kcal: 9000 } }] }, { weeklyKcal: 14000, today });
    expect(w.onTrack).toBe(false);
    expect(w.left).toBe(5000);
  });

  it('is empty-safe', () => {
    const w = weekProgress({}, { weeklyKcal: 14000, today });
    expect(w.eaten).toBe(0);
    expect(w.days).toHaveLength(7);
  });
});

describe('diet fit', () => {
  const foodBy = (id) => FOODS.find((f) => f.id === id);

  it('names which pattern a food clashes with', () => {
    expect(dietConflicts(foodBy('cheddar'), ['dairy-free'])).toEqual(['Dairy-free']);
    expect(dietConflicts(foodBy('chicken-breast'), ['vegan', 'vegetarian'])).toEqual(['Vegan', 'Vegetarian']);
    expect(dietConflicts(foodBy('wholemeal-bread'), ['gluten-free'])).toEqual(['Gluten-free']);
    expect(dietConflicts(foodBy('salmon-fillet'), ['pescatarian'])).toEqual([]);
    expect(dietConflicts(foodBy('banana'), ['vegan', 'gluten-free', 'dairy-free'])).toEqual([]);
  });

  it('leaves coconut milk alone on a dairy-free diet', () => {
    expect(dietConflicts({ name: 'Coconut milk', tags: [] }, ['dairy-free'])).toEqual([]);
    expect(dietConflicts({ name: 'Semi-skimmed milk', tags: [] }, ['dairy-free'])).toEqual(['Dairy-free']);
  });

  it('judges recipes on their tags and ingredients', () => {
    const curry = RECIPES.find((r) => r.id === 'chickpea-curry'); // vegan
    const ragu = RECIPES.find((r) => r.id === 'slowcooker-ragu');
    const salmon = RECIPES.find((r) => r.id === 'salmon-teriyaki');

    expect(recipeAllowed(curry, ['vegan', 'dairy-free'])).toBe(true);
    expect(recipeAllowed(ragu, ['vegetarian'])).toBe(false);
    expect(recipeConflicts(ragu, ['vegan'])).toEqual(['Vegan']);
    expect(recipeAllowed(salmon, ['pescatarian'])).toBe(true);
    expect(recipeAllowed(salmon, ['vegetarian'])).toBe(false);
  });

  it('filters a recipe list down to what fits', () => {
    const vegan = filterByDiet(RECIPES, ['vegan']);
    expect(vegan.length).toBeGreaterThan(0);
    expect(vegan.every((r) => r.tags.includes('vegan'))).toBe(true);
    expect(filterByDiet(RECIPES, []).length).toBe(RECIPES.length);
  });

  it('feeds the planner the same rules', () => {
    const pool = hardFilter(RECIPES, { diets: ['vegan'], budget: 10 });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((r) => r.tags.includes('vegan'))).toBe(true);
    expect(hardFilter(RECIPES, { goal: 'lose', budget: 10 }).every((r) => r.kcal <= 520)).toBe(true);
    expect(hardFilter(RECIPES, { goal: 'muscle', budget: 10 }).every((r) => r.protein >= 20)).toBe(true);
  });
});

describe('summary line', () => {
  it('reads as a sentence', () => {
    expect(goalSummary({ goal: 'muscle', diets: [] })).toBe('Muscle gain');
    expect(goalSummary({ goal: 'lose', diets: ['keto', 'dairy-free'] })).toBe('Weight loss · Keto · Dairy-free');
  });
});
