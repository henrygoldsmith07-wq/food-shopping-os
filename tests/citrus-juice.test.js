import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { canonicalName } from '../src/lib/aliases.js';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, name, ingredients) => ({
  id, name, servings: 2, time: 20, costPerServing: 1, ingredients: ingredients.map(([n, qty]) => ({ name: n, qty })),
});

describe('citrus juice and zest fold into the fruit', () => {
  it.each([['lemon juice', 'lemons'], ['lime juice', 'limes'], ['lemon zest', 'lemons']])('%s -> %s', (n, k) => {
    expect(canonicalName(n)).toBe(k);
  });

  it('lists one lemons row when one recipe wants juice and another a lemon', () => {
    const a = recipe('cj-dressing', 'Dressing', [['lemon juice', '2 tbsp']]);
    const b = recipe('cj-fish', 'Fish', [['lemon', '1']]);
    setMyRecipes([a, b]);
    const dates = ['2026-10-24', '2026-10-25'];
    const rows = shoppingForPlan({ [dates[0]]: { dinner: a.id }, [dates[1]]: { dinner: b.id } }, dates, { pantry: [], today: '2026-10-23', people: 2 });
    const citrus = rows.filter((r) => /lemon/i.test(r.name));
    expect(citrus).toHaveLength(1);
    expect(citrus[0].qty).toBe('1');
  });
});
