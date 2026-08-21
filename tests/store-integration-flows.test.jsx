import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const state = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  shoppingList: [
    { id: 'i1', name: 'Milk', aisle: 'Dairy & eggs', price: 0, checked: false },
    { id: 'i2', name: 'Bread', aisle: 'Bakery', price: 0, checked: false },
  ],
  shops: [
    { id: 's1', date: '2026-07-21', store: 'Tesco', total: 1.55, items: [{ name: 'Milk', price: 1.55 }] },
  ],
  offers: [
    { id: 'o1', label: '50p off milk', match: 'milk', kind: 'money', value: 0.5, store: 'Tesco' },
  ],
};

describe('store integrations', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows supported retailers and keeps price claims on recorded history', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Shop'));
    fireEvent.click(screen.getByText('Stores'));

    expect(screen.getByRole('button', { name: "Sainsbury's" })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Amazon Fresh' })).toBeDefined();
    expect(screen.getByText(/Recorded prices for 1 of 2 items/)).toBeDefined();
    expect(screen.getByText('50p off milk')).toBeDefined();

    const milk = screen.getByText('Milk').closest('[data-retailer-item]');
    expect(within(milk).getByText('£1.55 recorded')).toBeDefined();
    expect(within(milk).getByRole('link', { name: 'Open retailer site' }).href).toContain('tesco.com');
    expect(screen.getByRole('link', { name: 'View Tesco offers' }).href).toContain('tesco.com');
    expect(screen.getByRole('link', { name: 'Shop Tesco delivery' }).href).toContain('tesco.com');
  });

  it('labels retailers without direct full-basket delivery honestly', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Shop'));
    fireEvent.click(screen.getByText('Stores'));
    fireEvent.click(screen.getByRole('button', { name: 'Aldi' }));

    expect(screen.getByText('Browse products · shop in store')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Browse Aldi groceries' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Shop Aldi delivery' })).toBeNull();
  });

});
