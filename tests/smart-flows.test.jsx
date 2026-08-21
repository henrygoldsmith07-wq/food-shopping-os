import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const state = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  weeklyBudget: 50,
  shops: [
    { id: 's1', date: '2026-07-07', store: 'Tesco', total: 45, items: [{ name: 'Milk', price: 2 }] },
    { id: 's2', date: '2026-07-14', store: 'Tesco', total: 48, items: [{ name: 'Milk', price: 2.1 }] },
    { id: 's3', date: '2026-07-21', store: 'Tesco', total: 50, items: [{ name: 'Milk', price: 2.2 }] },
    { id: 's4', date: '2026-07-28', store: 'Tesco', total: 60, items: [{ name: 'Bread', price: 1.5 }] },
  ],
  pantry: [{ id: 'p1', name: 'Eggs', low: true, cost: 2, location: 'Fridge', cat: 'Dairy' }],
};

describe('Smart Features centre', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows evidence-backed predictions and adds its generated list', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));

    const dialog = screen.getByRole('dialog', { name: 'Guidance' });
    fireEvent.click(within(dialog).getByText('Tools'));
    expect(await within(dialog).findByText('Next shopping trip')).toBeDefined();
    expect(within(dialog).getByText(/4 recorded shopping days/)).toBeDefined();
    expect(within(dialog).getByText('Budget overrun')).toBeDefined();
    expect(within(dialog).getByText(/Milk/)).toBeDefined();
    expect(within(dialog).getByText(/Foreground location reminder/)).toBeDefined();

    fireEvent.click(within(dialog).getByText(/Add 2 items to shopping/));
    fireEvent.click(within(dialog).getByText('Review shopping list'));
    expect(screen.getByLabelText('Tick Eggs')).toBeDefined();
    expect(screen.getByLabelText('Tick Milk')).toBeDefined();
  });

  it('opens the voice-enabled assistant inside Guidance with a typed fallback', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));
    const guidance = screen.getByRole('dialog', { name: 'Guidance' });
    fireEvent.click(within(guidance).getByText('Tools'));
    fireEvent.click(await within(guidance).findByText('Open'));

    expect((await within(guidance).findByLabelText('Ask by voice')).disabled).toBe(true);
    expect(within(guidance).getByLabelText('Ask Guidance')).toBeDefined();
  });
});
