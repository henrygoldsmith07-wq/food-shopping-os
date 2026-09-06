import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import { addDays, dayStamp, weekDates } from '../src/lib/kitchen-dates.js';
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

  it('a tap on a risk row hands the item to the planner', () => {
    const onPlanItem = vi.fn();
    render(
      <AppProvider>
        <PantryIntelligenceCard onPlanItem={onPlanItem} />
      </AppProvider>,
    );
    // Each row is its own action: plan a meal around that exact item.
    fireEvent.click(screen.getByRole('button', { name: 'Plan a meal using Spinach' }));
    expect(onPlanItem).toHaveBeenCalledTimes(1);
    expect(onPlanItem).toHaveBeenCalledWith('Spinach');
  });

  it('a row also offers tonight, carrying the intent to the planner', () => {
    const onPlanItem = vi.fn();
    render(
      <AppProvider>
        <PantryIntelligenceCard onPlanItem={onPlanItem} />
      </AppProvider>,
    );
    // The second affordance skips the generator and asks for tonight's slot,
    // so the intent reaches the planner alongside the item.
    fireEvent.click(screen.getByRole('button', { name: 'Cook Spinach tonight' }));
    expect(onPlanItem).toHaveBeenCalledTimes(1);
    expect(onPlanItem).toHaveBeenCalledWith('Spinach', 'tonight');
    // The week-plan affordance is untouched beside it.
    expect(screen.getByRole('button', { name: 'Plan a meal using Spinach' })).toBeDefined();
  });
});

describe('the covered-by-the-plan line on the pantry card', () => {
  // The store rolls any seeded day forward to the real clock, so the plan's
  // meal dates must be the current real week for the coverage to resolve.
  const seedCoveredHousehold = () => {
    const [sat, sun] = [weekDates()[5], weekDates()[6]];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: dayStamp(),
      // 300 g expiring on the plan's last day, fully used by two curries
      // (150 g each); the rice sits far outside the expiry horizon.
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

  it('shows a near-expiry item the plan uses as covered, not as a silent absence', () => {
    renderCard();
    // No warning fires — the plan already handles the spinach — yet the item
    // does not read as ignored: the card names it as covered instead.
    expect(screen.queryByText('Likely to go unused')).toBeNull();
    expect(screen.getByText('Covered by the plan')).toBeDefined();
    expect(screen.getByText((_, el) => el?.textContent === 'Spinach · 300 g — used by 2 planned meals before its date')).toBeDefined();
  });
});
