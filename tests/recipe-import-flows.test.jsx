import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const state = { onboarded: true, name: 'Sam', day: '2026-07-28' };

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((node) => node.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openImporter = () => {
  render(<App />);
  fireEvent.click(screen.getByText('Recipes'));
  fireEvent.click(screen.getByText('More recipe tools'));
  fireEvent.click(screen.getByText('Link, photo or paste'));
  return dialogFor('Import a recipe');
};

describe('importing a recipe from a link', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fetches the link, shows what was read, and credits where it came from', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({
      draft: {
        title: 'One-pan lemon chicken',
        servings: 2,
        ingredients: ['300 g chicken breast', '200 g white rice'],
        steps: ['Roast for forty minutes.'],
      },
      text: 'One-pan lemon chicken\nServes 2\n300 g chicken breast\n200 g white rice\nMethod\nRoast for forty minutes.',
      source: {
        url: 'https://www.tiktok.com/@ana/video/1',
        platform: 'tiktok',
        platformLabel: 'TikTok',
        via: 'link',
        read: 'caption',
        author: 'chef.ana',
        model: 'some/model:free',
      },
    })));

    const sheet = openImporter();
    fireEvent.click(within(sheet).getByText('From a link'));
    fireEvent.change(within(sheet).getByLabelText('Recipe or video link'), {
      target: { value: 'https://www.tiktok.com/@ana/video/1' },
    });
    fireEvent.click(within(sheet).getByText('Fetch this recipe'));

    await waitFor(() => expect(within(sheet).getByText('One-pan lemon chicken')).toBeDefined());
    // The user gets the text to check, not just a finished recipe.
    expect(within(sheet).getByLabelText('Recipe text').value).toContain('300 g chicken breast');
    expect(within(sheet).getByText(/What was read — check it before importing/)).toBeDefined();
    // A caption is not the same thing as a published recipe, and says so.
    expect(within(sheet).getByText(/From TikTok by chef\.ana · from the video caption/)).toBeDefined();
    expect(within(sheet).getByText(/check the amounts against the original/)).toBeDefined();
    // The ingredients went through the ordinary matcher.
    expect(within(sheet).getAllByText(/Chicken breast/).length).toBeGreaterThan(0);
  });

  it('marks a recipe read from the page’s own data as exact rather than inferred', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({
      draft: null,
      text: 'Porridge\nServes 1\n60 g porridge oats\n300 ml semi-skimmed milk',
      source: {
        url: 'https://recipes.test/porridge',
        platform: 'web',
        platformLabel: 'recipes.test',
        via: 'link',
        read: 'schema.org',
        author: 'Ana Cook',
      },
    })));

    const sheet = openImporter();
    fireEvent.click(within(sheet).getByText('From a link'));
    fireEvent.change(within(sheet).getByLabelText('Recipe or video link'), {
      target: { value: 'https://recipes.test/porridge' },
    });
    fireEvent.click(within(sheet).getByText('Fetch this recipe'));

    await waitFor(() => expect(within(sheet).getByText('Porridge')).toBeDefined());
    expect(within(sheet).getByText(/from the page’s own recipe data/)).toBeDefined();
    expect(within(sheet).queryByText(/check the amounts against the original/)).toBeNull();
  });

  it('shows the reason a link could not be read, and keeps the paste door open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(
      { error: 'That link has no recipe text on it — only a title. Paste the recipe or its caption instead.' },
      422,
    )));

    const sheet = openImporter();
    fireEvent.click(within(sheet).getByText('From a link'));
    fireEvent.change(within(sheet).getByLabelText('Recipe or video link'), {
      target: { value: 'https://recipes.test/empty' },
    });
    fireEvent.click(within(sheet).getByText('Fetch this recipe'));

    await waitFor(() => expect(within(sheet).getByText(/only a title/)).toBeDefined());
    fireEvent.click(within(sheet).getByText('Paste recipe'));
    expect(within(sheet).getByLabelText('Recipe text')).toBeDefined();
  });

  it('offers the photo door and says how the photo will be read', () => {
    const sheet = openImporter();
    fireEvent.click(within(sheet).getByText('From a photo'));
    expect(within(sheet).getByText('Photograph a recipe')).toBeDefined();
    // jsdom has no TextDetector, so the honest line is the vision one.
    expect(within(sheet).getByText(/no text recogniser/)).toBeDefined();
  });

  it('still parses a pasted recipe with no backend involved at all', () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const sheet = openImporter();
    fireEvent.change(within(sheet).getByLabelText('Recipe text'), {
      target: { value: 'Overnight oats\nServes 2\n80g porridge oats\n250ml semi-skimmed milk' },
    });
    fireEvent.click(within(sheet).getByText('Import recipe'));
    expect(within(sheet).getByText('Overnight oats')).toBeDefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
