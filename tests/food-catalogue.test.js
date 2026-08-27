import { describe, it, expect } from 'vitest';
import { CATALOGUE, FOODS } from '../src/data/foods.js';
import { BRANDED_FOODS } from '../src/data/branded-foods.js';
import { BRANDED_FOODS_EXTRA } from '../src/data/branded-foods-extra.js';
import { STORE_CUPBOARD_FOODS } from '../src/data/store-cupboard-foods.js';
import { GLOBAL_PANTRY_FOODS } from '../src/data/global-pantry-foods.js';
import { DELI_DESSERT_FOODS } from '../src/data/deli-dessert-foods.js';
import { healthScore, matchFood } from '../src/lib/food-tags.js';

/**
 * Energy from macros, the way UK/EU labelling actually computes it.
 *
 * Fibre is 2 kcal/g, not zero — leave it out and every spice looks like a
 * fabrication, because a third of ground cinnamon is fibre.
 */
const energyFromMacros = ({ protein, carbs, fat, fibre }) =>
  protein * 4 + carbs * 4 + fat * 9 + (fibre || 0) * 2;

const ADDED = [...STORE_CUPBOARD_FOODS, ...DELI_DESSERT_FOODS, ...BRANDED_FOODS, ...BRANDED_FOODS_EXTRA];

describe('the catalogue holds together', () => {
  it('has no duplicate ids anywhere', () => {
    const ids = FOODS.map((food) => food.id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    expect(duplicates).toEqual([]);
  });

  it('gives every food a name, an id and per-100 figures', () => {
    for (const food of FOODS) {
      expect(food.id, food.name).toBeTruthy();
      expect(food.name, food.id).toBeTruthy();
      expect(Number.isFinite(food.per100?.kcal), food.name).toBe(true);
      expect(Array.isArray(food.servings) && food.servings.length > 0, food.name).toBe(true);
    }
  });

  it('can grade every single food, so the health tag is never silently absent', () => {
    const ungradeable = FOODS.filter((food) => healthScore(food.per100) === null).map((food) => food.name);
    expect(ungradeable).toEqual([]);
  });
});

describe('nutrition figures are internally consistent', () => {
  it('keeps stated energy within reach of its own macros', () => {
    const offenders = ADDED.filter((food) => {
      const { kcal } = food.per100;
      // Very low-energy foods round badly, and alcohol is 7 kcal/g, which
      // this check does not model — vanilla extract is mostly alcohol.
      if (kcal <= 20 || (food.tags || []).includes('alcohol')) return false;
      return Math.abs(energyFromMacros(food.per100) - kcal) / kcal >= 0.35;
    }).map((food) => `${food.name}: ${food.per100.kcal} stated vs ${Math.round(energyFromMacros(food.per100))} from macros`);
    expect(offenders).toEqual([]);
  });

  it('never lets a sub-component exceed its parent total', () => {
    const offenders = [];
    for (const food of ADDED) {
      const { sugar, carbs, satFat, fat } = food.per100;
      if (sugar > carbs + 0.5) offenders.push(`${food.name}: sugar ${sugar} > carbs ${carbs}`);
      if (satFat > fat + 0.5) offenders.push(`${food.name}: satFat ${satFat} > fat ${fat}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every figure inside a physically possible range', () => {
    for (const food of ADDED) {
      const { kcal, protein, carbs, fat, fibre, sugar, satFat, sodium } = food.per100;
      expect(kcal, food.name).toBeGreaterThanOrEqual(0);
      expect(kcal, food.name).toBeLessThanOrEqual(900);
      for (const [key, value] of Object.entries({ protein, carbs, fat, fibre, sugar, satFat })) {
        expect(value, `${food.name} ${key}`).toBeGreaterThanOrEqual(0);
        expect(value, `${food.name} ${key}`).toBeLessThanOrEqual(100);
      }
      // 100g of pure salt is 39,000mg sodium; nothing edible approaches it.
      expect(sodium, `${food.name} sodium`).toBeGreaterThanOrEqual(0);
      expect(sodium, `${food.name} sodium`).toBeLessThanOrEqual(30000);
    }
  });

  it('states the three nutrients a grade depends on, on every added row', () => {
    for (const food of ADDED) {
      for (const key of ['sugar', 'satFat', 'sodium']) {
        expect(Number.isFinite(food.per100[key]), `${food.name} ${key}`).toBe(true);
      }
    }
  });
});

describe('branded rows are properly branded', () => {
  const branded = [...BRANDED_FOODS, ...BRANDED_FOODS_EXTRA];

  it('names a brand and marks the source on every one', () => {
    for (const food of branded) {
      expect(food.brand, food.name).toBeTruthy();
      expect(food.source, food.name).toBe('branded');
      expect(food.tags, food.name).toContain('branded');
    }
  });

  it('covers a good spread of brands rather than one company', () => {
    const brands = new Set(branded.map((food) => food.brand));
    expect(brands.size).toBeGreaterThan(50);
    // No single brand should dominate the branded catalogue.
    const counts = branded.reduce((acc, food) => ({ ...acc, [food.brand]: (acc[food.brand] || 0) + 1 }), {});
    expect(Math.max(...Object.values(counts))).toBeLessThan(branded.length / 4);
  });

  it('tags dairy that a product name never mentions', () => {
    // A shopper filtering out dairy should not be defeated by a chocolate bar
    // whose name says nothing about milk. Oreo is deliberately absent: UK
    // Oreos carry no milk ingredient, so tagging them dairy would be wrong.
    for (const id of ['galaxy-smooth', 'twirl', 'quavers', 'wotsits', 'penguin-bar']) {
      const food = branded.find((row) => row.id === id);
      expect(food, id).toBeTruthy();
      expect(food.tags, food.name).toContain('dairy');
    }
    expect(branded.find((row) => row.id === 'oreo').tags).not.toContain('dairy');
  });
});

describe('the expanded catalogue is reachable', () => {
  it('finds store-cupboard items that used to return nothing', () => {
    for (const query of ['cumin', 'paprika', 'plain flour', 'soy sauce', 'baking powder', 'passata']) {
      expect(matchFood(query), query).not.toBeNull();
    }
  });

  it('finds deli and dessert items by their plain noun', () => {
    for (const query of ['stilton', 'chorizo', 'custard', 'cheesecake', 'scone', 'salsa']) {
      expect(matchFood(query), query).not.toBeNull();
    }
  });

  it('finds the new brands', () => {
    expect(matchFood('Galaxy smooth milk')?.brand).toBe('Galaxy');
    expect(matchFood('Oreo original')?.brand).toBe('Oreo');
    expect(matchFood('Magnum classic')?.brand).toBe('Magnum');
  });

  it('ignores accents, which nobody types into a shopping list', () => {
    expect(matchFood('pate')?.name).toContain('Pâté');
    expect(matchFood('creme fraiche')?.name).toBe('Crème fraîche');
  });

  it('ignores a bracketed qualifier the way it ignores one after a comma', () => {
    expect(matchFood('Nescafe gold blend')?.brand).toBe('Nescafé');
    expect(matchFood('Robinsons orange squash')?.brand).toBe('Robinsons');
  });

  it('still refuses a loose match, however big the catalogue gets', () => {
    // The whole point of the strict matcher: more foods must not mean more
    // confident wrong answers.
    expect(matchFood('milk')).toBeNull();
    expect(matchFood('crisps')).toBeNull();
    expect(matchFood('chocolate')).toBeNull();
  });

  it('keeps a generic query on the generically named entry', () => {
    // Asserted on the name rather than `source`: the original catalogue's
    // "Baked beans" row is itself marked source 'branded' with brand Heinz,
    // which predates this work. The behaviour that matters is which entry a
    // generic query resolves to.
    expect(matchFood('baked beans')?.name).toBe('Baked beans');
    expect(matchFood('Heinz baked beans')?.name).toBe('Heinz Baked Beans');
  });

  it('reaches the catalogue the rest of the app searches', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(FOODS.length);
    expect(FOODS.length).toBeGreaterThan(500);
  });
});

describe('the fourth wave of foods', () => {
  const byId = new Map(FOODS.map((food) => [food.id, food]));

  it('adds the tins and cupboard staples the catalogue could not recognise', () => {
    // Tinned tuna is one of the most bought products in Britain and the app
    // did not know what it was.
    for (const id of [
      'tuna-brine', 'tuna-oil', 'scallops', 'split-peas', 'soya-mince',
      'semolina', 'shredded-suet', 'gochujang', 'rice-vinegar', 'plantain',
    ]) {
      expect(byId.has(id), id).toBe(true);
    }
  });

  it('states the three figures a health grade needs on every new row', () => {
    for (const food of GLOBAL_PANTRY_FOODS) {
      for (const key of ['sugar', 'satFat', 'sodium']) {
        expect(Number.isFinite(food.per100?.[key]), `${food.name} ${key}`).toBe(true);
      }
    }
  });

  it('keeps bicarbonate of soda’s salt figure, which is not a typo', () => {
    // Sodium bicarbonate really is 27g of sodium per 100g. It is also used a
    // teaspoon at a time, which is why the portion carries as much weight as
    // the per-100g row.
    const bicarb = byId.get('bicarbonate-of-soda');
    expect(bicarb.per100.sodium).toBeGreaterThan(20000);
    expect(bicarb.servings[0].grams).toBeLessThanOrEqual(5);
  });

  it('measures buttermilk in millilitres, like the carton it comes in', () => {
    expect(byId.get('buttermilk').unit).toBe('ml');
  });
});
