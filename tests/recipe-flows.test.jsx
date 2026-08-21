import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openRecipes = () => fireEvent.click(screen.getByText('Recipes'));

const addPantry = (name) => {
  fireEvent.click(screen.getByText('Home'));
  fireEvent.click(screen.getByText('Open pantry →'));
  const sheet = dialogFor('Smart pantry');
  // The form stays open between adds, so only open it when it is closed.
  if (within(sheet).queryByText('Add an item')) fireEvent.click(within(sheet).getByText('Add an item'));
  fireEvent.change(within(sheet).getByLabelText('Item name'), { target: { value: name } });
  fireEvent.click(within(sheet).getByText('Add to pantry'));
  fireEvent.click(within(sheet).getByLabelText('Close'));
};

const countLine = () => screen.getByText(/^\d+ recipes?/).textContent;

describe('the recipe library', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('searches, and says how many it found', () => {
    onboard();
    openRecipes();
    expect(countLine()).toMatch(/^\d+ recipes/);

    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'teriyaki' } });
    expect(screen.getAllByText(/Teriyaki/).length).toBeGreaterThan(0);
  });

  it('filters by ingredient, in and out', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = dialogFor('Filters');

    fireEvent.change(within(sheet).getByLabelText('Ingredient to include'), { target: { value: 'chicken' } });
    fireEvent.click(within(sheet).getByText('With').closest('div').parentElement.querySelector('button[class*="press rounded-xl px-4"]'));
    expect(within(sheet).getByText(/with chicken/)).toBeDefined();

    fireEvent.click(within(sheet).getByText(/^Show \d+ recipes?$/));
    expect(screen.getByRole('button', { name: 'Filters' }).textContent).toBe('1');
  });

  it('filters by cooking time', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(within(dialogFor('Filters')).getByText('≤ 15 min'));
    fireEvent.click(within(dialogFor('Filters')).getByText(/^Show /));
    expect(screen.getByText(/in 15 minutes or less/)).toBeDefined();
  });

  it('filters by diet, saying which one', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(within(dialogFor('Filters')).getByText('Vegan'));
    fireEvent.click(within(dialogFor('Filters')).getByText(/^Show /));
    expect(screen.getByText(/· vegan/)).toBeDefined();
  });

  it('shows only what you could cook right now, and admits an empty pantry', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(within(dialogFor('Filters')).getByText('Can make now'));
    expect(within(dialogFor('Filters')).getByText(/pantry is empty/)).toBeDefined();
    fireEvent.click(within(dialogFor('Filters')).getByText(/^Show /));
    expect(screen.getByText('Nothing matches')).toBeDefined();
  });

  it('keeps favourites in their own view', () => {
    onboard();
    openRecipes();
    const favourite = screen.getAllByLabelText('Favourite')[0];
    expect(favourite.parentElement.closest('button, [role="button"], a[href]')).toBeNull();
    expect(favourite.className).toContain('favourite-button');
    fireEvent.click(favourite);
    expect(favourite.getAttribute('aria-pressed')).toBe('true');
    expect(favourite.className).toContain('is-favourite');
    expect(favourite.querySelector('svg').getAttribute('class')).toContain('favourite-heart');
    fireEvent.click(screen.getByText('Favourites (1)'));
    expect(countLine()).toMatch(/^1 recipe/);
  });

  it('learns taste through an accessible swipe game', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByText('Taste match'));

    const game = dialogFor('Taste match');
    expect(within(game).getByText(/Swipe through recipes/i)).toBeDefined();
    expect(within(game).getByRole('img', { name: /Taste card:/ })).toBeDefined();

    const card = within(game).getByLabelText(/Taste card:/);
    fireEvent.pointerDown(card, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 100, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 100, clientY: 200, pointerId: 1 });
    expect(within(game).getByText(/1 taste recorded/i)).toBeDefined();

    fireEvent.click(within(game).getByRole('button', { name: 'Love it' }));
    expect(within(game).getByText(/2 tastes recorded/i)).toBeDefined();
    expect(screen.getByText('Favourites (1)')).toBeDefined();
  });
});

describe('inventing a recipe', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('says plainly that an empty pantry gives it nothing to work with', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByText('Invent a recipe'));
    expect(within(dialogFor('Invent a recipe')).getByText(/pantry is empty, so there is nothing to invent from/)).toBeDefined();
  });

  it('builds a dish around what you have and keeps it', () => {
    onboard();
    addPantry('Chicken breast');
    addPantry('White rice');
    openRecipes();
    fireEvent.click(screen.getByText('Invent a recipe'));

    const sheet = dialogFor('Invent a recipe');
    expect(within(sheet).getByText(/2 of 4 parts of a dish are covered/)).toBeDefined();
    fireEvent.click(within(sheet).getByText('Invent a recipe', { selector: 'span' }));

    return new Promise((resolve) => setTimeout(() => {
      const open = dialogFor('Invent a recipe');
      expect(within(open).getByText(/from your pantry/)).toBeDefined();
      expect(within(open).getByText(/Assumes you’ll pick up/)).toBeDefined();

      fireEvent.click(within(open).getByText('Save it'));
      expect(within(open).getByText('In my recipes')).toBeDefined();

      fireEvent.click(within(open).getByLabelText('Close'));
      fireEvent.click(screen.getByText('Mine (1)'));
      expect(countLine()).toMatch(/^1 recipe/);
      resolve();
    }, 600));
  });
});

describe('a recipe page', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  const openFirstMatch = (name) => {
    openRecipes();
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: name } });
    fireEvent.click(screen.getAllByText(name)[0]);
  };

  it('scales the ingredients without changing what a serving is', () => {
    onboard();
    openFirstMatch('Lemon Chicken Traybake');
    expect(screen.getByText('600g')).toBeDefined(); // written for 4
    const kcal = screen.getByText('520').textContent;

    fireEvent.click(screen.getByLabelText('Increase'));
    fireEvent.click(screen.getByLabelText('Increase'));
    expect(screen.getByText(/serves 6/)).toBeDefined();
    expect(screen.getByText('900g')).toBeDefined(); // 600g for 4 → 900g for 6
    expect(screen.getByText('520').textContent).toBe(kcal);
  });

  it('swaps an ingredient and recomputes the dish', () => {
    onboard();
    openFirstMatch('Coconut Chickpea Curry');
    const swaps = screen.getByText('Substitutions').closest('.card');
    fireEvent.click(within(swaps).getByText('Rice'));
    fireEvent.click(within(swaps).getByText('Brown rice'));

    expect(screen.getByText('Your version of this dish')).toBeDefined();
    expect(screen.getByText(/Rice → Brown rice/)).toBeDefined();
    expect(screen.getAllByText('Brown rice').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Save to my recipes'));
    expect(screen.getByText('Saved to your recipes')).toBeDefined();
  });

  it('turns a meat dish vegan, and says what it changed', () => {
    onboard();
    openFirstMatch('Lemon Chicken Traybake');
    expect(screen.getByText('Make it vegan')).toBeDefined();
    fireEvent.click(screen.getByText('Make it vegan'));

    expect(screen.getByText('Your version of this dish')).toBeDefined();
    expect(screen.getByText(/Chicken thighs → /)).toBeDefined();
    expect(screen.queryByText('Chicken thighs')).toBeNull();
    expect(screen.queryByText('Make it vegan')).toBeNull(); // nothing left to fix
  });

  it('opens the full nutritional breakdown', () => {
    onboard();
    openFirstMatch('Coconut Chickpea Curry');
    fireEvent.click(screen.getByText('Full breakdown'));
    expect(screen.getByText(/% protein/)).toBeDefined();
    expect(screen.getByText('Potassium')).toBeDefined();
    expect(screen.getByText(/micronutrients are estimated/)).toBeDefined();
  });

  it('turns the recipe like button red and announces the active state', () => {
    onboard();
    openFirstMatch('Coconut Chickpea Curry');
    const favourite = screen.getAllByRole('button', { name: 'Favourite' }).at(-1);

    fireEvent.click(favourite);

    expect(favourite.getAttribute('aria-label')).toBe('Unfavourite');
    expect(favourite.getAttribute('aria-pressed')).toBe('true');
    expect(favourite.className).toContain('is-favourite');
    expect(favourite.querySelector('svg').getAttribute('class')).toContain('favourite-heart');
  });

  it('hands missing recipe ingredients to Shop, then offers a review handoff', () => {
    onboard();
    openFirstMatch('Coconut Chickpea Curry');

    fireEvent.click(screen.getByRole('button', { name: /Add \d+ missing to shopping list/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review shopping list' }));

    expect(screen.getByText('Your list')).toBeDefined();
    expect(screen.getByText('Chickpeas (tins)')).toBeDefined();
  });

  it('hands the recipe over as a code, and takes one back', () => {
    onboard();
    openFirstMatch('Coconut Chickpea Curry');
    fireEvent.click(screen.getByText('Get a code'));
    const code = screen.getByLabelText('Recipe share code').value;
    expect(code.startsWith('FORQ1:')).toBe(true);

    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByText('Add a shared one'));
    const sheet = dialogFor('A recipe someone sent you');
    fireEvent.change(within(sheet).getByLabelText('Recipe code'), { target: { value: code } });
    fireEvent.click(within(sheet).getByText('Read the code'));
    expect(within(sheet).getByText(/From Sam ·/)).toBeDefined();
    fireEvent.click(within(sheet).getByText('Add to my recipes'));

    expect(screen.getByText('Mine (1)')).toBeDefined();
    expect(countLine()).toMatch(/^1 recipe/);
  });

  it('refuses a code that is not one', () => {
    onboard();
    openRecipes();
    fireEvent.click(screen.getByText('Add a shared one'));
    const sheet = dialogFor('A recipe someone sent you');
    fireEvent.change(within(sheet).getByLabelText('Recipe code'), { target: { value: 'have my dinner' } });
    fireEvent.click(within(sheet).getByText('Read the code'));
    expect(within(sheet).getByText(/doesn’t look like a Forq recipe code/)).toBeDefined();
  });
});

describe('cooking it', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('offers a hands-free walkthrough instead of pretending to have video', () => {
    onboard();
    openRecipes();
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'Coconut Chickpea Curry' } });
    fireEvent.click(screen.getAllByText('Coconut Chickpea Curry')[0]);
    fireEvent.click(screen.getByText(/Start cooking mode/));

    expect(screen.getByText('Hands-free walkthrough')).toBeDefined();
    fireEvent.click(screen.getByText('Hands-free walkthrough'));
    expect(screen.getByText(/next in \d+s/)).toBeDefined();
    expect(screen.queryByText('Watch the original')).toBeNull();
  });
});
