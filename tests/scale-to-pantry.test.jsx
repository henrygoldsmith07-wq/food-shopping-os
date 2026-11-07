import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { scaleToPantry } from '../src/lib/scale-to-pantry.js';
import RecipeIngredients from '../src/components/RecipeIngredients.jsx';

const recipe = {
  id: 'thighs', name: 'Chicken traybake', servings: 4,
  ingredients: [{ name: 'Chicken thighs', qty: '500 g' }, { name: 'Onion', qty: '1' }, { name: 'Rice', qty: '300 g' }],
};
const reading = (stock) => (ing) => ({ availableQty: stock[ing.name] || '' });

describe('scale to what you have', () => {
  it('uses the main ingredient you have, rounding down so you never run short', () => {
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '900 g' }), { current: 4 }))
      .toEqual({ servings: 7, ingredient: 'Chicken thighs', have: '900 g', uses: '875 g' });
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '350 g' }), { current: 4 }))
      .toMatchObject({ servings: 2, uses: '250 g' });
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '5 kg' }), { current: 4 }).servings).toBe(12);
  });

  it('says nothing when the main ingredient is not in stock, even if a side one is', () => {
    expect(scaleToPantry(recipe, reading({ Rice: '1 kg' }), { current: 4 })).toBeNull();
  });

  it('says nothing from an assumed pack size, an unmeasurable amount or too little', () => {
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '2 packs' }), { current: 4 })).toBeNull();
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '300 g + 1 pack' }), { current: 4 })).toBeNull();
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '100 g' }), { current: 4 })).toBeNull();
    const tinned = { servings: 2, ingredients: [{ name: 'Chickpeas', qty: '1 tin' }] };
    expect(scaleToPantry(tinned, reading({ Chickpeas: '800 g' }), { current: 2 })).toBeNull();
  });

  it('does not offer what is already on screen, and counts eggs against eggs', () => {
    expect(scaleToPantry(recipe, reading({ 'Chicken thighs': '500 g' }), { current: 4 })).toBeNull();
    const eggs = { servings: 2, ingredients: [{ name: 'Eggs', qty: '4' }] };
    expect(scaleToPantry(eggs, reading({ Eggs: '6' }), { current: 2 })).toMatchObject({ servings: 3, have: '6', uses: '6' });
  });
});

describe('the offer on the ingredient list', () => {
  afterEach(cleanup);
  it('sets the servings in one tap', () => {
    const set = [];
    render(<RecipeIngredients
      app={{ householdAccess: { shopping: true }, prefs: {} }}
      recipe={recipe} original={recipe} servings={4} setServings={(n) => set.push(n)}
      missing={[]} havePantry={1} has={() => false} addedMissingKey={null} missingKey="" addMissing={() => {}}
      dislikeSwaps={[]} onSwapDislike={() => {}} pantryRead={reading({ 'Chicken thighs': '900 g' })}
    />);
    fireEvent.click(screen.getByRole('button', { name: /You have 900 g chicken thighs: cook for 7 \(uses 875 g\)/ }));
    expect(set).toEqual([7]);
  });
});
