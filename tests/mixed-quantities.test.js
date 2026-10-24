import { describe, expect, it } from 'vitest';
import {
  combineQtyParts, compoundShortfall, formatQuantity, isVagueAmount, parseQuantity, splitQtyParts, sufficientFor,
} from '../src/lib/measure.js';
import { mergeQtys, qtySuffices } from '../src/lib/pantry.js';
import { shortfallQuantity } from '../src/lib/pantry-intelligence.js';
import { shoppableQty } from '../src/lib/shoppable-qty.js';
import { scaleQty } from '../src/lib/portions.js';
import { shoppingForPlan } from '../src/lib/mealplan.js';
import { setMyRecipes } from '../src/data/recipes.js';

// Two recipes that write the same food in different units ("300 g" of rice
// and "2 cups" of rice) leave the list holding a mixed amount. These tests
// pin how that mixed amount is added to, checked against the pantry and
// turned into something a shop sells.

describe('mixed amounts are added part by part', () => {
  it('splits a merged amount into its parts', () => {
    expect(splitQtyParts('300 g + 2 cups')).toEqual(['300 g', '2 cups']);
    expect(splitQtyParts('2 x 400g tins')).toEqual(['2 x 400g tins']);
    expect(splitQtyParts('')).toEqual([]);
  });

  it('adds a third amount to the part on the same scale instead of trailing it on', () => {
    expect(mergeQtys(mergeQtys('200 g', '1 cup'), '100 g', { ingredient: 'quinoa' })).toBe('300 g + 1 cup');
    expect(combineQtyParts('200 g + 1 cup + 100 g + 1 cup')).toBe('300 g + 480 ml');
  });

  it('drops "to taste" next to a real amount, and keeps it when it is all there is', () => {
    expect(isVagueAmount('to taste')).toBe(true);
    expect(isVagueAmount('As needed')).toBe(true);
    expect(isVagueAmount('1 tsp')).toBe(false);
    expect(mergeQtys('to taste', '1 tsp', { ingredient: 'salt' })).toBe('1 tsp');
    expect(mergeQtys('1 tsp', 'to taste', { ingredient: 'salt' })).toBe('1 tsp');
    expect(mergeQtys('to taste', 'to taste', { ingredient: 'salt' })).toBe('to taste');
  });

  it('still sums plain amounts exactly as before', () => {
    expect(mergeQtys('600 g', '400 g')).toBe('1 kg');
    expect(mergeQtys('2 eggs', '1 dozen', { ingredient: 'eggs' })).toBe('14 eggs');
    expect(mergeQtys('', '1 cup')).toBe('1 cup');
  });
});

describe('the pantry is checked against every part of a mixed need', () => {
  it('says "not enough" when the comparable part alone is more than the pantry holds', () => {
    // Before: the cups could not be weighed, so the whole answer was "can't
    // tell" and the planner trusted the pantry name — rice vanished from the list.
    expect(sufficientFor('250 g', '2 cups + 300 g', { ingredient: 'quinoa' })).toBe(false);
    expect(qtySuffices('250 g', '2 cups + 300 g', { ingredient: 'quinoa' })).toBe(false);
  });

  it('says "enough" only when every part compares and fits', () => {
    expect(sufficientFor('1 kg', '300 g + 200 g + to taste')).toBe(true);
    expect(sufficientFor('1 kg', '300 g + 2 cups', { ingredient: 'quinoa' })).toBe(null);
    expect(sufficientFor('2 tins', '1 bulb + 3 cloves', { ingredient: 'garlic' })).toBe(null);
  });

  it('reduces only the comparable part and keeps the rest whole', () => {
    expect(shortfallQuantity('250 g', '2 cups + 300 g', { ingredient: 'quinoa' })).toBe('2 cups + 50 g');
    expect(shortfallQuantity('1 kg', '2 cups + 300 g', { ingredient: 'quinoa' })).toBe('2 cups');
    expect(shortfallQuantity('1 kg', '300 g + 200 g')).toBe('');
    expect(compoundShortfall('2 cloves', '1 bulb + 4 cloves', { ingredient: 'garlic' })).toBe('1 bulb + 2 cloves');
    expect(shortfallQuantity('1 tin', '1 bulb + 4 cloves', { ingredient: 'garlic' })).toBe('1 bulb + 4 cloves');
  });
});

describe('quantities read the way a shopper buys', () => {
  it('rounds weights from 100 g up to whole grams', () => {
    expect(formatQuantity(parseQuantity('1.5 lb'))).toBe('680 g');
    expect(formatQuantity(parseQuantity('12.5 ml'))).toBe('12.5 ml');
    expect(formatQuantity(parseQuantity('1500 g'))).toBe('1.5 kg');
  });

  it('reads a count with a prep note as a count', () => {
    expect(parseQuantity('1, juiced', { ingredient: 'lemon' })).toMatchObject({ amount: 1, dim: 'count' });
    expect(mergeQtys('1, juiced', '1', { ingredient: 'lemon' })).toBe('2');
  });

  it('scales without throwing away precision or mangling prep notes', () => {
    expect(scaleQty('1.5 lb', 1.5)).toBe('2.25 lb');
    expect(scaleQty('1, juiced', 1.5)).toBe('1.5, juiced');
  });

  it('makes each part of a mixed amount buyable', () => {
    expect(shoppableQty('1.5, juiced', 'Lemons')).toBe('2');
    expect(shoppableQty('75 g + 3 tbsp', 'Butter')).toBe('75 g + 1 pack');
    expect(shoppableQty('1 tsp + 2 tbsp', 'Smoked paprika')).toBe('1 jar');
    expect(shoppableQty('1,500 ml', 'Milk')).toBe('1,500 ml');
  });
});

describe('the week list with recipes that disagree on units', () => {
  const recipe = (id, name, ingredients) => ({
    id, name, servings: 2, time: 20, costPerServing: 1, ingredients: ingredients.map(([n, qty]) => ({ name: n, qty })),
  });
  const dates = ['2026-10-24', '2026-10-25'];
  const pantryRow = (name, qty) => ({
    id: `p-${name}`, name, qty, confidence: 'definite', lastConfirmedAt: '2026-10-23',
  });
  const listFor = (a, b, pantry = []) => {
    setMyRecipes([a, b]);
    return shoppingForPlan(
      { [dates[0]]: { dinner: a.id }, [dates[1]]: { dinner: b.id } },
      dates,
      { pantry, today: '2026-10-23', people: 2 },
    );
  };

  it('keeps rice on the list when the pantry covers less than the grams alone', () => {
    const rows = listFor(
      recipe('mq-pilaf', 'Pilaf', [['quinoa', '2 cups']]),
      recipe('mq-risotto', 'Risotto', [['quinoa', '300 g']]),
      [pantryRow('quinoa', '250 g')],
    );
    const rice = rows.find((row) => /quinoa/i.test(row.name));
    expect(rice).toBeTruthy();
    expect(rice.qty).toBe('2 cups + 50 g');
    expect(rice.pantryTruth).toBe('confirmed_insufficient');
  });

  it('lists salt as one jar, not "to taste + 1 tsp"', () => {
    const rows = listFor(
      recipe('mq-soup', 'Soup', [['salt', 'to taste']]),
      recipe('mq-bread', 'Bread', [['salt', '1 tsp']]),
    );
    const salt = rows.find((row) => /salt/i.test(row.name));
    expect(salt.requiredQty).toBe('1 tsp');
    expect(salt.qty).toBe('1 jar');
  });

  it('buys lemons whole when a recipe says "1, juiced"', () => {
    const rows = listFor(
      recipe('mq-dressing', 'Dressing', [['lemon', '1, juiced']]),
      recipe('mq-fish', 'Fish', [['lemon', '1']]),
    );
    const lemon = rows.find((row) => /lemon/i.test(row.name));
    expect(lemon.qty).toBe('2');
  });
});
