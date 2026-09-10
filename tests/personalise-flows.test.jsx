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

const goTab = (label) => fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText(label));

/** Log one food through search, so a test has something real to work with. */
const logFood = (name) => {
  // Log left the bar in the list-first nav; the command palette still finds it.
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.change(screen.getByLabelText('Search Forq'), { target: { value: 'food diary' } });
  fireEvent.keyDown(screen.getByLabelText('Search Forq'), { key: 'Enter' });
  // The palette can arrive with the diary's quick-add sheet open; the capture
  // flows below need the plain diary surface.
  const openSheet = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.getAttribute('aria-hidden') !== 'true');
  if (openSheet) fireEvent.click(within(openSheet).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getAllByText('+ Add food')[0]);
  const sheet = dialogFor('Add food');
  fireEvent.change(within(sheet).getByLabelText('Search foods'), { target: { value: name } });
  fireEvent.click(within(sheet).getAllByText(new RegExp(name, 'i'))[0]);
  fireEvent.click(within(dialogFor('How much?')).getByText(/Add \d+ kcal to/));
};

const openCard = (name) => {
  openProfile();
  const section = screen.getByText('Guidance & you').closest('section');
  fireEvent.click(within(section).getByText(name));
  return dialogFor(name);
};

const openReports = async () => {
  openProfile();
  const section = screen.getByText('Guidance & you').closest('section');
  fireEvent.click(within(section).getByText('Guidance'));
  const guidance = dialogFor('Guidance');
  fireEvent.click(within(guidance).getByText('Review'));
  fireEvent.click(within(guidance).getByText('Reports & export'));
  await within(guidance).findByText('Week');
  return guidance;
};

const openPrefs = (tab) => {
  const sheet = openCard('Preferences');
  if (tab) {
    // The view chips are buttons; plain-text lookup can collide with labels
    // elsewhere in the sheet (e.g. the Kitchen profile pill reads 'Home').
    const chip = within(sheet).queryByRole('button', { name: tab === 'Home' ? 'Home preferences' : tab });
    fireEvent.click(chip || within(sheet).getByText(tab));
  }
  return sheet;
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('preferences start empty and open', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('filters nothing until you tell it to', () => {
    onboard();
    const sheet = openPrefs();
    expect(within(sheet).getByText(/Nothing is being filtered out/)).toBeTruthy();
    fireEvent.click(within(sheet).getByLabelText('Close'));
    expect(screen.getByText('Nothing set — everything is offered')).toBeTruthy();
  });

  it('says an allergy is a removal, not a warning you can tap through', () => {
    onboard();
    const sheet = openPrefs();
    expect(within(sheet).getByText(/never offered/)).toBeTruthy();
    expect(within(sheet).getByText(/It is a filter, not a guarantee/)).toBeTruthy();
  });
});

describe('setting an allergy', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('shrinks the recipe book immediately, and says by how much', () => {
    onboard();
    const sheet = openPrefs();
    const count = () => within(sheet).getByText(/of [\d,]+ dishes/).parentElement.textContent;
    const before = count();
    fireEvent.click(within(sheet).getByText('Milk'));
    expect(count()).not.toBe(before);
    expect(within(sheet).getByText(/removed —/)).toBeTruthy();
  });

  it('tells you where that allergen usually hides', () => {
    onboard();
    const sheet = openPrefs();
    fireEvent.click(within(sheet).getByText('Peanuts'));
    const card = within(sheet).getByText('Where these hide').closest('div');
    expect(card.textContent).toMatch(/satay sauce/i);
  });

  it('actually removes those recipes from the library, and accounts for it', () => {
    onboard();
    const sheet = openPrefs();
    fireEvent.click(within(sheet).getByText('Milk'));
    fireEvent.click(within(sheet).getByLabelText('Close'));
    goTab('Recipes');
    expect(screen.getByText(/hidden by your allergies, diets and rules/)).toBeTruthy();
  });

  it('keeps an intolerance visible rather than removing it', () => {
    onboard();
    const sheet = openPrefs();
    fireEvent.click(within(sheet).getByText('Lactose'));
    expect(within(sheet).getByText(/Nothing is being filtered out/)).toBeTruthy();
    expect(within(sheet).getByText(/flag<\/strong>|flag/)).toBeTruthy();
  });
});

describe('units', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('changes how a number reads, one measure at a time', () => {
    onboard();
    const sheet = openPrefs('Units');
    const energy = within(sheet).getByText('Energy').closest('.card');
    expect(within(energy).getByText(/2,200 kcal/)).toBeTruthy();
    fireEvent.click(within(energy).getByText('Kilojoules'));
    expect(within(energy).getByText(/9,205 kJ/)).toBeTruthy();
    // The others are untouched — this isn't a wholesale switch to imperial.
    const weight = within(sheet).getByText('Body weight').closest('.card');
    expect(within(weight).getByText(/kg$/)).toBeTruthy();
  });

  it('is clear that only the display changed', () => {
    onboard();
    const sheet = openPrefs('Units');
    expect(within(sheet).getByText(/Only the display changes/)).toBeTruthy();
  });

  it('carries the choice through to a report', async () => {
    onboard();
    logFood('Banana');
    const prefs = openPrefs('Units');
    const energy = within(prefs).getByText('Energy').closest('.card');
    fireEvent.click(within(energy).getByText('Kilojoules'));
    fireEvent.click(within(prefs).getByLabelText('Close'));
    const reports = await openReports();
    // The week's headline figure, in the unit you chose.
    expect(within(reports).getByText(/^[\d,]+ kJ$/)).toBeTruthy();
    expect(within(reports).queryByText(/^[\d,]+ kcal$/)).toBeNull();
  });
});

describe('the Home layout', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('hides an optional panel without touching the number behind it', () => {
    onboard();
    goTab('Today');
    // Optional panels start hidden — reports are off until asked for.
    fireEvent.click(screen.getByText('Explore more'));
    expect(screen.queryByText('Your outcomes')).toBeNull();

    // Turning the panel on is what makes it appear…
    const sheet = openPrefs('Home');
    fireEvent.click(within(sheet).getByLabelText('Show Progress and reports'));
    fireEvent.click(within(sheet).getByLabelText('Close'));
    fireEvent.click(screen.getByText('Explore more'));
    expect(screen.getByText('Your outcomes')).toBeTruthy();

    // …and turning it off hides the panel without touching the numbers.
    const off = openPrefs('Home');
    fireEvent.click(within(off).getByLabelText('Show Progress and reports'));
    fireEvent.click(within(off).getByLabelText('Close'));
    fireEvent.click(screen.getByText('Explore more'));
    expect(screen.queryByText('Your outcomes')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = screen.getByLabelText('Search Forq');
    fireEvent.change(search, { target: { value: 'food diary' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    const openSheet = [...document.querySelectorAll('[role="dialog"]')]
      .find((d) => d.getAttribute('aria-hidden') !== 'true');
    if (openSheet) fireEvent.click(within(openSheet).getByRole('button', { name: 'Close' }));
    expect(screen.getAllByText(/Nothing logged/).length).toBeGreaterThan(0);
  });

  it('puts the default layout back', () => {
    onboard();
    const sheet = openPrefs('Home');
    // Loop diagnostics are off by default — turn one on, then reset.
    fireEvent.click(within(sheet).getByLabelText('Show Food loop and loop check'));
    const row = within(sheet).getByLabelText('Move Food loop and loop check up').parentElement;
    fireEvent.click(within(row).getByRole('switch'));
    fireEvent.click(within(sheet).getByText(/Back to the default layout/));
    fireEvent.click(within(sheet).getByLabelText('Close'));
    goTab('Today');
    expect(within(document.querySelector('main')).getAllByText(/This week/).length).toBeGreaterThan(0);
    // The default layout is the quiet one: no loop diagnostics, no numbers.
    const again = openPrefs('Home');
    expect(within(again).getByLabelText('Show Food loop and loop check').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(within(again).getByLabelText('Close'));
  });
});

describe('reports', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('reports an empty diary as empty rather than as zeroes', async () => {
    onboard();
    const sheet = await openReports();
    expect(within(sheet).getByText(/No days logged in this window/)).toBeTruthy();
  });

  it('leads with how many days it saw once there is something', async () => {
    onboard();
    logFood('Banana');
    const sheet = await openReports();
    expect(within(sheet).getByText(/1 of 7 days logged/)).toBeTruthy();
    expect(within(sheet).getByText(/a blank day is a day\s+you didn’t record/)).toBeTruthy();
  });

  it('will not call anything a deficiency off a couple of days', async () => {
    onboard();
    const sheet = await openReports();
    fireEvent.click(within(sheet).getByText('Patterns'));
    expect(within(sheet).getByText(/7 logged days make this worth reading — you have 0/)).toBeTruthy();
  });

  it('offers CSV, and is straight about where the PDF comes from', async () => {
    onboard();
    const sheet = await openReports();
    expect(within(sheet).getByText('Days CSV')).toBeTruthy();
    expect(within(sheet).getByText('Every food CSV')).toBeTruthy();
    expect(within(sheet).getByText(/The PDF is your browser’s own/)).toBeTruthy();
    // Nothing to write yet, and it says so rather than saving an empty file.
    fireEvent.click(within(sheet).getByText('Days CSV'));
    expect(within(sheet).getByText(/no rows to write yet/)).toBeTruthy();
  });
});
