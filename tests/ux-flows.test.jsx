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
  // The week is the home screen now; these flows drive the dashboard.
  fireEvent.click(within(document.querySelector('nav[aria-label="Main navigation"]')).getByText('Week'));
};

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

/**
 * The food loop is on by default now, so there is nothing to enable.
 *
 * This used to click the widget's toggle, which was the point — the loop was an
 * opt-in extra. It is the product's own loop, so it ships on, and clicking the
 * switch would turn it OFF and hide the very surface these tests drive. The
 * helper stays so the tests read the same way, and it asserts the widget is
 * already visible rather than reaching for a control that no longer means
 * "enable".
 */
const enableLoopWidget = () => {
  expect(screen.queryByText('Add what’s in your cupboards')).not.toBeNull();
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
