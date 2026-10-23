import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import App from '../src/App.jsx';
import ClientRoot from '../src/app/ClientRoot.jsx';
import { resetStoreHandles } from '../src/lib/persistent-state.js';

/**
 * The walkthrough's own dismiss button used to be a no-op on the final step —
 * the card could only be removed by exiting the sandbox entirely. Regression:
 * finishing the tour must end the demo session.
 */
describe('demo walkthrough', () => {
  // Full-app renders persist to localStorage AND the fake IndexedDB, so one
  // test's adopted kitchen would otherwise become the next test's boot state
  // (an adoption test would stop proving anything about fresh kitchens).
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    resetStoreHandles();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    resetStoreHandles();
    window.history.replaceState({}, '', '/');
  });

  // A full App render plus five tour steps; the 5s default is too tight on a
  // machine also serving a production build, and this test is about behaviour,
  // not speed.
  it('finishing the tour exits the sandbox', { timeout: 20000 }, () => {
    render(<App />);
    fireEvent.click(screen.getByText('Explore an example week first'));

    // Address the tour control by its accessible name, not by visible text:
    // seeded demo list content can legitimately contain the word "Next".
    const next = () => screen.getByRole('button', { name: 'Next demo step' });
    // The tour walks plan → list → shop → pantry → cook → closed loop.
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());

    expect(screen.getByText('Finish tour')).toBeTruthy();
    fireEvent.click(screen.getByText('Finish tour'));

    // Demo closed: walkthrough gone, back on the real (still un-onboarded) app.
    expect(screen.queryByText('Finish tour')).toBeNull();
    expect(screen.queryByText(/Demonstration data/)).toBeNull();
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });

  // Adopting the demo must end the sandbox AND leave a real, onboarded kitchen
  // behind — the dinners rebased onto this week — rather than discarding it.
  it('adopting the demo week starts the real kitchen from it', { timeout: 20000 }, () => {
    render(<App />);
    fireEvent.click(screen.getByText('Explore an example week first'));
    expect(screen.getAllByText(/Demonstration data/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Use this demo week as my starting plan' }));

    // Sandbox closed and the real kitchen is onboarded with an adopted plan:
    // no demo banner, no onboarding name field anymore.
    expect(screen.queryByText(/Demonstration data/)).toBeNull();
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  // The /demo page's "Start my kitchen" link lands on ?demo=1&adopt=1, which
  // must enter the sandbox AND adopt in the same boot — a visitor who never
  // sees the walkthrough still gets a real plan, never a stranded sandbox.
  it('adopt deep link starts the real kitchen without a tour stop', { timeout: 20000 }, () => {
    window.history.replaceState({}, '', '/?demo=1&adopt=1');
    try {
      render(<ClientRoot />);
      // Sandbox never surfaces: no banner, no walkthrough step control …
      expect(screen.queryByText(/Demonstration data/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Next demo step' })).toBeNull();
      // … and the real kitchen is onboarded rather than waiting at setup.
      expect(screen.queryByLabelText('Your name')).toBeNull();
      // The deep link cleans up after itself instead of re-adopting on reload.
      expect(window.location.search).toBe('');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  // Adoption must land with something to shop: the plan→list derivation the
  // store-api wrapper runs on every plan edit is applied by the adoption
  // itself (it bypasses that wrapper), pantry already deducted.
  it('adopting builds a pantry-aware shopping list, not an empty one', { timeout: 20000 }, () => {
    window.history.replaceState({}, '', '/?demo=1&adopt=1');
    try {
      render(<ClientRoot />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));
      // Real rows from the adopted dinners …
      expect(screen.getByText('Chicken thighs')).toBeTruthy();
      // … minus what the adopted staples already cover.
      expect(screen.queryByText('Olive oil')).toBeNull();
      expect(screen.queryByText(/^Rice$/)).toBeNull();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  // The adoption receipt is the loop closed honestly: what the demo put in,
  // dismissable, and undoable back to the pre-adoption kitchen.
  it('adopting shows a receipt that dismisses and undoes', { timeout: 20000 }, () => {
    window.history.replaceState({}, '', '/?demo=1&adopt=1');
    try {
      render(<ClientRoot />);
      expect(screen.getByText('Your week is planned')).toBeTruthy();
      expect(screen.getByText(/Demo receipts stayed behind/)).toBeTruthy();

      // Dismiss: receipt gone, adopted plan stays.
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss adoption summary' }));
      expect(screen.queryByText('Your week is planned')).toBeNull();
      expect(screen.queryByLabelText('Your name')).toBeNull();
    } finally {
      window.history.replaceState({}, '', '/');
      cleanup();
    }
  });

  // The receipt's primary action must land on the adopted plan itself — a
  // CTA that navigates nowhere (or to an empty plan) breaks the adoption
  // promise at the last step.
  it('reviewing an adoption opens the adopted plan', { timeout: 20000 }, () => {
    window.history.replaceState({}, '', '/?demo=1&adopt=1');
    try {
      render(<ClientRoot />);
      expect(screen.getByText('Your week is planned')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Review your plan' }));
      // An adopted dinner from the example-week rotation is on the calendar.
      expect(screen.getAllByText('Lemon Chicken Traybake').length).toBeGreaterThan(0);
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('undoing an adoption restores the pre-adoption kitchen', { timeout: 20000 }, () => {
    window.history.replaceState({}, '', '/?demo=1&adopt=1');
    try {
      render(<ClientRoot />);
      expect(screen.getByText('Your week is planned')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
      // Back to the empty, un-onboarded kitchen: receipt gone, setup waiting.
      expect(screen.queryByText('Your week is planned')).toBeNull();
      expect(screen.getByLabelText('Your name')).toBeTruthy();
    } finally {
      window.history.replaceState({}, '', '/');
      cleanup();
    }
  });
});
