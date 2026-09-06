import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import { addDays, dayStamp, weekDates } from '../src/lib/kitchen-dates.js';
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

describe('the prediction block respects the plan', () => {
  // The store rolls any seeded day forward to the real clock at boot, so the
  // week's plan dates must be the *current* real week or the meals resolve to
  // nothing. The sibling journeys date their pantry in the past and still flag;
  // here the coverage question depends on the meal dates landing inside the
  // week derive actually plans against.
  const seedCoveredHousehold = () => {
    const [sat, sun] = [weekDates()[5], weekDates()[6]];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: dayStamp(),
      // 300 g spinach expiring on the plan's last day, fully covered by two
      // chickpea curries (150 g each); the rice is far outside the horizon.
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '300 g', location: 'Fridge', expiry: sun },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: addDays(sun, 60) },
      ],
      plan: {
        [sat]: { dinner: 'chickpea-curry' },
        [sun]: { dinner: 'chickpea-curry' },
      },
    }));
  };

  beforeEach(() => {
    localStorage.clear();
    seedCoveredHousehold();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('stays quiet when the week plan already uses the expiring stock', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Check pantry before buying/ }));
    const sheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Smart pantry');
    expect(sheet).toBeDefined();

    // The spinach is genuinely on the shelf and near its date — the plan is
    // what keeps it out of the prediction, not missing evidence: the block
    // heading, its count pill, and the row's advice are all absent.
    expect(within(sheet).queryByText('Likely to go unused')).toBeNull();
    expect(within(sheet).queryByText(/Plan a meal using Spinach/)).toBeNull();
    expect(within(sheet).queryByText(/ingredient may go unused/)).toBeNull();
    // Seen-but-covered reads as covered, not ignored: the same spinach the
    // plan saves is named on the card's positive line.
    expect(within(sheet).getByText('Covered by the plan')).toBeDefined();
    expect(within(sheet).getByText((_, el) => el?.textContent === 'Spinach · 300 g — used by 2 planned meals before its date')).toBeDefined();
  });
});

describe('the prediction block names partial coverage', () => {
  // The sibling of the quiet journey: a plan that only half-uses the expiring
  // item must still surface it — the sheet says what remains and why, instead
  // of letting the covered line claim the item is handled.
  const seedHalfCoveredHousehold = () => {
    const [sat, sun] = [weekDates()[5], weekDates()[6]];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: dayStamp(),
      // 400 g expiring on the plan's last day against 300 g planned: 100 g is
      // left over even though the plan genuinely uses the item.
      pantry: [
        { id: 'p1', name: 'Spinach', qty: '400 g', location: 'Fridge', expiry: sun },
        { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: addDays(sun, 60) },
      ],
      plan: {
        [sat]: { dinner: 'chickpea-curry' },
        [sun]: { dinner: 'chickpea-curry' },
      },
    }));
  };

  beforeEach(() => {
    localStorage.clear();
    seedHalfCoveredHousehold();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('flags the leftover with its partly-covered reason, not silence', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Check pantry before buying/ }));
    const sheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.querySelector('h2')?.textContent === 'Smart pantry');
    expect(sheet).toBeDefined();

    // The item is still on the warning list — coverage was only partial.
    expect(within(sheet).getByText('Likely to go unused')).toBeDefined();
    expect(within(sheet).getByText(/1 ingredient may go unused/)).toBeDefined();
    // Only the remainder is at risk, and the row says so by quantity…
    expect(within(sheet).getByText((_, el) => el?.textContent === 'Spinach · 100 g')).toBeDefined();
    // …and by cause: the plan used some of it — what is left is the rest.
    expect(within(sheet).getByText('No planned meal uses all of this dated stock.')).toBeDefined();
    // It must not simultaneously read as fully covered.
    expect(within(sheet).queryByText('Covered by the plan')).toBeNull();
  });
});
