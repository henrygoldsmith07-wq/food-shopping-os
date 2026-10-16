import { describe, expect, it } from 'vitest';
import { tonightPlanState } from '../src/lib/tonight-plan.js';
import { explainRecommendation, ingredientStock } from '../src/lib/recommend.js';
import { LEFTOVER_CAT, leftoverEntry } from '../src/lib/mealplan.js';

const book = {
  korma: { id: 'korma', name: 'Chickpeas korma', meal: 'dinner' },
  stew: { id: 'stew', name: 'Bean stew', meal: 'dinner' },
  oats: { id: 'oats', name: 'Porridge', meal: 'breakfast' },
};
const byId = (id) => book[id];
const day = '2026-10-16';

describe('tonightPlanState', () => {
  it('suggests when nothing is planned or cooked', () => {
    expect(tonightPlanState({ plan: {}, cooked: [], day, byId })).toEqual({ mode: 'suggest', recipe: null });
  });

  it('leads with the planned dinner', () => {
    const state = tonightPlanState({ plan: { [day]: { dinner: 'korma' } }, cooked: [], day, byId });
    expect(state).toEqual({ mode: 'planned', recipe: book.korma });
  });

  it('is done once the planned dinner is cooked today', () => {
    const state = tonightPlanState({
      plan: { [day]: { dinner: 'korma' } }, cooked: [{ recipeId: 'korma', date: day }], day, byId,
    });
    expect(state.mode).toBe('cooked');
  });

  it('counts an off-plan dinner cooked today, but not a breakfast or yesterday', () => {
    const plan = { [day]: { dinner: 'korma' } };
    expect(tonightPlanState({ plan, cooked: [{ recipeId: 'stew', date: day }], day, byId }))
      .toEqual({ mode: 'cooked', recipe: book.stew });
    expect(tonightPlanState({ plan, cooked: [{ recipeId: 'oats', date: day }], day, byId }).mode).toBe('planned');
    expect(tonightPlanState({ plan, cooked: [{ recipeId: 'korma', date: '2026-10-15' }], day, byId }).mode)
      .toBe('planned');
  });
});

describe('leftovers are meals, not ingredients', () => {
  const recipe = {
    id: 'soy-chickpeas', name: 'Soy & Ginger Chickpeas', time: 18, servings: 2, costPerServing: 1.1,
    ingredients: [{ name: 'Chickpeas', qty: '300 g' }, { name: 'Potatoes', qty: '400 g' }],
  };
  const leftover = leftoverEntry({ id: 'korma', name: 'Chickpeas korma' }, 1, day);

  it('drops saved portions from the ingredient stock', () => {
    expect(leftover.cat).toBe(LEFTOVER_CAT);
    expect(ingredientStock([leftover, { name: 'Rice' }])).toEqual([{ name: 'Rice' }]);
  });

  it('does not let korma leftovers cover chickpeas or read as an expiring ingredient', () => {
    const explanation = explainRecommendation(recipe, { pantry: [leftover], today: day });
    expect(explanation.coverage.pct).toBe(0);
    expect(explanation.expiring).toEqual([]);
    expect(explanation.lines.join(' ')).not.toMatch(/leftovers/i);
  });
});
