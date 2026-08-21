import { describe, it, expect } from 'vitest';
import {
  importRecipeText, importRecipeUrl, isBarcode, lookupBarcode, makeCustomFood,
  parseIngredientLine, parsePhrase, parseVoiceLog, recognisePlate, recogniseShelf, searchFoods,
  recipeTextFromMarkup,
} from '../src/lib/foodlog.js';
import { CATALOGUE, FOODS, RESTAURANT_FOODS } from '../src/data/foods.js';
import { EXPANDED_FOODS } from '../src/data/expanded-foods.js';

describe('search', () => {
  it('ranks exact and prefix matches first', () => {
    expect(searchFoods('banana')[0].name).toBe('Banana');
    expect(searchFoods('porridge')[0].id).toBe('porridge-oats');
  });

  it('narrows on every word, so brand + food works', () => {
    const hits = searchFoods('nando chicken');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((f) => f.brand?.toLowerCase().includes('nando'))).toBe(true);
  });

  it('finds restaurant menu items', () => {
    expect(searchFoods('katsu').some((f) => f.source === 'restaurant')).toBe(true);
  });

  it('covers a broader everyday food catalogue', () => {
    expect(EXPANDED_FOODS.length).toBeGreaterThanOrEqual(200);
    expect(FOODS.length).toBeGreaterThanOrEqual(284);
    expect(new Set(FOODS.map((food) => food.id)).size).toBe(FOODS.length);

    for (const [query, id] of [
      ['beef mince', 'beef-mince'],
      ['kidney beans', 'kidney-beans'],
      ['oat milk', 'oat-drink'],
      ['raspberries', 'raspberries'],
      ['sirloin steak', 'sirloin-steak'],
      ['butternut squash', 'butternut-squash'],
      ['chia seeds', 'chia-seeds'],
      ['beef lasagne', 'beef-lasagne'],
      ['flat white', 'flat-white'],
    ]) {
      expect(searchFoods(query)[0]?.id, query).toBe(id);
    }
  });

  it('gives new foods usable portions and micronutrients', () => {
    for (const id of ['weetabix', 'cod-fillet', 'quinoa', 'red-pepper', 'pear']) {
      const food = FOODS.find((item) => item.id === id);
      expect(food.servings[0].grams, id).toBeGreaterThan(0);
      expect(food.per100.kcal, id).toBeGreaterThan(0);
      expect(food.per100.potassium, id).toBeGreaterThan(0);
    }
  });

  it('returns nothing for gibberish', () => {
    expect(searchFoods('zzzqqq')).toHaveLength(0);
  });
});

describe('restaurant nutrition', () => {
  it('converts a quoted portion into a per-100 g profile that scales back', () => {
    const katsu = RESTAURANT_FOODS.find((f) => f.name === 'Chicken Katsu Curry');
    const portion = katsu.servings[0].grams;
    expect(Math.round((katsu.per100.kcal * portion) / 100)).toBeCloseTo(1063, -1);
  });
});

describe('barcodes', () => {
  it('validates EAN-8/12/13 shapes', () => {
    expect(isBarcode('5000108000015')).toBe(true);
    expect(isBarcode('12345678')).toBe(true);
    expect(isBarcode('123')).toBe(false);
    expect(isBarcode('50001080000AB')).toBe(false);
  });

  it('resolves a known code and rejects an unknown one', () => {
    expect(lookupBarcode('5000108000015').id).toBe('porridge-oats');
    expect(lookupBarcode('9999999999999')).toBeNull();
  });
});

describe('voice logging', () => {
  it('reads quantities, units and the meal out of a sentence', () => {
    const out = parseVoiceLog('two slices of wholemeal bread and 200g greek yogurt for breakfast');
    expect(out.meal).toBe('breakfast');
    expect(out.matched).toBe(2);
    const [bread, yogurt] = out.items;
    expect(bread.food.id).toBe('wholemeal-bread');
    expect(bread.grams).toBe(72); // 2 × 36 g slice
    expect(yogurt.grams).toBe(200);
    expect(yogurt.entry.meal).toBe('breakfast');
  });

  it('handles glued units and word numbers', () => {
    expect(parsePhrase('300g chicken breast')).toMatchObject({ grams: 300, query: 'chicken breast' });
    expect(parsePhrase('a banana')).toMatchObject({ qty: 1, query: 'banana' });
    expect(parsePhrase('three eggs')).toMatchObject({ qty: 3, query: 'eggs' });
  });

  it('flags phrases it cannot match instead of guessing', () => {
    const out = parseVoiceLog('one portion of zzzqqq');
    expect(out.matched).toBe(0);
    expect(out.items[0].entry).toBeNull();
  });
});

describe('photo recognition', () => {
  it('is deterministic for the same photo', () => {
    const a = recognisePlate('plate.jpg-12345');
    const b = recognisePlate('plate.jpg-12345');
    expect(a.map((i) => i.food.id)).toEqual(b.map((i) => i.food.id));
    expect(a.every((i) => i.confidence >= 68 && i.confidence <= 100)).toBe(true);
    expect(a.every((i) => i.grams > 0 && i.entry.source === 'photo')).toBe(true);
  });
});

describe('shelf recognition', () => {
  it('is deterministic for the same photo', () => {
    const a = recogniseShelf('fridge.jpg-9912');
    const b = recogniseShelf('fridge.jpg-9912');
    expect(a.map((i) => i.name)).toEqual(b.map((i) => i.name));
    expect(a.length).toBeGreaterThan(2);
  });

  it('returns editable pantry rows, not log entries', () => {
    const items = recogniseShelf('cupboard.png-42');
    for (const item of items) {
      expect(item.name.length).toBeGreaterThan(1);
      expect(item.qty).toBeTruthy();
      expect(['Fridge', 'Cupboard']).toContain(item.location);
      expect(item.confidence).toBeGreaterThanOrEqual(64);
      expect(item.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('reads different photos as different shelves', () => {
    const seen = new Set(
      ['a-1', 'b-2', 'c-3', 'd-4', 'e-5', 'f-6'].map((s) => recogniseShelf(s).map((i) => i.name).join('|')),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('recipe import', () => {
  it('parses an ingredient line into weight and a catalogue match', () => {
    const line = parseIngredientLine('250ml semi-skimmed milk');
    expect(line.grams).toBe(250);
    expect(line.food.id).toBe('semi-skimmed-milk');
    expect(parseIngredientLine('2 tbsp peanut butter').grams).toBe(30);
  });

  it('does not treat the first letter of an ingredient as its unit', () => {
    expect(parseIngredientLine('1 lemon').name).toBe('lemon');
    expect(parseIngredientLine('2 garlic cloves').name).toBe('garlic cloves');
  });

  it('supports ordinary recipe fractions and full unit names', () => {
    expect(parseIngredientLine('1/2 cup oats')).toMatchObject({ qty: 0.5, unit: 'cup', grams: 120 });
    expect(parseIngredientLine('2 tablespoons olive oil')).toMatchObject({ unit: 'tbsp', grams: 30 });
    expect(parseIngredientLine('1 litre milk')).toMatchObject({ unit: 'l', grams: 1000 });
    expect(parseIngredientLine('1/0 cup sugar')).toBeNull();
  });

  it('does not use a branded meal or drink as a broad ingredient match', () => {
    expect(parseIngredientLine('1 litre water').food).toBeNull();
    expect(parseIngredientLine('200g chicken').food).toBeNull();
    expect(parseIngredientLine('½ tsp black pepper').food).toBeNull();
  });

  it('estimates per-serving nutrition from pasted text', () => {
    const out = importRecipeText([
      'Peanut butter overnight oats',
      'Serves 2',
      '80g porridge oats',
      '250ml semi-skimmed milk',
      '2 tbsp peanut butter',
      '1 banana',
    ].join('\n'));
    expect(out.title).toBe('Peanut butter overnight oats');
    expect(out.servings).toBe(2);
    expect(out.matchedCount).toBe(4);
    expect(out.perServing.kcal).toBeGreaterThan(200);
    expect(out.food.servings[0].grams).toBeGreaterThan(0);
  });

  it('keeps unknown ingredients explicit without creating a zero-weight food', () => {
    const out = importRecipeText('Mystery bowl\nServes 4\n1 unobtainium');
    expect(out.matchedCount).toBe(0);
    expect(out.food.servings[0].grams).toBeGreaterThan(0);
  });

  it('validates a source URL without pretending it fetched the recipe', () => {
    expect(importRecipeUrl('not a link')).toBeNull();
    expect(importRecipeUrl('https://bbcgoodfood.com/recipes/katsu')).toEqual({
      domain: 'bbcgoodfood.com',
      needsText: true,
      url: 'https://bbcgoodfood.com/recipes/katsu',
    });
  });

  it('converts schema.org recipe JSON-LD pasted from a page into local import text', () => {
    const parsed = recipeTextFromMarkup(`<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Lemon herb chicken',
      recipeYield: 'Serves 2',
      recipeIngredient: ['250g chicken breast', '1 tbsp olive oil', '1 lemon'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Season the chicken, then cook until golden and cooked through.' }],
    })}</script>`);
    expect(parsed.format).toBe('schema.org');
    expect(parsed.text).toContain('Lemon herb chicken');
    expect(parsed.text).toContain('250g chicken breast');
    expect(parsed.text).toContain('Season the chicken');
    expect(importRecipeText(parsed.text).servings).toBe(2);
  });

  it('finds a Recipe nested in a JSON-LD graph and rejects unrelated markup', () => {
    const parsed = recipeTextFromMarkup(JSON.stringify({
      '@graph': [{ '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Graph curry', recipeIngredient: ['1 banana'] } }],
    }));
    expect(parsed.name).toBe('Graph curry');
    expect(recipeTextFromMarkup('<p>Just a normal recipe page</p>')).toBeNull();
  });
});

describe('custom foods', () => {
  it('validates the form at the boundary', () => {
    expect(makeCustomFood({ name: 'x', servingGrams: 0, kcal: '' }).errors.length).toBe(3);
    expect(makeCustomFood({ name: 'Mum’s lasagne', servingGrams: 400, kcal: 620 }).errors).toHaveLength(0);
  });

  it('stores nutrition per 100 g so portions scale', () => {
    const { food } = makeCustomFood({ name: 'Mum’s lasagne', servingGrams: 400, kcal: 620, protein: 38, carbs: 55, fat: 26 });
    expect(food.per100.kcal).toBe(155);
    expect(food.per100.protein).toBe(9.5);
    expect(food.servings[0].grams).toBe(400);
    expect(searchFoods('lasagne', [...CATALOGUE, food])[0].id).toBe(food.id);
  });
});
