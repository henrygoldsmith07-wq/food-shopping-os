import { describe, expect, it } from 'vitest';
import { shoppableQty } from '../src/lib/shoppable-qty.js';
import { shoppingListMutations } from '../src/lib/shopping-list-mutations.js';
import { EMPTY_STATE } from '../src/lib/state.js';

describe('shoppableQty: what to pick up, not what the recipe uses', () => {
  it.each([
    ['0.7', 'Peppers', '1'],
    ['0.7 squares', 'Dark chocolate', '1 bar'],
    ['0.7 tsp', 'Smoked paprika', '1 jar'],
    ['5 ml', 'Oregano', '1 jar'],
    ['90 ml', 'Soy sauce', '1 bottle'],
    ['2 tbsp', 'Garlic', '1 bulb'],
    ['60 ml', 'Ginger', '1 piece'],
    ['2 tbsp', 'Lemon juice', '1 lemon'],
    ['1.5 heads', 'Broccoli', '2 heads'],
    ['0.6 heads', 'Broccoli', '1 head'],
    ['0.5 cups', 'Rice', '0.5 cups'],
    ['0.5 bottles', 'Milk', '1 bottle'],
    ['1.5 cups', 'Rice', '1.5 cups'],
  ])('%s %s -> %s', (qty, name, expected) => {
    expect(shoppableQty(qty, name)).toBe(expected);
  });

  it.each([
    ['400 ml', 'Coconut milk'],
    ['600 g', 'Chickpeas'],
    ['8', 'Chicken thighs'],
    ['1 tin', 'Chopped tomatoes'],
    ['a handful', 'Rocket'],
    ['', 'Salt'],
  ])('leaves buyable amounts alone: %s %s', (qty, name) => {
    expect(shoppableQty(qty, name)).toBe(qty);
  });
});

describe('recipe rows on the list', () => {
  const store = (overrides = {}) => {
    let state = { ...EMPTY_STATE, day: '2026-10-16', ...overrides };
    const set = (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
    return { actions: shoppingListMutations(set, { latest: () => state }), get: () => state };
  };

  it('buys a shoppable amount and keeps the recipe figure as the need', () => {
    const { actions, get } = store();
    actions.addToList([
      { name: 'Smoked paprika', qty: '0.7 tsp', fromRecipe: 'Chilli', forRecipes: ['Chilli'] },
      { name: 'Peppers', qty: '0.7', requiredQty: '0.7', fromRecipe: 'Chilli' },
    ]);
    const rows = Object.fromEntries(get().shoppingList.map((row) => [row.name, row]));
    expect(rows['Smoked paprika']).toMatchObject({ qty: '1 jar', requiredQty: '0.7 tsp' });
    expect(rows.Peppers).toMatchObject({ qty: '1', requiredQty: '0.7' });
  });

  it('never rewrites what a person typed', () => {
    const { actions, get } = store();
    actions.addToList([{ name: 'Paprika', qty: '0.5 tsp' }]);
    expect(get().shoppingList[0].qty).toBe('0.5 tsp');
    expect(get().shoppingList[0].requiredQty).toBeUndefined();
  });
});

describe('every plan-derived list buys shoppable amounts', () => {
  const recipe = {
    id: 'stir-fry', name: 'Stir-fry', servings: 2,
    ingredients: [{ name: 'Garlic', qty: '2 tbsp' }, { name: 'Ginger', qty: '60 ml' }, { name: 'Firm tofu', qty: '280 g' }],
  };

  it('the onboarding starter list', async () => {
    const { firstSessionPlan } = await import('../src/lib/onboarding-quick-start.js');
    const { shoppingList } = firstSessionPlan({ day: '2026-10-16', recipes: [recipe], pickedRecipeIds: ['stir-fry'], household: 2 });
    const rows = Object.fromEntries(shoppingList.map((row) => [row.name, row]));
    expect(rows.Garlic).toMatchObject({ qty: '1 bulb', requiredQty: '2 tbsp' });
    expect(rows.Ginger).toMatchObject({ qty: '1 piece', requiredQty: '60 ml' });
    expect(rows['Firm tofu']).toMatchObject({ qty: '280 g' });
  });
});

import { shoppableQty as shoppableQtyThousands } from '../src/lib/shoppable-qty.js';
import { it as itT, expect as expectT } from 'vitest';
itT('reads a thousands comma as thousands, not decimals', () => {
  expectT(shoppableQtyThousands('1,500 ml', 'stock')).toBe('1,500 ml');
  expectT(shoppableQtyThousands('1,5 kg', 'flour')).toBe('1,5 kg');
});

describe('fractional amounts', () => {
  it('treats 1/2 tsp and ½ tsp as small spoon amounts', () => {
    expect(shoppableQty('1/2 tsp', 'salt')).toBe('1 jar');
    expect(shoppableQty('½ tsp', 'salt')).toBe('1 jar');
    expect(shoppableQty('1 1/2 tbsp', 'olive oil')).toBe('1 bottle');
  });
  it('rounds fractional counts up and leaves weights alone', () => {
    expect(shoppableQty('1/2 tin', 'beans')).toBe('1 tin');
    expect(shoppableQty('1/2 kg', 'rice')).toBe('1/2 kg');
  });
});

describe('ranges', () => {
  it('buys for the top of a range', () => {
    expect(shoppableQty('2-3 tbsp', 'olive oil')).toBe('1 bottle');
    expect(shoppableQty('2 to 3 cloves', 'garlic')).toBe('1 bulb');
    expect(shoppableQty('1-2 tins', 'beans')).toBe('2 tins');
  });
});

describe('cups are a measure, not a count', () => {
  it('does not round part-cups up to whole cups', () => {
    expect(shoppableQty('1.5 cups', 'rice')).toBe('1.5 cups');
    expect(shoppableQty('0.5 cup', 'flour')).toBe('0.5 cup');
  });
});

describe('written-out halves', () => {
  it('buys a whole one for "half a lemon"', async () => {
    const { shoppableQty } = await import('../src/lib/shoppable-qty.js');
    expect(shoppableQty('half a lemon', 'lemon')).toBe('1 lemon');
    expect(shoppableQty('half an onion', 'onion')).toBe('1 onion');
  });
});

describe('written-out quarters and thirds', () => {
  it('buys a whole one', async () => {
    const { shoppableQty } = await import('../src/lib/shoppable-qty.js');
    expect(shoppableQty('quarter of a cabbage', 'cabbage')).toBe('1 cabbage');
    expect(shoppableQty('a third of an onion', 'onion')).toBe('1 onion');
    expect(shoppableQty('half a lemon', 'lemon')).toBe('1 lemon');
  });
});

import { shoppableQty as shoppableQtyContainers } from '../src/lib/shoppable-qty.js';
describe('shoppableQty containers for small amounts', () => {
  it('buys coconut milk as a can, not a carton', () => {
    expect(shoppableQtyContainers('100 ml', 'coconut milk')).toBe('1 can');
    expect(shoppableQtyContainers('2 tbsp', 'oat milk')).toBe('1 carton');
  });

  it('buys butter as a pack and cream/milk as a carton, not a jar', () => {
    expect(shoppableQtyContainers('3 tbsp', 'butter')).toBe('1 pack');
    expect(shoppableQtyContainers('100 ml', 'double cream')).toBe('1 carton');
    expect(shoppableQtyContainers('2 tbsp', 'milk')).toBe('1 carton');
  });
  it('keeps jars for spices and bottles for oil', () => {
    expect(shoppableQtyContainers('2 tsp', 'dried oregano')).toBe('1 jar');
    expect(shoppableQtyContainers('2 tbsp', 'peanut butter')).toBe('1 jar');
    expect(shoppableQtyContainers('2 tbsp', 'olive oil')).toBe('1 bottle');
  });
});

describe('garlic across cloves and bulbs', () => {
  it('adds cloves and bulbs together before rounding to bulbs', () => {
    expect(shoppableQty('2 cloves + 1 bulb', 'garlic')).toBe('2 bulbs');
    expect(shoppableQty('3 cloves + 1 head', 'garlic')).toBe('2 bulbs');
    expect(shoppableQty('2 cloves + 3 cloves', 'garlic')).toBe('1 bulb');
    expect(shoppableQty('1 bulb + 1 bulb', 'garlic')).toBe('2 bulbs');
  });
});
