import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

  it('leads with the one next action, tonight, and the week status / needs attention pair', () => {
    // One primary next action (lib/next-action.js), tonight's meal, and the
    // Week Manager's third area: one derived week status plus exceptions —
    // the fragmented buy/use-soon and weekly-outlook sections are gone by
    // design; their content surfaces as exceptions or quiet success instead.
    render(<HomeTab {...props} />);
    expect(screen.getByLabelText('best next action')).toBeTruthy();
    expect(screen.getByLabelText("Tonight's meal")).toBeTruthy();
    expect(screen.getByLabelText('Week status')).toBeTruthy();
    expect(screen.getByLabelText('Needs attention')).toBeTruthy();
  });

  it('keeps plan, pantry, shop and cook reachable without competing CTAs', () => {
    // The old three-card shortcut row is gone by design; what must hold is
    // that each core destination stays one tap away through labelled links.
    render(<HomeTab {...props} />);
    expect(screen.getByText('Open pantry →')).toBeTruthy();
    expect(screen.getByText('Open shopping list →')).toBeTruthy();
    // "Full plan" lives once — on the Today’s meals section header.
    expect(screen.getAllByText('Full plan →')).toHaveLength(1);
  });

  it('shows no flashcards and no debate content', () => {
    const { container } = render(<HomeTab {...props} />);
    expect(container.textContent).not.toMatch(/Flashcards|Argument graph|verdict/i);
  });

  it('keeps the pantry one tap away', () => {
    render(<HomeTab {...props} />);
    expect(screen.getByText('Open pantry →')).toBeTruthy();
  });

  it('starts the week loop from the one weekly CTA, instead of a jump to the plan tab', () => {
    // Home owns the entry, App owns the loop: the CTA must hand off to the
    // loop (which plans, shops, eats and reconciles off one list) and must not
    // quietly route the user to the plan tab, and there is only ever one
    // "start the week" button on this screen.
    const onOpenWeekLoop = vi.fn();
    const goTab = vi.fn();
    render(<HomeTab {...props} goTab={goTab} onOpenWeekLoop={onOpenWeekLoop} />);
    fireEvent.click(screen.getByRole('button', { name: /Start the week/i }));
    expect(onOpenWeekLoop).toHaveBeenCalledTimes(1);
    expect(goTab).not.toHaveBeenCalledWith('plan');
    expect(screen.queryByText('Plan the week →')).toBeNull();
  });
});
