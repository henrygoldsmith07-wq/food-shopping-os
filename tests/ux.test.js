import { describe, expect, it } from 'vitest';
import { buildGlobalResults } from '../src/lib/global-search.js';
import { moveBefore } from '../src/lib/utils.js';

const app = {
  catalogue: [
    { id: 'milk-food', name: 'Semi-skimmed milk', brand: 'Dairy Farm' },
    { id: 'banana-food', name: 'Banana' },
  ],
  safeRecipes: [
    { id: 'milk-rice', name: 'Creamy rice pudding', tags: ['dessert'] },
  ],
  pantry: [
    { id: 'pantry-milk', name: 'Oat milk', cat: 'Dairy alternatives', location: 'Fridge' },
  ],
  shoppingList: [
    { id: 'list-milk', name: 'Whole milk', aisle: 'Dairy' },
  ],
};

describe('global search', () => {
  it('searches commands, foods, recipes, pantry and the shopping list together', () => {
    const results = buildGlobalResults(app, 'milk');
    expect(new Set(results.map((result) => result.type))).toEqual(
      new Set(['command', 'food', 'pantry', 'shopping']),
    );
    expect(results[0].title.toLowerCase()).toContain('milk');
  });

  it('filters by result type and supports alphabetical sorting', () => {
    const foods = buildGlobalResults(app, '', { type: 'food', sort: 'name' });
    expect(foods.map((result) => result.title)).toEqual(['Banana', 'Semi-skimmed milk']);
    expect(foods.every((result) => result.type === 'food')).toBe(true);
  });

  it('keeps commands available before a query is typed', () => {
    const commands = buildGlobalResults(app, '');
    expect(commands.length).toBeGreaterThan(6);
    expect(commands.every((result) => result.type === 'command')).toBe(true);
    expect(commands.some((result) => result.title === 'Open pantry')).toBe(true);
  });
});

describe('drag ordering', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('places rows before their target in both directions', () => {
    expect(moveBefore(rows, 'a', 'c').map((row) => row.id)).toEqual(['b', 'a', 'c']);
    expect(moveBefore(rows, 'c', 'a').map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves invalid moves untouched', () => {
    expect(moveBefore(rows, 'missing', 'a')).toBe(rows);
    expect(moveBefore(rows, 'a', 'a')).toBe(rows);
  });
});
