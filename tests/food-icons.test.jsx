import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { foodIconKey, recipeIconKey } from '../src/data/food-icon-keys.js';
import { FOOD_ICON, foodIconFor } from '../src/components/food-icons.jsx';
import { Glyph } from '../src/components/icons.jsx';
import { RECIPES } from '../src/data/recipes.js';
import { recipeIconFamily } from '../src/data/recipe-images.js';

describe('food icons from item names', () => {
  it.each([
    ['chopped tomatoes', 'tin'], ['cherry tomatoes', 'tomato'], ['beef tomatoes', 'tomato'],
    ['peanut butter', 'jar'], ['salted butter', 'butter'], ['butter beans', 'bean'],
    ['oat milk', 'carton'], ['semi-skimmed milk', 'milk'], ['porridge oats', 'bag'],
    ['tortilla chips', 'crisps'], ['flour tortillas', 'wrap'], ['egg noodles', 'noodles'],
    ['eggs', 'egg'], ['tuna steak', 'fish'], ['lamb steak', 'ham'], ['beef mince', 'beef'],
    ['turkey mince', 'drumstick'], ['hot dog rolls', 'bread'], ['dog food', 'paw'],
    ['butternut squash', 'squash'], ['spring onions', 'leek'], ['red onion', 'onion'],
    ['sugar snap peas', 'peas'], ['olive oil', 'bottle'], ['sea salt', 'salt'],
    ['toilet roll', 'toiletRoll'], ['washing up liquid', 'spray'], ['fish fingers', 'fish'],
    ['red pepper', 'pepper'], ['black pepper', 'jar'], ['red chilli', 'chilli'],
  ])('%s → %s', (name, key) => {
    expect(foodIconKey(name)).toBe(key);
  });

  it('has an icon for every key the rules can produce', () => {
    const names = RECIPES.flatMap((r) => (r.ingredients || []).map((i) => i?.name || i));
    for (const name of names) {
      const key = foodIconKey(name);
      expect(key, name).toBeTruthy();
      expect(FOOD_ICON[key], key).toBeTruthy();
    }
  });

  it('leaves unknown names to the caller', () => {
    expect(foodIconKey('')).toBeNull();
    expect(foodIconFor('zzz', undefined)).toBeNull();
  });

  it('renders a named item with its own icon rather than the plate', () => {
    const { container: tin } = render(<Glyph e="🍽️" name="chopped tomatoes" />);
    const { container: plate } = render(<Glyph e="🍽️" />);
    expect(tin.innerHTML).not.toBe(plate.innerHTML);
  });
});

describe('recipe icons', () => {
  const keyFor = (name) => {
    const recipe = RECIPES.find((r) => r.name === name);
    return recipeIconKey(recipe, recipeIconFamily(recipe));
  };

  it('names roasts by what is roasted', () => {
    expect(keyFor('Slow Cooker Beef Ragù')).toBe('beef');
    expect(keyFor('Lemon Chicken Traybake')).toBe('drumstick');
  });

  it('every recipe resolves to a drawable icon', () => {
    for (const recipe of RECIPES) {
      const key = recipeIconKey(recipe, recipeIconFamily(recipe));
      if (key) expect(FOOD_ICON[key], `${recipe.name} → ${key}`).toBeTruthy();
    }
  });
});
