import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HomeTab from '../src/components/HomeTab.jsx';

const mockApp = vi.hoisted(() => ({
  day: '2026-09-01',
  plan: { '2026-09-01': { dinner: 'chicken-traybake' } },
  pantry: [{ id: 'p1', name: 'Rice', expiry: '2026-09-02' }],
  shoppingList: [{ id: 's1', name: 'Milk', checked: false }],
  shops: [],
  cooked: [],
  waste: [],
  members: [],
  diets: [],
  prefs: { diets: [] },
  safeRecipes: [],
  tasteProfile: { rated: 0 },
  portions: 2,
  weeklyBudget: 60,
  spentThisWeek: 10,
  calendarBusy: [],
  tonightDecision: { pick: null, ranked: [], confidence: 'none', reasons: [] },
  weekRecovery: {
    today: '2026-09-01',
    trigger: { kind: 'MealSkipped', date: '2026-09-01', slot: 'dinner', recipeId: 'chicken-traybake' },
    repairs: [{ kind: 'pantry-swap', date: '2026-09-01', slot: 'dinner', recipeName: 'Rice and beans', disruption: 1 }],
    planPatch: { '2026-09-01': { dinner: 'rice-and-beans' } },
    shoppingAdd: [{ name: 'Pasta', reason: 'Needed' }],
    shoppingRemove: [],
    leftoverReuse: [],
    budgetNote: { budget: 60, spent: 10, listTotal: 1, remaining: 49, over: false, removalSavings: 0 },
    expiryPriority: [],
    explanations: ['Rice and beans is already covered by your pantry — suggested for dinner on 2026-09-01.'],
    needsShop: true,
    disruption: 1,
  },
  closedLoop: { steps: [], pct: 0, next: 'plan' },
  useSoonIngredients: [],
  remindersDue: [],
  starterRecipeIds: [],
  welcomeDismissed: true,
  dismissWelcome: () => {},
  applyWeekRecovery: vi.fn(),
  undoLast: vi.fn(() => true),
}));

vi.mock('../src/lib/store.jsx', () => ({ useApp: () => mockApp }));
vi.mock('../src/components/GuidancePreview.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/AutopilotCard.jsx', () => ({ default: () => <section aria-label="best next action">Best next action</section> }));
vi.mock('../src/components/HomeFoodLoop.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/LoopCheck.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/HomeNumbers.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/OutcomeDashboard.jsx', () => ({ default: () => <div /> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Home week recovery preview', () => {
  const props = { openRecipe: () => {}, openPantry: () => {}, openGuidance: () => {}, goTab: () => {}, goLog: () => {} };

  it('shows the trigger, repairs, list impact, and budget in one preview', () => {
    render(<HomeTab {...props} />);
    expect(screen.getByRole('region', { name: 'Week recovery' })).toBeTruthy();
    const preview = screen.getByRole('region', { name: 'Week recovery' });
    expect(within(preview).getByText('A meal was skipped')).toBeTruthy();
    expect(within(preview).getByText(/Rice and beans is already covered/i)).toBeTruthy();
    expect(within(preview).getByText(/1 item to add · 0 to remove/i)).toBeTruthy();
  });

  it('applies all repairs as one command and offers undo', () => {
    render(<HomeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply repairs' }));
    expect(mockApp.applyWeekRecovery).toHaveBeenCalledWith(mockApp.weekRecovery);
    expect(screen.getByText('Week repairs applied.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mockApp.undoLast).toHaveBeenCalled();
    expect(screen.getByText('Week repairs undone.')).toBeTruthy();
  });
});
