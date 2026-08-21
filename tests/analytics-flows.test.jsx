import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const savedState = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  enabledTools: ['carbon', 'reports'],
  shops: [
    { id: 's1', date: '2026-07-02', store: 'Tesco', total: 20, saved: 2, items: [{ name: 'Milk', price: 2 }] },
    { id: 's2', date: '2026-07-10', store: 'Tesco', total: 30, saved: 1, items: [{ name: 'Milk', price: 2.1 }] },
  ],
  pantry: [
    { id: 'p1', name: 'Milk', cost: 2, location: 'Fridge', cat: 'Dairy', expiry: '2026-07-29', low: true },
  ],
  waste: [{ name: 'Spinach', cost: 2, date: '2026-07-12' }],
  log: {
    '2026-07-28': [{
      id: 'e1',
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
