import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import PantryIntelligenceCard from '../src/components/PantryIntelligenceCard.jsx';

/**
 * The "Likely to go unused" block on the pantry intelligence card, driven by
 * the real derive chain: the store computes wastePrediction from the seeded
 * pantry, and the card renders it honestly — item, quantity, risk, and the
 * concrete action — or stays out of the way when nothing is at risk.
 */
const DAY = '2026-07-28';

const seededPantry = [
  // Four days past-free horizon from `day` — inside the 7-day expiry window,
  // with no planned meal using it, so the predictor flags it.
  { id: 'p1', name: 'Spinach', qty: '200 g', location: 'Fridge', expiry: '2026-08-01' },
  // Long-dated stock is never a spoilage risk.
  { id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: '2027-01-01' },
];

const renderCard = () => render(
  <AppProvider>
    <PantryIntelligenceCard />
  </AppProvider>,
);

describe('the likely-to-go-unused block on the pantry card', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({
    onboarded: true,
    name: 'Sam',
    day: DAY,
    pantry: seededPantry,
  })));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the prediction with quantity, risk, and its concrete action', () => {
    renderCard();
    expect(screen.getByText('Likely to go unused')).toBeDefined();
    // "Name · qty" is split across elements in the row — match the row text.
    expect(screen.getByText((_, el) => el?.textContent === 'Spinach · 200 g')).toBeDefined();
    // Dated stock inside the horizon with no planned use reads as high risk.
    expect(screen.getByText('High risk')).toBeDefined();
    expect(screen.getByText(/Plan a meal using Spinach before 2026-08-01/)).toBeDefined();
    expect(screen.getByText(/1 ingredient may go unused/)).toBeDefined();
  });

  it('shows no block when nothing is predicted to go unused', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: DAY,
      pantry: [{ id: 'p2', name: 'Rice', qty: '1 kg', location: 'Cupboard', expiry: '2027-01-01' }],
    }));
    renderCard();
    expect(screen.getByText('Pantry intelligence')).toBeDefined(); // the card itself is there
    expect(screen.queryByText('Likely to go unused')).toBeNull();
  });
});
