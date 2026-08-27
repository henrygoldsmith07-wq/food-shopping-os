import { describe, it, expect } from 'vitest';
import { BRANDED_FOODS, BRANDS } from '../src/data/branded-foods.js';
import { CATALOGUE, FOODS } from '../src/data/foods.js';
import {
  brandedAlternatives, dietTags, healthScore, matchFood, processingTag, tagsForItem,
} from '../src/lib/food-tags.js';
import { searchFoods } from '../src/lib/foodlog.js';

const labels = (tags, group) => tags.filter((tag) => tag.group === group).map((tag) => tag.label);

describe('the branded catalogue is structurally sound', () => {
  it('has unique ids that do not collide with the generic catalogue', () => {
    const ids = BRANDED_FOODS.map((food) => food.id);
    expect(new Set(ids).size).toBe(ids.length);
    const generic = FOODS.filter((food) => !BRANDED_FOODS.includes(food)).map((food) => food.id);
    expect(ids.filter((id) => generic.includes(id))).toEqual([]);
  });

  it('gives every row the three nutrients the health grade depends on', () => {
    // An unknown here is read as zero elsewhere, which would grade a chocolate
    // bar better than a bag of lentils. Every branded row must state them.
    for (const food of BRANDED_FOODS) {
      expect(Number.isFinite(food.per100.sugar), `${food.name} sugar`).toBe(true);
      expect(Number.isFinite(food.per100.satFat), `${food.name} satFat`).toBe(true);
      expect(Number.isFinite(food.per100.sodium), `${food.name} sodium`).toBe(true);
    }
  });

  it('keeps macros physically plausible against their energy', () => {
    for (const food of BRANDED_FOODS) {
      const { kcal, protein, carbs, fat } = food.per100;
      expect(kcal, food.name).toBeGreaterThanOrEqual(0);
      expect(kcal, food.name).toBeLessThanOrEqual(900);
      // 4/4/9 kcal per gram, with slack for fibre, polyols and rounding.
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      if (kcal > 20) expect(Math.abs(fromMacros - kcal) / kcal, food.name).toBeLessThan(0.35);
    }
  });

  it('never lets a sub-component exceed its total', () => {
    for (const food of BRANDED_FOODS) {
      expect(food.per100.sugar, `${food.name} sugar vs carbs`).toBeLessThanOrEqual(food.per100.carbs + 0.5);
      expect(food.per100.satFat, `${food.name} satFat vs fat`).toBeLessThanOrEqual(food.per100.fat + 0.5);
    }
  });

  it('names a brand on every row, and lists them', () => {
    for (const food of BRANDED_FOODS) {
      expect(food.brand, food.name).toBeTruthy();
      expect(food.source).toBe('branded');
      expect(food.tags).toContain('branded');
    }
    expect(BRANDS.length).toBeGreaterThan(20);
  });

  it('reaches the catalogue the rest of the app searches', () => {
    expect(CATALOGUE.some((food) => food.id === 'heinz-baked-beans-brand')).toBe(true);
    expect(searchFoods('Cathedral City').some((food) => food.brand === 'Cathedral City')).toBe(true);
  });
});

describe('branded items tag from their own numbers', () => {
  it('matches a named product and grades it from its own label', () => {
    const beans = tagsForItem({ name: 'Heinz Baked Beans', perRetailer: [] });
    expect(beans.matchedFood).toBe('Heinz Baked Beans');
    expect(beans.health.grade).toBe('A');

    const nutella = tagsForItem({ name: 'Nutella hazelnut spread', perRetailer: [] });
    expect(nutella.health.grade).toBe('E');
    expect(labels(nutella.tags, 'nutrition')).toEqual(
      expect.arrayContaining(['High sugar', 'High saturated fat']),
    );
  });

  it('still sends a generic query to the generic entry', () => {
    // Adding "Heinz Baked Beans" must not stop "baked beans" resolving.
    expect(matchFood('baked beans')?.name).toBe('Baked beans');
    expect(matchFood('Heinz baked beans')?.name).toBe('Heinz Baked Beans');
  });

  it('reads a branded pack as manufactured however innocent the name', () => {
    const food = matchFood('Napolina chopped tomatoes');
    expect(processingTag('Napolina chopped tomatoes', food).id).toBe('processed');
    // The generic version of the same words stays minimally processed.
    expect(processingTag('Chopped tomatoes', null).id).toBe('minimally-processed');
  });

  it('calls a branded confection ultra-processed', () => {
    const food = matchFood('Cadbury Dairy Milk');
    expect(processingTag('Cadbury Dairy Milk', food).id).toBe('ultra-processed');
  });
});

describe('diet tags use the catalogue, not just the words', () => {
  it('sees dairy the product name never mentions', () => {
    // "Cathedral City Mature Cheddar" contains no word matching dairy.
    const food = matchFood('Cathedral City mature cheddar');
    expect(labels(dietTags('Cathedral City mature cheddar', food), 'diet')).toEqual(['Vegetarian (by name)']);
    // Nutella's milk powder is invisible in its name too.
    const nutella = matchFood('Nutella hazelnut spread');
    expect(labels(dietTags('Nutella hazelnut spread', nutella), 'diet')).toEqual(['Vegetarian (by name)']);
  });

  it('does not read a meat substitute as meat', () => {
    // "Quorn Meat Free Mince" matches the word "mince" — reading that as
    // "contains meat" is precisely backwards for whoever filters on it.
    const food = matchFood('Quorn meat free mince');
    expect(labels(dietTags('Quorn meat free mince', food), 'diet')).toEqual(['Vegetarian']);
    expect(labels(dietTags('Vegetarian sausages'), 'diet')).toEqual(['Vegetarian']);
  });

  it('still reads actual meat and fish as such', () => {
    expect(labels(dietTags('Richmond thick pork sausages'), 'diet')).toEqual(['Contains meat']);
    expect(labels(dietTags('Birds Eye cod fish fingers'), 'diet')).toEqual(['Contains fish']);
  });

  it('takes a vegan claim from the catalogue as well as the name', () => {
    const food = matchFood('Linda McCartney vegetarian sausages');
    expect(labels(dietTags('Linda McCartney vegetarian sausages', food), 'diet')).toEqual(['Vegan (labelled)']);
  });
});

describe('the health grade refuses to guess', () => {
  it('declines when the nutrients that push a grade down are unknown', () => {
    expect(healthScore({ kcal: 500, protein: 5 })).toBeNull();
    expect(healthScore({ kcal: 500, protein: 5, sugar: null, satFat: 1, sodium: 1 })).toBeNull();
  });

  it('grades once those nutrients are known', () => {
    expect(healthScore({ kcal: 500, protein: 5, sugar: 50, satFat: 20, sodium: 400 }).grade).toBe('E');
  });
});

describe('suggesting a named product for a generic one', () => {
  it('offers the brands behind a generic item', () => {
    expect(brandedAlternatives('baked beans').map((row) => row.name))
      .toEqual(['Heinz Baked Beans', 'Branston Baked Beans']);
    expect(brandedAlternatives('ketchup').map((row) => row.brand)).toEqual(['Heinz']);
  });

  it('offers nothing for an item that is already specific', () => {
    expect(brandedAlternatives('Heinz Baked Beans')).toEqual([]);
  });

  it('offers nothing it cannot back with a real product', () => {
    expect(brandedAlternatives('quinoa')).toEqual([]);
    expect(brandedAlternatives('')).toEqual([]);
  });

  it('caps how many it offers', () => {
    expect(brandedAlternatives('sausages', { limit: 1 })).toHaveLength(1);
  });
});
