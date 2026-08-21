import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const nav = () => within(document.querySelector('nav'));
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

/** Preferences → Focus, where the modes live. */
const openModes = () => {
  openProfile();
  const profile = screen.getByText('Guidance & you').closest('section');
  fireEvent.click(within(profile).getByText('Preferences'));
  const sheet = dialogFor('Preferences');
  fireEvent.click(within(sheet).getByText('Focus'));
  return sheet;
};

const chooseMode = (label) => {
  const sheet = openModes();
  fireEvent.click(within(sheet).getByText(label).closest('button'));
  return sheet;
};

/** Sheets nest, so close the deepest one first and work back out. */
const closeSheets = () => {
  for (let guard = 0; guard < 6; guard += 1) {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    if (!dialogs.length) return;
    const close = within(dialogs[dialogs.length - 1]).queryAllByLabelText('Close')[0];
    if (!close) return;
    fireEvent.click(close);
  }
};

describe('product modes', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('starts with every module shown', () => {
    onboard();
    for (const label of ['Home', 'Plan', 'Log', 'Shop', 'Recipes']) {
      expect(nav().getByText(label)).toBeTruthy();
    }
    const sheet = openModes();
    expect(within(sheet).getByText('Everything is shown')).toBeTruthy();
  });

  it('takes the screens an intent does not use off the tab bar', () => {
    onboard();
    chooseMode('Track nutrition');
    closeSheets();

    expect(nav().getByText('Log')).toBeTruthy();
    expect(nav().queryByText('Shop')).toBeNull();
    expect(nav().queryByText('Plan')).toBeNull();
    expect(nav().getByText('Home')).toBeTruthy(); // always somewhere to be
  });

  it('says what each hidden module is still holding', () => {
    onboard();
    const sheet = chooseMode('Track nutrition');
    expect(within(sheet).getByText('Hidden, and still here')).toBeTruthy();
    expect(within(sheet).getByText('Pantry & leftovers')).toBeTruthy();
    expect(within(sheet).getByText(/module.? hidden/)).toBeTruthy();
  });

  it('widens again when a second intent is added, and fully when cleared', () => {
    onboard();
    chooseMode('Track nutrition');
    closeSheets();
    expect(nav().queryByText('Shop')).toBeNull();

    chooseMode('Plan and shop');
    closeSheets();
    expect(nav().getByText('Shop')).toBeTruthy();
    expect(nav().getByText('Log')).toBeTruthy();

    const sheet = openModes();
    fireEvent.click(within(sheet).getByText('Show every module again'));
    expect(within(sheet).getByText('Everything is shown')).toBeTruthy();
    closeSheets();
    for (const label of ['Plan', 'Log', 'Shop', 'Recipes']) {
      expect(nav().getByText(label)).toBeTruthy();
    }
  });

  it('moves you off a screen the new mode hides, and gives it back intact', () => {
    onboard();
    fireEvent.click(nav().getByText('Shop'));
    expect(screen.getByText(/Nothing on the list yet/)).toBeTruthy();

    chooseMode('Track nutrition');
    closeSheets();
    // The Shop screen is gone, and the app is on Home rather than on a blank one.
    expect(nav().queryByText('Shop')).toBeNull();
    expect(screen.getByText(/Good (morning|afternoon|evening), Sam/)).toBeTruthy();

    const sheet = openModes();
    fireEvent.click(within(sheet).getByText('Show every module again'));
    closeSheets();
    fireEvent.click(nav().getByText('Shop'));
    expect(screen.getByText(/Nothing on the list yet/)).toBeTruthy();
  });

  it('hides the profile sections belonging to a hidden module', () => {
    onboard();
    chooseMode('Plan and shop');
    closeSheets();
    openProfile();
    // Profile's own sections only — the panels it can open are nested inside it.
    const profile = dialogFor('You').cloneNode(true);
    profile.querySelectorAll('[role="dialog"]').forEach((sheet) => sheet.remove());
    expect(profile.textContent).not.toContain('Health & training');
    expect(profile.textContent).not.toContain('Achievements');
    expect(profile.textContent).toContain('Guidance & you'); // never hidden
  });
});
