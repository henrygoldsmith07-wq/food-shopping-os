import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WasteCauseCard from '../src/components/WasteCauseCard.jsx';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

/**
 * The pantry waste card names a cause next to every count — and with a skip
 * reason on the missed-meal cards, the "why" behind the misses should say
 * the same thing the review does: the dominant recorded reason, by week.
 *
 * Hydration rolls any stored `day` forward to the real clock, so fixtures
 * build their dates relative to today instead of pinning a past week.
 */
const dayKey = (offset = 0) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const TODAY = dayKey(0);

const seeded = {
  onboarded: true,
  name: 'Sam',
  day: TODAY,
  // A binned item so the card renders at all; the reason line reads events.
  waste: [{ id: 'w1', name: 'Milk', cat: 'Fridge', cost: 0.9, date: dayKey(-1) }],
  mealPlanEvents: [
    { id: 'm1', date: dayKey(-6), slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
    { id: 'm2', date: dayKey(-4), slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'no-time' },
  ],
};

const renderCard = () => render(
  <AppProvider>
    <WasteCauseCard />
  </AppProvider>,
);

describe('the waste cause card names the reason behind the misses', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows the dominant recorded reason next to the never-cooked count', () => {
    renderCard();
    expect(screen.getByText('Your waste, by cause')).toBeDefined();
    expect(screen.getByText('Never cooked')).toBeDefined();
    // The same story the missed-meal review cards tell: No time, twice.
    expect(document.body.textContent).toMatch(/Last week's misses were mostly\s*No time\s*\(2×\)/);
  });

  it("stays quiet about a reason when last week's misses never recorded one", () => {
    cleanup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      mealPlanEvents: [
        { id: 'm3', date: dayKey(-5), slot: 'dinner', plannedRecipeId: 'r1', status: 'skipped', reason: 'missed', missed: true },
        { id: 'm4', date: dayKey(-3), slot: 'dinner', plannedRecipeId: 'r1', status: 'substituted' },
      ],
    }));
    renderCard();
    expect(screen.getByText('Your waste, by cause')).toBeDefined();
    expect(screen.queryByText(/Last week's misses were mostly/)).toBeNull();
    // The silent line still owns that story — no recorded cause, nothing claimed.
    expect(document.body.textContent).toMatch(/slipped by with nothing recorded/);
  });
});
