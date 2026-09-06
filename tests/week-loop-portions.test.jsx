import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import WeekLoopPlan from '../src/components/WeekLoopPlan.jsx';

/**
 * The week loop's Portions step: what was learned must be visible, and the
 * household must be able to override it — with the step saying which is
 * which, never silently scaling or silently ignoring the learning.
 */
const DAY = '2026-07-28';

const seed = (extra = {}) => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  onboarded: true, name: 'Sam', day: DAY, household: 2, portionsOverride: 'auto',
  ...extra,
}));

const renderStep = () => render(
  <AppProvider>
    <WeekLoopPlan
      app={null}
      byId={new Map()}
      dates={[DAY]}
      dayShort={() => 'Tue'}
      dinnerRecipes={[]}
      expiringNames={[]}
      generateList={() => {}}
      pantry={{}}
      pickerDate={DAY}
      setDinner={() => {}}
      setPickerDate={() => {}}
      snap={{ stats: { meals: 0 }, leftovers: [] }}
      stepId="portions"
      usesExpiring={() => false}
      variety={{ repeatedDishes: [] }}
      weekList={[]}
      portionSource={{
        portions: 3, source: 'learned', configured: 2, override: 'auto',
        evidence: { observations: 4, typical: 3 }, autoPortions: 3, autoLearned: true,
      }}
    />
  </AppProvider>,
);

describe('the week loop portions step', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows what was learned and where it came from when automatic is winning', () => {
    renderStep();
    expect(document.body.textContent).toMatch(/Automatic — currently 3 portions/);
    expect(document.body.textContent).toMatch(/4 recorded cooks averaging 3/);
    expect(document.body.textContent).toMatch(/profile says 2/);
  });

  it('stepping the number overrides the learned appetite, with a way back', () => {
    seed({ householdPreferences: { portions: { typical: 3, observations: 4 } } });
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.portionsOverride).toBe(4);
  });

  it('an explicit override says it is set by you and offers the way back', () => {
    render(
      <AppProvider>
        <WeekLoopPlan
          app={null}
          byId={new Map()}
          dates={[DAY]}
          dayShort={() => 'Tue'}
          dinnerRecipes={[]}
          expiringNames={[]}
          generateList={() => {}}
          pantry={{}}
          pickerDate={DAY}
          setDinner={() => {}}
          setPickerDate={() => {}}
          snap={{ stats: { meals: 0 }, leftovers: [] }}
          stepId="portions"
          usesExpiring={() => false}
          variety={{ repeatedDishes: [] }}
          weekList={[]}
          portionSource={{
            portions: 5, source: 'configured', configured: 2, override: 5,
            evidence: { observations: 4, typical: 3 }, autoPortions: 3, autoLearned: true,
          }}
        />
      </AppProvider>,
    );
    expect(document.body.textContent).toMatch(/5 portions a meal — set by you/);
    expect(document.body.textContent).toMatch(/Automatic would be 3 — 4 recorded cooks average 3/);
    fireEvent.click(screen.getByRole('button', { name: 'Back to automatic' }));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.portionsOverride).toBe('auto');
  });
});
