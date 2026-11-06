import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  RECIPE_NOTE_MAX, cookHistory, cookHistoryById, cookedLabel, lastMadeLabel, withRecipeNote,
} from '../src/lib/recipe-journal.js';
import { recipeActions } from '../src/lib/recipe-actions.js';
import { searchAndSortRecipes } from '../src/lib/recipe-search.js';
import RecipeJournal from '../src/components/RecipeJournal.jsx';

const TODAY = '2026-11-05';
const cooked = [
  { recipeId: 'chilli', date: '2026-10-01' },
  { recipeId: 'chilli', date: '2026-10-24' },
  { recipeId: 'chilli', date: '2026-10-10' },
  { recipeId: 'soup', date: '2026-11-04' },
  { recipeId: 'curry', date: '2026-08-01' },
  { recipeId: 'bad', date: 'not a date' },
];

describe('cook history', () => {
  it('counts real cooks and finds the latest, whatever order they were logged in', () => {
    expect(cookHistory(cooked, 'chilli', TODAY)).toEqual({ count: 3, last: '2026-10-24', daysAgo: 12 });
    expect(cookHistory(cooked, 'pie', TODAY)).toBeNull();
    expect(cookHistory(cooked, 'bad', TODAY)).toBeNull();
    expect(cookHistory(null, 'chilli', TODAY)).toBeNull();
  });

  it('labels it in plain words', () => {
    expect(cookedLabel(cookHistory(cooked, 'chilli', TODAY))).toBe('Cooked 3 times · last 12 days ago');
    expect(cookedLabel(cookHistory(cooked, 'soup', TODAY))).toBe('Cooked once · last yesterday');
    expect(cookedLabel(cookHistory(cooked, 'curry', TODAY))).toBe('Cooked once · last 3 months ago');
    expect(lastMadeLabel(cookHistory(cooked, 'soup', '2026-11-04'))).toBe('Made today');
    expect(cookedLabel(null)).toBeNull();
  });

  it('sorts by rotation: regulars first, or longest since made', () => {
    const recipes = ['chilli', 'soup', 'curry', 'pie'].map((id) => ({ id, name: id, tags: [], ingredients: [] }));
    const history = cookHistoryById(cooked, TODAY);
    expect(searchAndSortRecipes(recipes, { sort: 'often', history }).map((r) => r.id)).toEqual(['chilli', 'soup', 'curry', 'pie']);
    expect(searchAndSortRecipes(recipes, { sort: 'stale', history }).map((r) => r.id)).toEqual(['curry', 'chilli', 'soup', 'pie']);
  });
});

describe('recipe notes', () => {
  it('sets, trims, caps and clears a note', () => {
    expect(withRecipeNote({}, 'a', '  less chilli \r\n ')).toEqual({ a: 'less chilli' });
    expect(withRecipeNote({ a: 'x', b: 'y' }, 'a', '   ')).toEqual({ b: 'y' });
    const same = { a: 'x' };
    expect(withRecipeNote(same, 'a', 'x')).toBe(same);
    expect(withRecipeNote(same, 'zz', '')).toBe(same);
    expect(withRecipeNote(undefined, 'a', 'x'.repeat(RECIPE_NOTE_MAX + 50)).a).toHaveLength(RECIPE_NOTE_MAX);
  });

  const store = (init = {}) => {
    let state = { myRecipes: [{ id: 'a' }], favourites: [], recipeFolders: [], recipeCollections: [], recipeRatings: {}, tasteRatings: {}, recipeNotes: {}, members: [], activeMemberId: null, ...init };
    const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
    return { actions: recipeActions(set), get: () => state };
  };

  it('is kept through the recipe actions and goes with a removed recipe', () => {
    const { actions, get } = store();
    actions.setRecipeNote('a', 'Double the sauce');
    expect(get().recipeNotes).toEqual({ a: 'Double the sauce' });
    actions.removeRecipe('a');
    expect(get().recipeNotes).toEqual({});
  });

  it('is not written without recipe permission', () => {
    const { actions, get } = store({
      activeMemberId: 'kid', members: [{ id: 'kid', role: 'child', permissions: { recipes: false } }],
    });
    actions.setRecipeNote('a', 'x');
    expect(get().recipeNotes).toEqual({});
  });
});

describe('RecipeJournal', () => {
  afterEach(cleanup);
  const app = (extra = {}) => ({
    day: TODAY, cooked, recipeNotes: {}, householdAccess: { recipes: true }, setRecipeNote: () => {}, ...extra,
  });

  it('shows cook history and saves a note', () => {
    const saved = [];
    render(<RecipeJournal app={app({ setRecipeNote: (id, text) => saved.push([id, text]) })} recipeId="chilli" />);
    expect(screen.getByText('Cooked 3 times · last 12 days ago')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add a note/i }));
    fireEvent.change(screen.getByLabelText('Your note'), { target: { value: 'Less chilli' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(saved).toEqual([['chilli', 'Less chilli']]);
  });

  it('shows a note read-only to a member without recipe access', () => {
    render(<RecipeJournal app={app({ recipeNotes: { pie: 'Kids loved it' }, householdAccess: { recipes: false } })} recipeId="pie" />);
    expect(screen.getByText('Kids loved it')).toBeTruthy();
    expect(screen.getByText(/Not cooked yet/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
