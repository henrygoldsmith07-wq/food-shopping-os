import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';
// Full-app journeys are synchronous and drive the whole App: under batch
// load they can legitimately cross the 5s default, while a real hang still
// blows well past this ceiling.
vi.setConfig({ testTimeout: 15_000 });

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
  // The list lands first now; these flows drive the dashboard.
  fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Today'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

/** The loop panel is optional and starts hidden — turn it on through the
 *  real Preferences sheet, the way a person who wants the diagnostics would. */
const enableLoopWidget = () => {
  fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
  const section = screen.getByText('Guidance & you').closest('section');
  fireEvent.click(within(section).getByText('Preferences'));
  const prefs = dialogFor('Preferences');
  const chip = within(prefs).queryByRole('button', { name: 'Home preferences' });
  fireEvent.click(chip || within(prefs).getByText('Home'));
  fireEvent.click(within(prefs).getByLabelText('Show Food loop and loop check'));
  fireEvent.click(within(prefs).getByLabelText('Close'));
};

describe('global UX controls', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('opens the command palette from the keyboard and navigates search results', () => {
    onboard();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = screen.getByText('Command palette').closest('[role="dialog"]');
    const input = within(palette).getByLabelText('Search Forq');
    fireEvent.change(input, { target: { value: 'pantry' } });
    fireEvent.click(within(palette).getByText('Open pantry'));
    expect(screen.getByText('Smart pantry')).toBeTruthy();
  });

  it('opens quick add with Q and undoes an action with Ctrl+Z', () => {
    onboard();
    // The hydration counter lives on the diary — the simplified Home shows
    // the cooking, not the running totals. The diary opens from the palette.
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = screen.getByText('Command palette').closest('[role="dialog"]');
    fireEvent.click(within(palette).getByText('Open food diary'));
    fireEvent.keyDown(window, { key: 'q' });
    const quick = screen.getByText('Quick add').closest('[role="dialog"]');
    fireEvent.click(within(quick).getByText('Glass of water'));
    expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent.includes('250 / 2,000 ml'))).toBeTruthy();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByText((_, element) => element.tagName === 'P' && element.textContent.includes('0 / 2,000 ml'))).toBeTruthy();
    expect(screen.getByText('Undid last action')).toBeTruthy();
  });

  it('shows filtering, sorting and shortcut help in the palette', () => {
    onboard();
    fireEvent.click(screen.getByLabelText('Global search'));
    const palette = screen.getByText('Command palette').closest('[role="dialog"]');
    expect(within(palette).getByLabelText('Result type')).toBeTruthy();
    expect(within(palette).getByLabelText('Sort results')).toBeTruthy();
    expect(within(palette).getByText(/Ctrl K/)).toBeTruthy();
    expect(within(palette).getByText(/Q.*quick add/)).toBeTruthy();
  });

  it('adds a shopping item directly from quick add', () => {
    onboard();
    fireEvent.keyDown(window, { key: 'q' });
    const quick = screen.getByText('Quick add').closest('[role="dialog"]');
    const input = within(quick).getByLabelText('Quick shopping item');
    fireEvent.change(input, { target: { value: 'Oats' } });
    fireEvent.submit(input.closest('form'));

    expect(screen.queryByText('Quick add')).toBeNull();
    expect(screen.getByLabelText('Tick Oats')).toBeTruthy();
  });

  it('keeps pantry capture name-first and optional', () => {
    onboard();
    enableLoopWidget();
    fireEvent.click(screen.getByText('Add what’s in your cupboards'));
    const pantry = screen.getByText('Smart pantry').closest('[role="dialog"]');
    fireEvent.click(within(pantry).getByText('Add an item'));

    const details = within(pantry).getByText(/Add details/).closest('details');
    expect(details.open).toBe(false);
    expect(within(pantry).getByText(/name is enough for now/)).toBeTruthy();
    fireEvent.change(within(pantry).getByLabelText('Item name'), { target: { value: 'Rice' } });
    fireEvent.click(within(pantry).getByText('Add to pantry'));
    expect(within(pantry).getByText('Rice')).toBeTruthy();
  });

  it('keeps secondary home detail closed and makes offline recovery visible', async () => {
    onboard();
    enableLoopWidget();
    expect(screen.getByText('Week progress').closest('details').open).toBe(false);

    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByText('Offline — changes stay on this device.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Retry household sync' })).toBeTruthy();
    window.dispatchEvent(new Event('online'));
  });
});
