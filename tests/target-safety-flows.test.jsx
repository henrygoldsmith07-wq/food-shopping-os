import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { AppProvider, EMPTY_STATE, STORAGE_KEY } from '../src/lib/store.jsx';
import GoalsPanel from '../src/components/GoalsPanel.jsx';
import { RESTRICTIVE_SCREENING } from '../src/lib/target-safety.js';

const seed = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  ...EMPTY_STATE, onboarded: true, ...state,
}));

const openPanel = () => render(<AppProvider><GoalsPanel /></AppProvider>);

/** The card the safety system owns, so assertions cannot drift into another one. */
const safetyCard = () => screen.getByText('How this target was checked').closest('div').parentElement;

const answerScreening = (answer) => {
  const card = safetyCard();
  RESTRICTIVE_SCREENING.forEach(({ question }) => {
    const row = within(card).getByText(question).parentElement;
    fireEvent.click(within(row).getByText(answer));
  });
};

const ADULT = { sex: 'male', age: 34, heightCm: 178, weightKg: 82, activity: 'moderate' };

describe('the calorie target on screen', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('says what is missing instead of showing a number as yours', () => {
    seed({ goal: 'maintain', body: { ...EMPTY_STATE.body, age: null } });
    openPanel();
    expect(screen.getByText('No calorie target yet')).toBeTruthy();
    expect(within(safetyCard()).getByText(/Still needed:.*your age/)).toBeTruthy();
    expect(screen.getByText(/General reference figures, not yours/)).toBeTruthy();
  });

  it('shows a band rather than a figure to the calorie', () => {
    seed({ goal: 'maintain', body: ADULT });
    openPanel();
    // Mifflin-St Jeor × moderate = 2,740 kcal, so the band is 2,475–3,025.
    expect(within(safetyCard()).getByText(/2,475–3,025/)).toBeTruthy();
    expect(within(safetyCard()).getByText(/within about 10%/)).toBeTruthy();
  });

  it('screens, then waits to be confirmed, before a deficit is in force', () => {
    seed({ goal: 'lose', body: ADULT });
    openPanel();
    expect(screen.getByText(/Chosen, but not in force/)).toBeTruthy();
    expect(within(safetyCard()).getByText(RESTRICTIVE_SCREENING[0].question)).toBeTruthy();

    answerScreening('No');
    const confirm = screen.getByText('I have read this and want this target');
    expect(within(safetyCard()).getByText(/Until then Forq plans at 2,740/)).toBeTruthy();

    fireEvent.click(confirm);
    expect(screen.getByText(/You confirmed this target/)).toBeTruthy();
    expect(screen.queryByText(/Chosen, but not in force/)).toBeNull();
    expect(screen.getByDisplayValue('2192')).toBeTruthy(); // 2,740 × 0.8
  });

  it('will not take a yes for an answer, and names who can help', () => {
    seed({ goal: 'lose', body: ADULT });
    openPanel();
    answerScreening('Yes');
    expect(within(safetyCard()).getAllByText(/0808 801 0677/).length).toBeGreaterThan(0);
    expect(screen.queryByText('I have read this and want this target')).toBeNull();
    expect(screen.getByText(/Chosen, but not in force/)).toBeTruthy();
  });
});
