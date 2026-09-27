import { describe, expect, it } from 'vitest';
import {
  buildGeneratedPlan,
  entriesForGenerated,
  listRowsForGenerated,
  planGeneratorInput,
  planGeneratorModel,
} from '../src/lib/plan-generator-model.js';
import { byId } from '../src/data/recipes.js';
import { canonicalName } from '../src/lib/aliases.js';

const CURRY = 'chickpea-curry';
const SALMON = 'salmon-teriyaki';

const app = {
  day: '2026-09-28',
  calendarBusy: [],
  weeklyBudget: 70,
  spentThisWeek: 10,
  spentThisMonth: 10,
  pantry: [],
  planDiets: [],
  goal: null,
  safeRecipes: [byId(CURRY), byId(SALMON)],
  tasteProfile: {},
  leftovers: [],
  equipment: [],
  wasteProfile: null,
  aliasMemory: {},
  useSoonIngredients: [],
  waste: [],
  cooked: [],
  skipReasonProfile: null,
};

describe('plan generator model — components orchestrate, domain decides', () => {
  it('scopes dates, budget window and entries deterministically', () => {
    const form = {
      scope: 'A week', people: 2, budget: 2.5, occasion: 'Everyday', quick: false,
      timeAvailable: null, batch: false, usePantry: true, availabilityOnly: false,
      seasonal: false, leftoverFirst: false, variety: true, minimiseWaste: true,
      planDates: ['2026-09-29', '2026-09-30'], monthDates: [], weekDates: ['2026-09-29', '2026-09-30'],
      focusItems: [],
    };
    const model = planGeneratorModel(app, form);
    expect(model.planDates).toEqual(['2026-09-29', '2026-09-30']);
    expect(model.noOpenDates).toBe(false);
    const { input } = planGeneratorInput(app, form, model, 7);
    expect(input.people).toBe(2);
    const plan = buildGeneratedPlan(input, 7);
    expect(plan.meals.length).toBeGreaterThan(0);
    const entries = entriesForGenerated(plan.meals, 'A week', model.planDates, app.day);
    expect(entries[0]).toMatchObject({ date: '2026-09-29', slot: 'dinner' });
    const rows = listRowsForGenerated(entries.filter((e) => e.recipeId), app, form.people);
    expect(rows.length).toBeGreaterThan(0);
    // Every row is a need from the plan the generator just built: the hand-off
    // never invents a row, and never keeps one the plan cannot explain.
    const plannedKeys = new Set(plan.meals.filter(Boolean)
      .flatMap((r) => r.ingredients.map((i) => canonicalName(i.name, app.aliasMemory))));
    expect(rows.every((row) => plannedKeys.has(canonicalName(row.name, app.aliasMemory)))).toBe(true);
  });

  it('keeps 1-meal and day scopes on today', () => {
    expect(entriesForGenerated([{ id: 'r1' }], '1 meal', ['2026-09-29'], app.day))
      .toEqual([{ date: app.day, slot: 'dinner', recipeId: 'r1' }]);
    expect(entriesForGenerated(null, 'A week', ['2026-09-29'], app.day)).toEqual([]);
  });
});
