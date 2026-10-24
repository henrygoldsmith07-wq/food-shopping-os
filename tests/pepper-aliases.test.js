import { describe, expect, it } from 'vitest';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { canonicalName } from '../src/lib/aliases.js';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, ings) => ({ id, name: id, servings: 2, time: 20, costPerServing: 1, ingredients: ings.map(([name, qty]) => ({ name, qty })) });

describe('sweet pepper names are one ingredient', () => {
  it.each(['bell pepper', 'red bell pepper', 'sweet peppers', 'orange pepper', 'capsicum'])('%s -> Peppers', (n) => {
    expect(canonicalName(n)).toBe(canonicalName('red pepper'));
  });
  it('keeps black pepper separate', () => {
    expect(canonicalName('black pepper')).not.toBe(canonicalName('red pepper'));
  });
  it('lists one Peppers row across recipes', () => {
    const a = recipe('pa-a', [['red pepper', '1']]);
    const b = recipe('pa-b', [['bell pepper', '2']]);
    setMyRecipes([a, b]);
    const d = ['2026-10-26', '2026-10-27'];
    const rows = shoppingForPlan({ [d[0]]: { dinner: a.id }, [d[1]]: { dinner: b.id } }, d, { pantry: [], today: '2026-10-25', people: 2 });
    const peppers = rows.filter((r) => /pepper/i.test(r.name));
    expect(peppers).toHaveLength(1);
    expect(peppers[0].qty).toBe('3');
  });
});
