import { describe, expect, it } from 'vitest';
import { estimateRecipe } from '../src/data/recipe-estimate.js';
import { allRecipes, byId } from '../src/data/recipes.js';
import '../src/data/recipes-full.js';
import { recipeAllowed } from '../src/lib/goals.js';

/**
 * Diet filters are a trust-and-safety line, not a ranking nudge. These pin the
 * two layers that keep meat and fish away from a vegetarian: the estimator
 * that tags name-only recipes, and the filter that refuses any recipe naming
 * meat or fish whatever its tag says.
 */

const vegetarianOk = (recipe) => recipeAllowed(recipe, ['vegetarian']);

describe('name-only estimates never call a meat or fish dish vegetarian', () => {
  it.each([
    'Bangers and mash', 'Spaghetti bolognese', 'Carbonara', 'Amatriciana', 'Cottage pie',
    "Shepherd's pie", 'Chicken pie', 'Steak pie', 'Fish pie', 'Fish and chips', 'Pepperoni pizza',
    'Ham and cheese sandwich', 'Cheeseburger', 'Toad in the hole', 'Full English breakfast', 'BLT',
    'Eggs Benedict', 'Eggs Royale', 'Sushi', 'Paella', 'Kedgeree', 'Moussaka', 'Lancashire hotpot',
    'Cornish pasty', 'Pad Thai', 'Caesar salad', 'Puttanesca', 'French onion soup', 'BBQ ribs',
    'Singapore noodles', 'Miso soup', 'Clam chowder', 'Seafood pasta', 'Steamed bao buns',
  ])('%s', (name) => {
    const { dietTags } = estimateRecipe(name);
    expect(dietTags).not.toContain('vegetarian');
    expect(dietTags).not.toContain('vegan');
  });

  it.each([
    'Lentil bolognese', 'Vegetarian cottage pie', 'Vegan sausages and mash', 'Mushroom stroganoff',
    'Halloumi burgers', 'Vegetable lasagne', 'Mince pies', 'Apple pie', 'Eggs Florentine',
  ])('keeps a vegetarian dish vegetarian: %s', (name) => {
    expect(estimateRecipe(name).dietTags).toContain('vegetarian');
  });

  it('gives an implied-meat dish the meat in its ingredients, beside what it names', () => {
    const names = (n) => estimateRecipe(n).ingredients.map((i) => i.name);
    expect(names('Bangers and mash')).toEqual(expect.arrayContaining(['Sausages']));
    expect(names('Eggs Benedict')).toEqual(expect.arrayContaining(['Bacon', 'Eggs']));
    expect(names('Mince pies')).not.toContain('Beef mince');
  });
});

describe('the vegetarian filter refuses meat or fish whatever the tag says', () => {
  const recipe = (name, ingredients, tags = ['vegetarian']) => ({
    name, tags, ingredients: ingredients.map((i) => ({ name: i })),
  });

  it('refuses a mis-tagged recipe that names meat or fish', () => {
    expect(vegetarianOk(recipe('Chicken and leek pie', ['Chicken breast', 'Leeks']))).toBe(false);
    expect(vegetarianOk(recipe('Weeknight pasta', ['Pasta', 'Anchovies']))).toBe(false);
  });

  it('reads past plant stand-ins', () => {
    expect(vegetarianOk(recipe('Vegan bangers and mash', ['Vegan sausages', 'Potato']))).toBe(true);
    expect(vegetarianOk(recipe('Chilli', ['Quorn mince', 'Kidney beans']))).toBe(true);
    expect(vegetarianOk(recipe('Stir fry', ['Oyster mushrooms', 'Noodles']))).toBe(true);
  });

  it('lets a pescatarian keep fish but not meat', () => {
    expect(recipeAllowed(recipe('Fish tacos', ['Cod', 'Tortillas']), ['pescatarian'])).toBe(true);
    expect(recipeAllowed(recipe('Chorizo rice', ['Chorizo', 'Rice']), ['pescatarian'])).toBe(false);
  });

  it('no recipe in the book that a vegetarian can see names meat or fish', () => {
    const MEATY = /\b(chicken|beef|pork|lamb|bacon|ham|sausages?|steak|mince|turkey|fish|salmon|tuna|cod|prawns?|anchov\w*|chorizo|pepperoni|bolognese|carbonara|bangers)\b/i;
    const PLANT = /\b(vegan|vegetarian|veggie|quorn|lentil|mince pies?)\b/i;
    const leaks = allRecipes()
      .filter(vegetarianOk)
      .filter((r) => MEATY.test(r.name) && !PLANT.test(r.name))
      .map((r) => r.name);
    expect(leaks).toEqual([]);
  });
});

describe('the book is honest about what it does not know', () => {
  it('withdraws name-only dishes the estimator could not read, but still opens them by id', () => {
    const { estimateConfidence } = estimateRecipe('Baba ganoush');
    expect(estimateConfidence).toBe('unknown');
    expect(allRecipes().some((r) => r.id === 'master-recipe-baba-ganoush')).toBe(false);
    expect(byId('master-recipe-baba-ganoush')?.name).toBe('Baba ganoush');
  });

  it('has one entry per dish name', () => {
    const key = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    const names = allRecipes().map((r) => key(r.name));
    expect(names.length - new Set(names).size).toBe(0);
  });
});
