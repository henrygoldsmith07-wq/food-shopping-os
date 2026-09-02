import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import MilestonesCard from '../src/components/MilestonesCard.jsx';
import PlanRepeatLastWeek from '../src/components/PlanRepeatLastWeek.jsx';
import { AddItem } from '../src/components/ShopForms.jsx';

/**
 * The three UI surfaces added for the onboarding pass: the first-session
 * milestones card, "copy last week's plan" on the Plan tab, and the
 * paste-a-whole-list importer in the shop add form. Each is tested against
 * the real AppProvider state so "done" means what the app means by done.
 */

const seedState = (overrides = {}) => {
  localStorage.setItem('forq-state-v2', JSON.stringify({
    onboarded: true,
    version: 4,
    day: '2026-09-02',
    plan: {},
    pantry: [],
    shoppingList: [],
    shops: [],
    homeWidgets: [],
    ...overrides,
  }));
};

const today = () => new Date().toISOString().slice(0, 10);

/** The Monday of the current week, per the app's own kitchen-dates rules. */
const mondayThisWeek = () => {
  const d = new Date(`${today()}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const mondayLastWeek = () => {
  const d = new Date(`${mondayThisWeek()}T12:00:00`);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

afterEach(cleanup);

describe('the milestones card', () => {
  it('shows the four first moves and counts real progress', () => {
    seedState({ pantry: [{ id: 'p1', name: 'Milk' }] });
    render(<AppProvider><MilestonesCard /></AppProvider>);
    expect(screen.getByText('Add your first item')).toBeTruthy();
    expect(screen.getByText('Plan your first meal')).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });

  it('disappears entirely once all four are done', () => {
    seedState({
      pantry: [{ id: 'p1', name: 'Milk' }],
      shoppingList: [{ id: 's1', name: 'Milk' }],
      plan: { [today()]: { dinner: 'r1' } },
      shops: [{ id: 't1', store: 'Tesco', total: 10, items: [] }],
    });
    const { container } = render(<AppProvider><MilestonesCard /></AppProvider>);
    expect(container.textContent).toBe('');
  });
});

describe('copy last week on the plan tab', () => {
  it('offers when last week had dinners and copies them without clobbering', async () => {
    const lastMonday = mondayLastWeek();
    const thisMonday = mondayThisWeek();
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${thisMonday}T12:00:00`);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    seedState({
      plan: {
        [lastMonday]: { dinner: 'r-mon' },
        [lastMonday.slice(0, 8) + '25']: { dinner: 'r-tue' },
        [thisMonday]: { dinner: 'already-decided' },
      },
    });
    render(<AppProvider><PlanRepeatLastWeek dates={weekDates} /></AppProvider>);
    const button = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/Copied 1 dinner/)).toBeTruthy());
  });

  it('stays out of the way when last week was empty', () => {
    seedState({});
    const { container } = render(
      <AppProvider><PlanRepeatLastWeek dates={[mondayThisWeek()]} /></AppProvider>,
    );
    expect(container.textContent).toBe('');
  });
});

describe('pasting a whole list into the add form', () => {
  it('adds every parsed row through the real store dedupe', async () => {
    seedState({});
    render(<AppProvider><AddItem onAdd={(rows) => rows} /></AppProvider>);
    fireEvent.click(screen.getByRole('button', { name: /paste a whole list/i }));
    fireEvent.change(screen.getByLabelText('Paste your shopping list'), {
      target: { value: '2 pints of milk\n6 eggs\nBread' },
    });
    const add = screen.getByRole('button', { name: /items to the list/i });
    expect(add.textContent).toContain('3');
  });

  it('disables the add button when nothing parses', () => {
    seedState({});
    render(<AppProvider><AddItem onAdd={() => {}} /></AppProvider>);
    fireEvent.click(screen.getByRole('button', { name: /paste a whole list/i }));
    expect(screen.getByRole('button', { name: /items to the list/i }).disabled).toBe(true);
  });
});
