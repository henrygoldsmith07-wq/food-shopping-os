import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useItUpMatches } from '../src/lib/use-it-up.js';
import PlanningSignals from '../src/components/PlanningSignals.jsx';

const dish = (over = {}) => ({
  id: over.id || `r-${over.name || 'dish'}`,
  name: over.name || 'Dish',
  meal: 'dinner',
  cuisine: 'Test',
  tags: [],
  time: 30,
  servings: 2,
  costPerServing: 1.5,
  ingredients: [],
  steps: [{ text: 'Cook it.' }],
  ...over,
});

const SPINACH_RICE = dish({
  id: 'r-spinach-rice',
  name: 'Spinach Rice',
  time: 20,
  ingredients: [{ name: 'Spinach', qty: '200 g' }, { name: 'Rice', qty: '150 g' }],
});
const PEPPER_OMELETTE = dish({
  id: 'r-pepper-omelette',
  name: 'Pepper Omelette',
  meal: 'breakfast',
  time: 10,
  ingredients: [{ name: 'Peppers', qty: '1' }, { name: 'Eggs', qty: '2' }],
});
const FULL_ENGLISH = dish({
  id: 'r-full',
  name: 'Full English',
  time: 25,
  ingredients: [
    { name: 'Spinach', qty: '50 g' },
    { name: 'Peppers', qty: '1' },
    { name: 'Eggs', qty: '2' },
    { name: 'Beans', qty: '200 g' },
  ],
});
const FISH_AND_RICE = dish({
  id: 'r-fish',
  name: 'Fish and Rice',
  time: 35,
  ingredients: [{ name: 'White fish', qty: '200 g' }, { name: 'Rice', qty: '150 g' }],
});

const pantry = [
  { id: 'p1', name: 'Spinach', expiry: '2026-02-11' },
  { id: 'p2', name: 'Peppers', expiry: '2026-02-11' },
  { id: 'p3', name: 'Rice', expiry: null },
  { id: 'p4', name: 'Eggs', expiry: '2026-02-20' },
];
const useSoonRows = [
  { item: pantry[0], daysLeft: 1, kind: 'soon' },
  { item: pantry[1], daysLeft: 1, kind: 'soon' },
];

describe('useItUpMatches', () => {
  it('ranks the dish consuming the most use-soon items first', () => {
    const out = useItUpMatches(
      [SPINACH_RICE, PEPPER_OMELETTE, FULL_ENGLISH],
      { useSoonRows, pantry },
    );
    expect(out.map((row) => row.recipe.id)).toEqual([
      'r-full', // consumes spinach + peppers
      'r-pepper-omelette', // peppers; coverage ties spinach rice, faster cook wins
      'r-spinach-rice',
    ]);
    expect(out[0].used).toEqual(['Spinach', 'Peppers']);
  });

  it('ignores recipes that consume nothing use-soon', () => {
    const out = useItUpMatches([FISH_AND_RICE, SPINACH_RICE], { useSoonRows, pantry });
    expect(out.map((row) => row.recipe.id)).toEqual(['r-spinach-rice']);
  });

  it('returns an empty list when there is nothing use-soon or nothing to rank', () => {
    expect(useItUpMatches([SPINACH_RICE], { useSoonRows: [], pantry })).toEqual([]);
    expect(useItUpMatches([], { useSoonRows, pantry })).toEqual([]);
  });

  it('caps the list at the requested maximum', () => {
    const out = useItUpMatches(
      [FULL_ENGLISH, SPINACH_RICE, PEPPER_OMELETTE],
      { useSoonRows, pantry, max: 1 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].recipe.id).toBe('r-full');
  });
});

describe('PlanningSignals use-it-up', () => {
  afterEach(cleanup);

  const app = {
    day: '2026-02-10',
    pantry,
    useSoonIngredients: useSoonRows,
    safeRecipes: [SPINACH_RICE, PEPPER_OMELETTE, FULL_ENGLISH],
  };

  it('offers meals that consume the use-soon ingredients', () => {
    render(<PlanningSignals app={app} openRecipe={() => {}} />);
    expect(screen.getByText('Full English')).toBeTruthy();
    expect(screen.getByLabelText(/Open Full English, uses Spinach, Peppers/)).toBeTruthy();
  });

  it('opening a suggestion hands its recipe to the opener', () => {
    const openRecipe = vi.fn();
    render(<PlanningSignals app={app} openRecipe={openRecipe} />);
    fireEvent.click(screen.getByLabelText(/Open Pepper Omelette/));
    expect(openRecipe).toHaveBeenCalledWith(PEPPER_OMELETTE);
  });

  // A row that cannot open its recipe would be a dead end, not a
  // suggestion — the block falls back to the plain ingredient list.
  it('renders no suggestion rows without an opener', () => {
    render(<PlanningSignals app={app} />);
    expect(screen.queryByLabelText(/Open Full English/)).toBeNull();
    expect(screen.getByText(/Spinach/)).toBeTruthy();
  });
});

import { getUseItUpMatches as _g } from '../src/lib/use-it-up.js';
describe('use-it-up urgency tie-break', () => {
  it('puts the recipe saving the soonest-expiring item first when counts tie', () => {
    const rows = [
      { item: { name: 'spinach' }, daysLeft: -1 },
      { item: { name: 'yoghurt' }, daysLeft: 3 },
    ];
    const recipes = [
      { id: 'a', name: 'Yoghurt bowl', time: 5, ingredients: [{ name: 'yoghurt' }] },
      { id: 'b', name: 'Spinach eggs', time: 20, ingredients: [{ name: 'spinach' }] },
    ];
    const out = _g(recipes, { useSoonRows: rows });
    expect(out.map((m) => m.recipe.id)).toEqual(['b', 'a']);
    expect(out[0].urgency).toBe(-1);
  });
});
