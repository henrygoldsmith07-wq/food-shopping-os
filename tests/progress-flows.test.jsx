import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { weeklyChallenges } from '../src/lib/progress.js';

/** The XP a fresh household earns from its first cook, whatever week it is.
 *  60 for the cook, 4 for the diary entry it logs, plus 40 for every weekly
 *  challenge that a first cook happens to complete — the rotation is picked
 *  by the week itself, so the test reads it rather than guessing at it. */
const xpAfterFirstCook = (state, today) => {
  const challenges = weeklyChallenges(state, today).filter((c) => c.done);
  return 60 + 4 + challenges.reduce((sum, c) => sum + c.xp, 0);
};

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
  fireEvent.click(screen.getByText('Today')); // the list lands first now
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openProgress = () => {
  openProfile();
  const section = screen.getByText('Achievements').closest('section');
  fireEvent.click(within(section).getByText(/Level \d+ · /));
  return dialogFor('Progress');
};

const cookARecipe = (name = 'Coconut Chickpea Curry') => {
  fireEvent.click(screen.getByText('Recipes'));
  fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: name } });
  fireEvent.click(screen.getAllByText(name)[0]);
  fireEvent.click(screen.getByText(/Start cooking mode/));
  while (screen.queryByText(/Next ›/)) fireEvent.click(screen.getByText(/Next ›/));
  fireEvent.click(screen.getByText(/Finish & log meal/));
  fireEvent.click(screen.getByText('Back to my day'));
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('a fresh app has nothing to show off', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('starts at level one with no XP, and doesn’t make a badge of it', () => {
    onboard();
    // Nothing earned yet, so Home shows no level pill at all.
    expect(screen.queryByText(/Level 1 ·/)).toBeNull();

    const sheet = openProgress();
    expect(within(sheet).getByText('Getting started')).toBeDefined();
    expect(within(sheet).getByText('0 XP')).toBeDefined();
    expect(within(sheet).getByText(/160 XP to level 2/)).toBeDefined();
  });

  it('shows today’s goals, all empty', () => {
    onboard();
    // Goals live in Progress now, not on Home — the simplified Home shows
    // the cooking, the Progress sheet shows the counters.
    const sheet = openProgress();
    expect(within(sheet).getByText('Today')).toBeDefined();
    expect(within(sheet).getByText(/0 of 5 done today/)).toBeDefined();
    expect(within(sheet).getByText('Log three meals')).toBeDefined();
  });

  it('has no badges or achievements yet, and says so', () => {
    onboard();
    const sheet = openProgress();
    fireEvent.click(within(sheet).getByText('Earned'));
    expect(within(sheet).getByText(/Badges · 0 of 12/)).toBeDefined();
    expect(within(sheet).getByText(/things that actually happened/)).toBeDefined();
    expect(within(sheet).getByText(/No XP yet/)).toBeDefined();
  });
});

describe('earning it', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('counts a cooked recipe into XP, streaks, goals and achievements', () => {
    onboard();
    cookARecipe();

    // 60 for the cook and 4 for the meal it logged, plus whatever weekly
    // challenges a first cook genuinely completes this week. The rotation
    // is chosen by the week itself, so the expectation is computed from
    // the same metrics the header reads — the test holds for any week.
    const today = new Date().toISOString().slice(0, 10);
    const expectedXp = xpAfterFirstCook({ cooked: [{ recipeId: 'coconut-chickpea-curry', date: today }], log: {}, day: today }, today);
    fireEvent.click(screen.getByText('Today'));
    expect(screen.getByText(new RegExp(`Level 1 · ${expectedXp} XP`))).toBeDefined();

    const sheet = openProgress();
    expect(within(sheet).getByText(`${expectedXp} XP`)).toBeDefined();
    expect(within(sheet).getByText(new RegExp(`${160 - expectedXp} XP to level 2`))).toBeDefined();
    // The cook goal moved: 1 of today's 5 goals is now done.
    expect(within(sheet).getByText(/1 of 5 done today/)).toBeDefined();

    fireEvent.click(within(sheet).getByText('Earned'));
    expect(within(sheet).getByText('First thing cooked')).toBeDefined();
    expect(within(sheet).getByText('Coconut Chickpea Curry')).toBeDefined();
    expect(within(sheet).getByText(/Recipes cooked/)).toBeDefined();
    expect(within(sheet).getByText('1 × 60 = 60 XP')).toBeDefined();
    // Which badge the first cook lights up depends on the week's rotation;
    // First Flame (first cook streak) is earned either way on a first cook.
    expect(within(sheet).getByText(/Badges · 1 of 12/)).toBeDefined();
  });

  it('moves a weekly challenge on, and keeps the same challenges all week', () => {
    onboard();
    const before = openProgress();
    fireEvent.click(within(before).getByText('This week'));
    const ids = within(before).getAllByText(/\d\/\d/).map((n) => n.textContent);
    fireEvent.click(within(before).getByLabelText('Close'));

    cookARecipe();

    const after = openProgress();
    fireEvent.click(within(after).getByText('This week'));
    const now = within(after).getAllByText(/\d\/\d/).map((n) => n.textContent);
    expect(now).not.toEqual(ids); // something moved
    expect(now).toHaveLength(ids.length); // but the set is the same size, same week
  });

  it('runs a seasonal event tied to the real month', () => {
    onboard();
    const sheet = openProgress();
    fireEvent.click(within(sheet).getByText('This week'));
    expect(within(sheet).getByText(/Seasonal ·/)).toBeDefined();
  });

  it('takes the XP back if you take the thing back', () => {
    onboard();
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Plan'));
    fireEvent.click(screen.getAllByText('+ Dinner')[0]);
    fireEvent.click(within(dialogFor('Plan a meal')).getByText('Coconut Chickpea Curry'));
    // The planner marks today's column, so the tab label is not the only match.
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(screen.getByText(/Level 1 · 2 XP/)).toBeDefined(); // a planned meal is worth 2

    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Plan'));
    fireEvent.click(screen.getAllByText('Coconut Chickpea Curry')[0]);
    fireEvent.click(within(dialogFor('Plan a meal')).getByText(/Clear this slot/));
    fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
    expect(screen.queryByText(/Level 1 ·/)).toBeNull(); // back to nothing earned
  });
});

describe('rewards', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('keeps the original accents and locks the new ones behind levels', () => {
    onboard();
    openProfile();
    // Appearance (and the accents) live in Settings, behind the profile card.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    // The five that always existed are still there and still usable.
    for (const id of ['mono', 'forest', 'ocean', 'wine', 'honey']) {
      expect(screen.getByLabelText(`${id} accent`)).toBeDefined();
    }
    const locked = screen.getByLabelText(/sage — unlocks at level 4/);
    expect(locked.disabled).toBe(true);
    expect(screen.getByText(/Three more arrive at levels 4, 8 and 12/)).toBeDefined();
  });
});
