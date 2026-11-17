import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import { addDays, dayStamp } from '../src/lib/kitchen-dates.js';

// Boot rolls a stored `day` to the real clock; the dashboards use 30-day and
// month/year windows, so every fixture date must move with it.
const TODAY = dayStamp();

const savedState = {
  onboarded: true,
  name: 'Sam',
  day: TODAY,
  enabledTools: ['carbon', 'reports'],
  shops: [
    { id: 's1', date: addDays(TODAY, -26), store: 'Tesco', total: 20, saved: 2, items: [{ name: 'Milk', price: 2 }] },
    { id: 's2', date: addDays(TODAY, -18), store: 'Tesco', total: 30, saved: 1, items: [{ name: 'Milk', price: 2.1 }] },
  ],
  pantry: [
    { id: 'p1', name: 'Milk', cost: 2, location: 'Fridge', cat: 'Dairy', expiry: addDays(TODAY, 1), low: true },
  ],
  waste: [{ name: 'Spinach', cost: 2, date: addDays(TODAY, -16) }],
  log: {
    [TODAY]: [{
      id: 'e1',
      // Hydration keeps only diary entries that point at a catalogue food — a
      // record without `foodId` is dropped before any dashboard sees it.
      foodId: 'greek-yogurt',
      name: 'Yoghurt',
      brand: 'Fage',
      grams: 100,
      per100: { kcal: 600, protein: 30, carbs: 40, fat: 20, fibre: 5 },
      meal: 'lunch',
      time: '12:00',
    }],
  },
};

describe('analytics dashboards', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('opens every dashboard and calendar report from Guidance', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));

    const analytics = screen.getByRole('dialog', { name: 'Guidance' });
    fireEvent.click(within(analytics).getByText('Review'));
    expect(await within(analytics).findByText('Spending dashboard')).toBeDefined();
    expect(within(analytics).getAllByText('£50.00').length).toBeGreaterThan(0);

    fireEvent.click(within(analytics).getByText('Nutrition'));
    expect(within(analytics).getByText('Nutrition dashboard')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Pantry'));
    expect(within(analytics).getByText('Pantry dashboard')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Waste'));
    expect(within(analytics).getByText('Waste dashboard')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Habits'));
    expect(within(analytics).getByText('Shopping habits')).toBeDefined();
    expect(within(analytics).getByText('Fage')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Measurement'));
    expect(within(analytics).getByText('Household outcome measurement')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Impact'));
    expect(within(analytics).getByText('Carbon footprint')).toBeDefined();

    fireEvent.click(within(analytics).getByText('Reports'));
    expect(within(analytics).getByText('Monthly report')).toBeDefined();
    fireEvent.click(within(analytics).getByText('Year'));
    expect(within(analytics).getByText('Yearly report')).toBeDefined();
  });
});
