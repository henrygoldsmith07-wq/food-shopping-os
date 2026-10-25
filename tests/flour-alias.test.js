import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { canonicalName } from '../src/lib/aliases.js';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, ingredients) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ingredients.map(([name, qty]) => ({ name, qty })) });

describe('flour wordings', () => {
  it.each(['all-purpose flour', 'all purpose flour', 'white flour', 'bread flour'])('%s -> Flour', (n) => {
    expect(canonicalName(n)).toBe('flour');
  });
  it('plain flour and all-purpose flour share one row', () => {
    const a = recipe('fl-a', [['plain flour', '200 g']]);
    const b = recipe('fl-b', [['all-purpose flour', '100 g']]);
    setMyRecipes([a, b]);
    const d = ['2026-10-26', '2026-10-27'];
    const rows = shoppingForPlan({ [d[0]]: { dinner: a.id }, [d[1]]: { dinner: b.id } }, d, { pantry: [], today: '2026-10-25', people: 2 });
    expect(rows.filter((r) => /flour/i.test(r.name))).toHaveLength(1);
  });
});
