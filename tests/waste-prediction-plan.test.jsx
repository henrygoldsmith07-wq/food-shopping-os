import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
// Full-app journeys cross the 5s default under batch load; a real hang still
// blows well past this ceiling.
vi.setConfig({ testTimeout: 15_000 });

/**
 * The prediction row's advice, wired: a returning household whose pantry flags
 * an item as likely to go unused taps the row and lands on the plan generator
 * already focused on that item, so the generator favours dishes that use it.
 */
const DAY = '2026-07-28';

const seedReturningUser = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  onboarded: true,
  name: 'Sam',
  day: DAY,
  // Dated stock inside the 7-day expiry window with no planned meal using it —
  // the predictor flags it; the long-dated stock stays out of the block.
  pantry: [
    { id: 'p1', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: '2026-08-01' },
    { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: '2027-01-01' },
  ],
}));

describe('the prediction row routes to the planner', () => {
  beforeEach(() => {
    localStorage.clear();
    seedReturningUser();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('a tap plans a meal around the at-risk item', async () => {
    render(<App />);
    // Returning users land on the shopping list; the dashboard holds the pantry.
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    fireEvent.click(screen.getByText('Open pantry →'));
    const sheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Smart pantry');
    expect(within(sheet).getByText('Likely to go unused')).toBeDefined();

    // The row itself is the action.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Plan a meal using Spinach' }));

    // The planner opened with the generator already shown and the item focused.
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    expect(within(nav).getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Close generator' })).toBeDefined();
    expect(screen.getByText(/Spinach — use soon; the generator will favour dishes that use them/)).toBeDefined();
    // The pantry sheet slides away (its DOM lingers for the exit animation).
    await waitFor(() => expect(screen.queryByText('Smart pantry')).toBeNull());
    // The focus is a guarantee, not a wish: generating pins a spinach dish
    // into the week and says so by name.
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
    await waitFor(() => expect(screen.getByText(/is pinned in — it uses Spinach before it goes off/)).toBeDefined());

  });
});

describe('the prediction block in the app shell', () => {
  beforeEach(() => {
    localStorage.clear();
    seedReturningUser();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('opens the Smart pantry sheet from the Shop tab and shows the block', () => {
    render(<App />);
    // Returning users land on the shopping list — no navigation needed.
    expect(within(document.querySelector('nav[aria-label="Main navigation"]')).getByRole('button', { name: 'List' }).getAttribute('aria-current')).toBe('page');

    // The list view's basket offers the pantry before buying.
    fireEvent.click(screen.getByRole('button', { name: /Check pantry before buying/ }));
    const sheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Smart pantry');
    expect(sheet).toBeDefined();

    // The prediction block renders through the real derive chain: heading,
    // the at-risk row with its quantity, the risk band, and the concrete action.
    expect(within(sheet).getByText('Likely to go unused')).toBeDefined();
    expect(within(sheet).getByText((_, el) => el?.textContent === 'Spinach · 200 g')).toBeDefined();
    expect(within(sheet).getByText('High risk')).toBeDefined();
    expect(within(sheet).getByText(/Plan a meal using Spinach before 2026-08-01/)).toBeDefined();
    expect(within(sheet).getByText(/1 ingredient may go unused/)).toBeDefined();
  });
});

describe('the prediction row can open tonight\'s picker', () => {
  beforeEach(() => {
    localStorage.clear();
    seedReturningUser();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('skips the generator and opens tonight\'s dinner picker pre-searched on the item', async () => {
    render(<App />);
    // Returning users land on the list; the basket opens the same sheet.
    fireEvent.click(screen.getByRole('button', { name: /Check pantry before buying/ }));
    const sheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Smart pantry');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cook Spinach tonight' }));

    // The planner opened on tonight's picker, not the generator.
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    expect(within(nav).getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Plan a meal');
    expect(dialog).toBeDefined();
    expect(screen.queryByText('Close generator')).toBeNull();

    // The ingredient arrived pre-searched: only spinach dishes are listed.
    const search = within(dialog).getByLabelText('Search recipes');
    expect(search.value).toBe('Spinach');
    const dish = within(dialog).getByRole('button', { name: /Coconut Chickpea Curry/ });
    fireEvent.click(dish);

    // Picking put it in tonight's dinner slot and closed the sheet.
    await waitFor(() => expect(within(dialog).queryByText('Coconut Chickpea Curry')).toBeNull());
    expect(screen.getAllByText('Coconut Chickpea Curry').length).toBeGreaterThan(0);
  });
});
