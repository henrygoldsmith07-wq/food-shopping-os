import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HomeTab from '../src/components/HomeTab.jsx';

afterEach(() => cleanup());

vi.mock('../src/lib/store.jsx', () => ({
  useApp: () => ({
    day: '2026-09-01',
    plan: { '2026-09-01': { dinner: 'chicken-traybake' } },
    pantry: [{ id: 'p1', name: 'Rice', expiry: '2026-09-02', emoji: '🍚' }],
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
    weekRecovery: { explanations: ['Week checked — plan, list, leftovers and budget still line up.'], expiryPriority: [] },
    closedLoop: { steps: [], pct: 0, next: 'plan' },
    useSoonIngredients: [],
    remindersDue: [],
    starterRecipeIds: [],
    welcomeDismissed: true,
    dismissWelcome: () => {},
  }),
}));

vi.mock('../src/components/GuidancePreview.jsx', () => ({
  default: () => <div />,
}));

vi.mock('../src/components/AutopilotCard.jsx', () => ({
  default: () => <section aria-label="best next action">Best next action</section>,
}));
vi.mock('../src/components/HomeFoodLoop.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/LoopCheck.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/HomeNumbers.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/OutcomeDashboard.jsx', () => ({ default: () => <div /> }));

describe('home: plan → shop → eat', () => {
  const props = { openRecipe: () => {}, openPantry: () => {}, openGuidance: () => {}, goTab: () => {}, goLog: () => {} };

  it('leads with the best next action, tonight, buy/use soon and outlook', () => {
    render(<HomeTab {...props} />);
    expect(screen.getByLabelText('best next action')).toBeTruthy();
    expect(screen.getByLabelText('Plan, shop, eat')).toBeTruthy();
    expect(screen.getByLabelText("Tonight's meal")).toBeTruthy();
    expect(screen.getByLabelText('Items to buy or use soon')).toBeTruthy();
    expect(screen.getByLabelText('Weekly outlook')).toBeTruthy();
  });

  it('keeps plan/shop/eat one tap away', () => {
    render(<HomeTab {...props} />);
    expect(screen.getByLabelText(/Plan —/)).toBeTruthy();
    expect(screen.getByLabelText(/Shop —/)).toBeTruthy();
    expect(screen.getByLabelText(/Eat —/)).toBeTruthy();
  });

  it('shows no flashcards and no debate content', () => {
    const { container } = render(<HomeTab {...props} />);
    expect(container.textContent).not.toMatch(/Flashcards|Argument graph|verdict/i);
  });

  it('keeps the pantry one tap away', () => {
    render(<HomeTab {...props} />);
    expect(screen.getByText('Open pantry →')).toBeTruthy();
  });
});
