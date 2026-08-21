import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App.jsx';

/* The things a screen reader, a keyboard and a thumb need, asserted where a
   regression would otherwise be invisible. jsdom has no layout, so nothing
   here measures pixels — the 44px hit areas are verified in the browser. What
   this catches is the part that *is* in the markup: names, roles, landmarks
   and the ability to reach a control without a pointer. */

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const main = () => document.querySelector('main');
const goTab = (label) => fireEvent.click(within(document.querySelector('nav')).getByText(label));
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

/** Anything a person can operate, as the accessibility tree sees it. */
const controls = (root = document.body) => [...root.querySelectorAll(
  'button, a[href], input, select, textarea, [role="switch"], [role="button"]',
)];

/** The accessible name, from whichever attribute supplies it. */
const nameOf = (el) => {
  const label = el.getAttribute('aria-label');
  if (label) return label;
  const id = el.getAttribute('aria-labelledby');
  return id ? (document.getElementById(id)?.textContent || '').trim() : '';
};

/** The open sheet with this name, whichever way it is labelled. */
const dialogNamed = (name) => [...document.querySelectorAll('[role="dialog"]')]
  .find((d) => nameOf(d) === name);

const named = (el) => Boolean(
  el.getAttribute('aria-label')
  || el.getAttribute('aria-labelledby')
  || el.getAttribute('title')
  || el.textContent.trim()
  || el.labels?.length,
);

describe('every screen is navigable without sight or a mouse', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('offers a skip link straight into the content', () => {
    onboard();
    const skip = screen.getByText('Skip to content');
    expect(skip.getAttribute('href')).toBe('#main');
    expect(main().id).toBe('main');
    // The target has to be focusable for the jump to actually move focus.
    expect(main().getAttribute('tabindex')).toBe('-1');
  });

  it('has one main landmark, one nav, and exactly one h1 per screen', () => {
    onboard();
    for (const tab of ['Plan', 'Log', 'Shop', 'Recipes']) {
      goTab(tab);
      expect(document.querySelectorAll('main').length).toBe(1);
      expect(document.querySelectorAll('nav').length).toBe(1);
      expect(document.querySelectorAll('h1').length).toBe(1);
    }
  });

  it('keeps a single h1 when the profile sheet is over a screen', () => {
    onboard();
    openProfile();
    expect(document.querySelectorAll('h1').length).toBe(1);
  });

  it('names every control on every tab', () => {
    onboard();
    for (const tab of ['Plan', 'Log', 'Shop', 'Recipes']) {
      goTab(tab);
      const unnamed = controls(main()).filter((el) => !named(el));
      expect(unnamed.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
    }
  });

  it('names every control behind the avatar, switches included', () => {
    onboard();
    openProfile();
    const sheet = dialogNamed('You');
    const unnamed = controls(sheet).filter((el) => !named(el));
    expect(unnamed.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
    // A switch with no name announces "switch, off" and nothing else.
    for (const sw of sheet.querySelectorAll('[role="switch"]')) {
      expect(named(sw)).toBe(true);
      expect(sw.getAttribute('aria-checked')).toMatch(/^(true|false)$/);
    }
  });

  it('says which tab you are on in the tree, not only in colour', () => {
    onboard();
    goTab('Shop');
    const current = [...document.querySelectorAll('nav [aria-current="page"]')];
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Shop');
  });

  it('gives every sheet a name of its own', () => {
    onboard();
    openProfile();
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    expect(dialogs.length).toBeGreaterThan(0);
    for (const d of dialogs) {
      expect(d.getAttribute('aria-modal')).toBe('true');
      // Named by a label of its own or by the heading it already shows —
      // either is a real accessible name.
      expect(nameOf(d)).toBeTruthy();
    }
  });

  it('makes long sheet content keyboard-scrollable', () => {
    onboard();
    openProfile();
    const sheet = dialogNamed('You');
    expect(sheet.querySelector('[data-sheet-scroll]').getAttribute('tabindex')).toBe('0');
  });

  it('makes a tappable card a real button, reachable and keyboard-operable', () => {
    onboard();
    openProfile();
    const cards = [...document.querySelectorAll('[role="button"]')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.getAttribute('tabindex')).toBe('0');
      expect(named(card)).toBe(true);
    }
  });

  it('opens a card with the keyboard, not just a tap', () => {
    onboard();
    openProfile();
    const sheet = dialogNamed('You');
    const goals = within(sheet).getByText('Goals & targets')
      .closest('section').querySelector('[role="button"]');
    fireEvent.keyDown(goals, { key: 'Enter' });
    const opened = [...document.querySelectorAll('[role="dialog"]')].map(nameOf);
    expect(opened).toContain('Goals & targets');
  });
});

describe('every screen names its main action', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('offers exactly one primary action per screen, and it says what it does', () => {
    onboard();
    const labels = {};
    for (const tab of ['Plan', 'Log', 'Shop', 'Recipes']) {
      goTab(tab);
      const bar = [...main().querySelectorAll('div.fixed')]
        .filter((el) => el.querySelector('button'));
      expect(bar.length).toBe(1);
      const label = bar[0].querySelector('button').textContent.trim();
      expect(label.length).toBeGreaterThan(3);
      labels[tab] = label;
    }
    // Each screen's action is its own, not the same button five times.
    expect(new Set(Object.values(labels)).size).toBe(4);
  });

  it('leads with the next setup step while there is one, then with the diary', () => {
    onboard();
    expect(screen.getAllByText('Plan a meal').length).toBeGreaterThan(0);
    expect(main().querySelector('div.fixed button')).toBeNull();
  });
});
