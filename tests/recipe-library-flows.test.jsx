import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const state = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
};

const openRecipes = () => fireEvent.click(screen.getByText('Recipes'));

const openRecipe = (name) => {
  fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: name } });
  fireEvent.click(screen.getAllByText(name)[0]);
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((node) => node.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

describe('personal recipe library', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('rates recipes and organises them into named collections', () => {
    render(<App />);
    openRecipes();
    openRecipe('Coconut Chickpea Curry');

    fireEvent.click(screen.getByLabelText('Rate 4 stars'));
    expect(screen.getByText('Your rating: 4/5')).toBeDefined();

    fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Weeknight' } });
    fireEvent.click(screen.getByText('Create collection'));
    expect(screen.getByRole('button', { name: 'Remove from Weeknight' })).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByText('Collections (1)'));
    expect(screen.getByRole('button', { name: 'Weeknight (1)' })).toBeDefined();
    expect(screen.getAllByText('Coconut Chickpea Curry').length).toBeGreaterThan(0);
    expect(screen.getByText('★ 4/5')).toBeDefined();
  });

  it('imports copied recipe text with its URL and original video intact', () => {
    render(<App />);
    openRecipes();
    fireEvent.click(screen.getByText('Import from URL'));

    const sheet = dialogFor('Import a recipe');
    fireEvent.click(within(sheet).getByText('From a link'));
    fireEvent.change(within(sheet).getByLabelText('Recipe URL'), {
      target: { value: 'https://www.youtube.com/watch?v=recipe123' },
    });
    fireEvent.change(within(sheet).getByLabelText('Recipe text'), {
      target: {
        value: 'Tomato pasta\nServes 2\n200g pasta\n100g tomatoes\nBoil the pasta until tender, then toss thoroughly with the tomato sauce.',
      },
    });
    fireEvent.click(within(sheet).getByText('Import recipe'));

    expect(within(sheet).getByText('Tomato pasta')).toBeDefined();
    expect(within(sheet).getByText(/copied text · source link kept/i)).toBeDefined();
    fireEvent.click(within(sheet).getByText('Save to My recipes'));
    fireEvent.click(within(sheet).getByLabelText('Close'));

    fireEvent.click(screen.getByText('Mine (1)'));
    fireEvent.click(screen.getAllByText('Tomato pasta')[0]);
    expect(screen.getByRole('link', { name: 'Watch the original' }).href).toBe('https://www.youtube.com/watch?v=recipe123');
  });
});

describe('recipe folders', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const fileRecipe = (recipe, folder) => {
    openRecipe(recipe);
    fireEvent.change(screen.getAllByLabelText('New folder name')[0], { target: { value: folder } });
    fireEvent.click(screen.getByText('File it here'));
    expect(screen.getByText(`Filed in ${folder}.`)).toBeDefined();
    fireEvent.click(screen.getByLabelText('Close'));
  };

  it('files a recipe into a folder and filters the list down to it', () => {
    render(<App />);
    openRecipes();
    fileRecipe('Coconut Chickpea Curry', 'Weeknights');

    fireEvent.click(screen.getByText('Folders (1)'));
    expect(screen.getByRole('button', { name: 'Weeknights (1)' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Weeknights (1)' }));
    expect(screen.getByText('1 recipe')).toBeDefined();
    expect(screen.getAllByText('Coconut Chickpea Curry').length).toBeGreaterThan(0);

    // "All recipes" is the absence of a filter, not a folder of its own.
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^All recipes \(\d+\)$/ }));
    expect(screen.getByText(/^\d\d+ recipes$/)).toBeDefined();
  });

  it('moves a recipe between folders rather than copying it', () => {
    render(<App />);
    openRecipes();
    fileRecipe('Coconut Chickpea Curry', 'Weeknights');

    openRecipe('Coconut Chickpea Curry');
    fireEvent.change(screen.getAllByLabelText('New folder name')[0], { target: { value: 'Sunday cooking' } });
    fireEvent.click(screen.getByText('File it here'));
    expect(screen.getByText('Filed in Sunday cooking.')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Close'));

    fireEvent.click(screen.getByText('Folders (2)'));
    expect(screen.getByRole('button', { name: 'Weeknights (0)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sunday cooking (1)' })).toBeDefined();
  });

  it('renames a folder, and deleting one leaves its recipes unfiled', () => {
    render(<App />);
    openRecipes();
    fileRecipe('Coconut Chickpea Curry', 'Weeknights');
    fireEvent.click(screen.getByText('Folders (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Weeknights (1)' }));

    fireEvent.click(screen.getByLabelText('Rename Weeknights'));
    fireEvent.change(screen.getByLabelText('Rename folder'), { target: { value: 'Fast dinners' } });
    fireEvent.click(screen.getByLabelText('Save folder name'));
    expect(screen.getByRole('button', { name: 'Fast dinners (1)' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Fast dinners (1)' }));
    fireEvent.click(screen.getByLabelText('Delete Fast dinners'));
    expect(screen.getByText('Folders (0)')).toBeDefined();
    // The recipe survived its folder.
    expect(screen.getAllByText('Coconut Chickpea Curry').length).toBeGreaterThan(0);
  });
});
