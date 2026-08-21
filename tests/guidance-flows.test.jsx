import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const openGuidance = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));
  return screen.getByRole('dialog', { name: 'Guidance' });
};

describe('adaptive Guidance', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('opens on one ranked next step with its evidence', () => {
    onboard();
    const guidance = openGuidance();
    expect(within(guidance).getByText('What matters now')).toBeDefined();
    expect(within(guidance).getAllByText('No food logged today').length).toBeGreaterThan(0);
    expect(within(guidance).getByText('After that')).toBeDefined();
  });

  it('uses the same recommendation on Home and in the full surface', () => {
    onboard();
    const preview = screen.getByRole('button', { name: 'Open Guidance' });
    expect(preview.textContent).toContain('Plan a meal');
    fireEvent.click(preview);
    expect(within(screen.getByRole('dialog', { name: 'Guidance' })).getAllByText('Plan a meal').length).toBeGreaterThan(0);
  });

  it('moves reports and dashboards behind Review', async () => {
    onboard();
    const guidance = openGuidance();
    fireEvent.click(within(guidance).getByText('Review'));
    expect(await within(guidance).findByText('Spending dashboard')).toBeDefined();
    fireEvent.click(within(guidance).getByText('Reports & export'));
    expect(await within(guidance).findByText(/No days logged in this window/)).toBeDefined();
  });

  it('keeps the typed assistant inside the same surface', async () => {
    onboard();
    const guidance = openGuidance();
    fireEvent.click(within(guidance).getByText('Ask'));
    expect(await within(guidance).findByLabelText('Ask Guidance')).toBeDefined();
    fireEvent.click(within(guidance).getByText('What needs using up?'));
    await waitFor(() => expect(within(guidance).getByText(/Your pantry is empty/)).toBeDefined(), { timeout: 1500 });
  });
});
