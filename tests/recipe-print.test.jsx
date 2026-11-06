import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import RecipeIngredients from '../src/components/RecipeIngredients.jsx';
import { printableRecipe, recipeAsText } from '../src/lib/recipe-print.js';
import { readTicks, useIngredientTicks, writeTicks } from '../src/lib/ingredient-ticks.js';

const recipe = {
  id: 'curry', name: 'Coconut <Chickpea> Curry', servings: 4, prep: 5, time: 25,
  source: 'https://example.com/curry',
  ingredients: [{ name: 'Chickpeas', qty: '2 tins' }, { name: 'Coconut milk', qty: '1 tin' }, { name: 'Salt' }],
  steps: [{ text: 'Fry the onion.' }, { text: 'Simmer.', timerMins: 15 }, 'Serve.'],
};

describe('recipe as text', () => {
  it('writes name, facts, ingredients, numbered method, note and source', () => {
    expect(recipeAsText(recipe, { note: 'Less chilli' })).toBe([
      'Coconut <Chickpea> Curry',
      'Serves 4 · Prep 5 min · Cook 25 min',
      '',
      'Ingredients',
      '• 2 tins Chickpeas',
      '• 1 tin Coconut milk',
      '• Salt',
      '',
      'Method',
      '1. Fry the onion.',
      '2. Simmer.',
      '3. Serve.',
      '',
      'Note: Less chilli',
      '',
      'Source: https://example.com/curry',
    ].join('\n'));
  });

  it('leaves out what a recipe does not have, and unsafe links', () => {
    const text = recipeAsText({ name: 'Toast', ingredients: [{ name: 'Bread', qty: '2 slices' }], source: 'javascript:alert(1)' });
    expect(text).toBe('Toast\n\nIngredients\n• 2 slices Bread');
    expect(recipeAsText(null)).toBe('');
  });
});

describe('printable recipe', () => {
  it('escapes the recipe and includes the note', () => {
    const html = printableRecipe(recipe, { note: 'Kids <3 it' });
    expect(html).toContain('<h1>Coconut &lt;Chickpea&gt; Curry</h1>');
    expect(html).toContain('<li><span class="qty">2 tins</span> Chickpeas</li>');
    expect(html).toContain('<li>Simmer.</li>');
    expect(html).toContain('Kids &lt;3 it');
    expect(html).not.toContain('<Chickpea>');
  });
});

describe('ingredient ticks', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it('toggles, survives a remount, and clears', () => {
    const { result, unmount } = renderHook(() => useIngredientTicks('curry'));
    act(() => result.current[1]('Chickpeas'));
    act(() => result.current[1]('Salt'));
    act(() => result.current[1]('Salt'));
    expect([...result.current[0]]).toEqual(['Chickpeas']);
    unmount();
    const again = renderHook(() => useIngredientTicks('curry'));
    expect(again.result.current[0].has('Chickpeas')).toBe(true);
    act(() => again.result.current[2]());
    expect(readTicks('curry')).toEqual([]);
  });

  it('keeps each recipe to its own ticks', () => {
    writeTicks('soup', ['Leeks']);
    const { result, rerender } = renderHook(({ id }) => useIngredientTicks(id), { initialProps: { id: 'curry' } });
    expect(result.current[0].size).toBe(0);
    rerender({ id: 'soup' });
    expect(result.current[0].has('Leeks')).toBe(true);
  });

  it('works when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readTicks('curry')).toEqual([]);
    spy.mockRestore();
  });
});

describe('RecipeIngredients checklist', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(cleanup);

  it('ticks an ingredient off without touching the pantry check', () => {
    const has = (ing) => ing.name === 'Salt';
    render(<RecipeIngredients
      app={{ householdAccess: { shopping: true }, prefs: {} }}
      recipe={recipe} original={recipe} servings={4} setServings={() => {}}
      missing={recipe.ingredients.filter((i) => !has(i))} havePantry={1} has={has}
      addedMissingKey={null} missingKey="" addMissing={() => {}} dislikeSwaps={[]} onSwapDislike={() => {}}
      pantryRead={() => ({ availableQty: null, shortfallQty: null })}
    />);
    const chickpeas = screen.getByRole('button', { name: '2 tins Chickpeas, not in your pantry' });
    expect(chickpeas.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chickpeas);
    expect(screen.getByRole('button', { name: /Chickpeas, not in your pantry, out on the counter/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1 of 3 out on the counter')).toBeTruthy();
    expect(screen.getByText(/You have 1 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear ticks' }));
    expect(screen.getByText(/Tap an ingredient/)).toBeTruthy();
  });
});
