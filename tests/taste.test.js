import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTasteDeck, buildTasteProfile, tasteScore } from '../src/lib/taste.js';
import { buildPlan } from '../src/lib/planner.js';
import { recipeFallbackImage, recipeIconImage, recipeImage } from '../src/data/recipe-images.js';
import { RECIPES } from '../src/data/recipes.js';

const recipe = (id, cuisine, tags = []) => ({
  id,
  name: id,
  meal: 'dinner',
  cuisine,
  tags,
  servings: 2,
  time: 20,
  kcal: 450,
  protein: 25,
  costPerServing: 1.5,
  ingredients: [{ name: 'Ingredient' }],
});

describe('recipe taste matching', () => {
  const indian = recipe('indian', 'Indian', ['curry', 'vegan']);
  const italian = recipe('italian', 'Italian', ['pasta', 'vegetarian']);
  const mexican = recipe('mexican', 'Mexican', ['spicy', 'vegan']);

  it('learns cuisines and tags from likes, loves and skips', () => {
    const profile = buildTasteProfile(
      [indian, italian, mexican],
      { indian: 'love', italian: 'nope', mexican: 'like' },
    );

    expect(profile.rated).toBe(3);
    expect(profile.topCuisines[0]).toBe('Indian');
    expect(tasteScore(indian, profile)).toBeGreaterThan(tasteScore(italian, profile));
  });

  it('builds a varied deck without recipes already judged', () => {
    const deck = buildTasteDeck([indian, italian, mexican], { indian: 'love' });
    expect(deck.map((item) => item.id)).toEqual(['italian', 'mexican']);
  });

  it('uses learnt tastes as a soft AI planning preference', () => {
    const indianRecipes = Array.from({ length: 7 }, (_, index) => recipe(`indian-${index}`, 'Indian', ['curry']));
    const italianRecipes = Array.from({ length: 7 }, (_, index) => recipe(`italian-${index}`, 'Italian', ['pasta']));
    const profile = buildTasteProfile(
      [...indianRecipes, ...italianRecipes],
      { 'indian-0': 'love', 'italian-0': 'nope' },
    );
    const plan = buildPlan(
      { scope: 'A week', budget: 4, recipes: [...indianRecipes, ...italianRecipes], taste: profile },
      12,
    );

    expect(plan.meals).toHaveLength(7);
    expect(plan.meals.every((item) => item.cuisine === 'Indian')).toBe(true);
  });
});

describe('recipe icons', () => {
  it('renders a unique local SVG icon for every catalogue recipe', () => {
    const icons = RECIPES.map(recipeIconImage);
    expect(icons.every((src) => src.startsWith('data:image/svg+xml'))).toBe(true);
    expect(new Set(icons).size).toBe(RECIPES.length);
  });

  it('uses minimal single-weight line artwork with hidden dish metadata', () => {
    const source = decodeURIComponent(recipeIconImage({
      id: 'lentil-soup',
      name: 'Leeks & lentils soup',
      meal: 'lunch',
      ingredients: [{ name: 'Lentils' }, { name: 'Leeks' }],
    }).split(',')[1]);

    expect(source).toContain('data-family="SOUP"');
    expect(source).toContain('stroke-width="16"');
    expect((source.match(/<(?:path|circle|ellipse|rect)\b/g) || []).length).toBeLessThanOrEqual(8);
    expect(source).not.toContain('<linearGradient');
    expect(source).toContain('<title>');
    expect(source).toContain('lentils');
  });

  it('matches the monochrome Le Studio light and dark surfaces', () => {
    const item = { id: 'theme-soup', name: 'Leeks & lentils soup', meal: 'lunch' };
    const light = decodeURIComponent(recipeIconImage(item, { theme: 'light' }).split(',')[1]);
    const dark = decodeURIComponent(recipeIconImage(item, { theme: 'dark' }).split(',')[1]);

    const isGrey = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    expect(light).toContain('#F4F4F4');
    expect(light).toContain('#131313');
    expect(dark).toContain('#0B0B0B');
    expect(dark).toContain('#F4F4F4');
    expect((light.match(/#[0-9A-F]{6}/gi) || []).every(isGrey)).toBe(true);
    expect((dark.match(/#[0-9A-F]{6}/gi) || []).every(isGrey)).toBe(true);
    expect(light).not.toBe(dark);
  });

  it('keeps common dishes on distinct icon families', () => {
    const family = (name, meal = 'dinner') => decodeURIComponent(
      recipeIconImage({ name, meal }).split(',')[1],
    );

    expect(family('Leeks & lentils soup', 'lunch')).toContain('SOUP');
    expect(family('Smoky Three-Bean Chilli')).toContain('CHILLI');
    expect(family('Chicken breast Thai green curry')).toContain('CURRY');
    expect(family('Eggs & spinach on wholemeal toast', 'breakfast')).toContain('EGGS ON TOAST');
  });

  it('does not reference a remote photo host or old photo cache', () => {
    expect(RECIPES.every((item) => !/^https?:\/\//.test(recipeImage(item)))).toBe(true);
    const serviceWorker = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
    expect(serviceWorker).not.toContain('/recipe-images/');
  });

  it('uses the same icon for the compatibility aliases', () => {
    const item = { id: 'r-1', name: 'Coconut Chickpea Curry', meal: 'dinner' };
    expect(recipeImage(item)).toBe(recipeIconImage(item));
    expect(recipeFallbackImage(item)).toBe(recipeIconImage(item));
    expect(recipeImage(item)).toBe(recipeImage({ ...item }));
  });
});
