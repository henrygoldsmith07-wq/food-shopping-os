import { describe, expect, it } from 'vitest';
import { answer } from '../src/lib/ai-assistant.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';

const TODAY = '2026-07-28';

const app = (overrides = {}) => ({
  day: TODAY,
  pantry: [],
  shoppingList: [],
  shops: [],
  storeRoutes: {},
  aisleMemory: {},
  offers: [],
  waste: [],
  weeklyBudget: 50,
  monthlyBudget: 200,
  spentThisWeek: 12,
  spentThisMonth: 48,
  basket: { total: 0, projected: 0, saved: 0, priced: 0, unpriced: 0, left: 38, over: false },
  diets: [],
  planDiets: [],
  allergies: [],
  plan: {},
  log: {},
  entries: [],
  totals: { kcal: 0, protein: 0 },
  targets: { ...DEFAULT_TARGETS, kcal: 2000, protein: 120 },
  weeklyKcalTarget: 14000,
  week: { eaten: 0, left: 14000 },
  recentFoods: [],
  catalogue: [],
  safeRecipes: undefined,
  fitFor: () => ({ blocked: [], flagged: [] }),
  cooked: [],
  body: {},
  maintenanceKcal: 0,
  goal: 'maintain',
  ...overrides,
});

describe('AI food assistant', () => {
  it('optimises a shopping list using only recorded prices', () => {
    const state = app({
      shoppingList: [
        { name: 'Milk', aisle: 'Dairy', price: 1.5 },
        { name: 'Oats', aisle: 'Breakfast', price: 2 },
      ],
      shops: [
        { date: TODAY, store: 'Tesco', items: [{ name: 'Milk', price: 1.4 }, { name: 'Oats', price: 2 }] },
        { date: '2026-07-20', store: 'Aldi', items: [{ name: 'Milk', price: 1.1 }, { name: 'Oats', price: 1.5 }] },
      ],
      basket: { total: 3.5, projected: 3.5, saved: 0, priced: 2, unpriced: 0, left: 34.5, over: false },
    });

    const result = answer('Optimise my shopping', state);
    expect(result).toMatch(/Aldi/);
    expect(result).toMatch(/£2\.60/);
    expect(result).toMatch(/2 of 2 items/);
  });

  it('builds a route from the store route the shopper taught it', () => {
    const result = answer('What is my shopping route?', app({
      shoppingList: [
        { name: 'Milk', aisle: 'Dairy' },
        { name: 'Apples', aisle: 'Fruit & Veg' },
      ],
      shops: [{ date: TODAY, store: 'Tesco', items: [] }],
      storeRoutes: { Tesco: ['Fruit & Veg', 'Dairy'] },
    }));

    expect(result).toMatch(/Tesco/);
    expect(result).toMatch(/Fruit & Veg → Dairy/);
  });

  it('turns pantry contents into a generated recipe without inventing stock', () => {
    const result = answer('Generate a recipe from my pantry', app({
      pantry: [
        { name: 'Chicken breast' },
        { name: 'Rice' },
        { name: 'Broccoli' },
        { name: 'Tomato sauce' },
      ],
    }));

    expect(result).toMatch(/Generated from your kitchen/);
    expect(result).toMatch(/Chicken/i);
    expect(result).toMatch(/per serving/);
  });

  it('refuses a generated recipe when every candidate conflicts with an allergy', () => {
    const result = answer('Generate a recipe from my pantry', app({
      pantry: [{ name: 'Chicken breast' }, { name: 'Rice' }],
      fitFor: () => ({ blocked: [{ label: 'Sesame' }], flagged: [] }),
    }));

    expect(result).toMatch(/couldn’t build/i);
    expect(result).toMatch(/Sesame/);
  });

  it('explains the recipe already planned for dinner', () => {
    const result = answer('Explain tonight’s recipe', app({
      plan: { [TODAY]: { dinner: 'chickpea-curry' } },
    }));

    expect(result).toMatch(/Coconut Chickpea Curry/i);
    expect(result).toMatch(/Why it works/);
    expect(result).toMatch(/protein/i);
  });

  it('explains a saved recipe after the AI planner puts it in the plan', () => {
    const recipe = {
      id: 'mine-tomato-pasta',
      name: 'Tomato Pasta',
      tags: ['vegetarian'],
      time: 20,
      prep: 5,
      protein: 18,
      fibre: 8,
      kcal: 480,
      healthScore: 80,
      costPerServing: 1.2,
      ingredients: [{ name: 'Pasta' }, { name: 'Tomatoes' }],
      steps: [{ text: 'Cook the pasta.' }],
    };
    const result = answer('Explain tonight’s recipe', app({
      day: '2026-07-28',
      plan: { '2026-07-28': { dinner: recipe.id } },
      myRecipes: [recipe],
      safeRecipes: [recipe],
    }));
    expect(result).toMatch(/Tomato Pasta/);
  });

  it('gives meal improvement feedback from the logged meal', () => {
    const snack = {
      id: 'crisps',
      name: 'Crisps',
      meal: 'snack',
      grams: 100,
      per100: { kcal: 600, protein: 5, carbs: 50, fat: 30, fibre: 2 },
    };
    const result = answer('How can I improve my meal rating?', app({
      entries: [snack],
      log: { [TODAY]: [snack] },
      totals: { kcal: 600, protein: 5 },
    }));

    expect(result).toMatch(/Snack/);
    expect(result).toMatch(/little protein/i);
    expect(result).not.toMatch(/star/i);
  });

  it('is explicit when a data-grounded answer is not possible', () => {
    expect(answer('What is my shopping route?', app())).toMatch(/shopping list is empty/i);
    expect(answer('Suggest a substitution', app())).toMatch(/plan a dinner/i);
    expect(answer('Explain tonight’s recipe', app())).toMatch(/plan dinner/i);
  });
});
