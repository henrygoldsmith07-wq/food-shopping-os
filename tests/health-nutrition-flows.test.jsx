import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const openHealth = () => {
  onboard();
  fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
  const section = screen.getByText('Health & training').closest('section');
  fireEvent.click(within(section).getByText('Health'));
  return [...document.querySelectorAll('[role="dialog"]')]
    .find((dialog) => dialog.querySelector('h2')?.textContent === 'Health');
};

describe('integrated health area', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('puts the full nutrition breakdown and salt equivalent under Health', () => {
    const health = openHealth();
    fireEvent.click(within(health).getByText('Nutrition'));

    for (const label of ['Calories', 'Protein', 'Fat', 'Fibre', 'Sugar', 'Vitamin C', 'Water intake']) {
      expect(within(health).getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(within(health).getByText(/Salt equivalent/)).toBeTruthy();
    expect(within(health).getByText(/0 g \/ 5.8 g/)).toBeTruthy();
  });

  it('edits macro and weight goals from Health', () => {
    const health = openHealth();
    fireEvent.click(within(health).getByText('Targets'));

    expect(within(health).getByText('Daily targets')).toBeTruthy();
    expect(within(health).getAllByLabelText(/^Calories/).length).toBeGreaterThan(0);
    const target = within(health).getByLabelText(/^Target weight/);
    fireEvent.change(target, { target: { value: '68' } });
    expect(target).toHaveProperty('value', '68');
  });

  it('offers healthy swaps without inventing a food on an empty diary', () => {
    const health = openHealth();
    fireEvent.click(within(health).getByText('Swaps'));

    expect(within(health).getByText(/Log a food first/)).toBeTruthy();
  });
});
