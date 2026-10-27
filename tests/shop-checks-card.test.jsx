import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import ShopChecks from '../src/components/ShopChecks.jsx';

const DAY = '2026-10-27';
const seeded = {
  onboarded: true,
  name: 'Sam',
  day: DAY,
  shoppingList: [
    { id: 'l1', name: 'Couscous', aisle: 'Cupboard', price: 0, qty: '300 g', requiredQty: '300 g', checked: false },
    { id: 'l2', name: 'Olive oil', aisle: 'Cupboard', price: 0, qty: '1 bottle', checked: false },
    { id: 'l3', name: 'Lemons', aisle: 'Fruit & veg', price: 0, qty: '2', checked: false },
  ],
  pantry: [
    { id: 'p1', name: 'Couscous', qty: '1 box', cat: 'Cupboard', confidence: 'definite', lastConfirmedAt: DAY },
    { id: 'p2', name: 'Olive oil', qty: '', cat: 'Cupboard', confidence: 'definite', lastConfirmedAt: DAY, low: true },
  ],
};

function Probe({ onApp }) {
  const app = useApp();
  onApp(app);
  return <ShopChecks app={app} />;
}

describe('Check before you shop card', () => {
  let snap;
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    render(<AppProvider><Probe onApp={(app) => { snap = app; }} /></AppProvider>);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('lists only the rows the pantry might cover, with the reason', () => {
    expect(screen.getByText('Check before you shop · 2')).toBeDefined();
    expect(screen.getByText('Pantry has 1 box; the plan needs 300 g')).toBeDefined();
    expect(screen.getByText('Olive oil is marked running low')).toBeDefined();
    expect(screen.queryByText(/Lemons/)).toBeNull();
  });

  it('"Got enough" takes couscous off the list and confirms it in the pantry', () => {
    fireEvent.click(screen.getByRole('button', { name: /Got enough Couscous/ }));
    expect(snap.shoppingList.map((r) => r.name)).toEqual(['Olive oil', 'Lemons']);
    expect(snap.pantry.find((p) => p.id === 'p1')).toMatchObject({ confidence: 'definite', confirmationSource: 'shop-check' });
    expect(screen.getByText('Check before you shop · 1')).toBeDefined();
  });

  it('"Buy it" keeps the row and the card stops asking about it', () => {
    fireEvent.click(screen.getByRole('button', { name: /Buy Olive oil/ }));
    expect(snap.shoppingList.find((r) => r.id === 'l2').shopCheck).toBe('buy');
    expect(snap.pantry.find((p) => p.id === 'p2').low).toBe(true);
    expect(screen.queryByText('Olive oil is marked running low')).toBeNull();
  });
});
