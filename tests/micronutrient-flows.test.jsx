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

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const logFood = (name) => {
  fireEvent.click(screen.getAllByText('+ Add food')[0]);
  const addSheet = dialogFor('Add food');
  fireEvent.change(within(addSheet).getByLabelText('Search foods'), { target: { value: name } });
  fireEvent.click(within(addSheet).getAllByText(new RegExp(name, 'i'))[0]);
  const portion = dialogFor('How much?');
  fireEvent.click(within(portion).getByText(/Add \d+ kcal to/));
};

const openMicros = () => {
  fireEvent.click(screen.getByText('Log'));
  fireEvent.click(screen.getByText(/Vitamins & minerals/));
  return dialogFor('Vitamins & minerals');
};

describe('vitamins and minerals', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('reads a blank diary as nothing measured, not as a deficiency', () => {
    onboard();
    const sheet = openMicros();
    expect(within(sheet).getByText(/A blank diary is not a deficiency/)).toBeDefined();
    expect(within(sheet).getByText(/Log a meal and the gaps worth closing/)).toBeDefined();
    expect(within(sheet).queryByText(/well short/)).toBeNull();
  });

  it('names the gaps a logged day left, with food behind each one', () => {
    onboard();
    fireEvent.click(screen.getByText('Log'));
    logFood('white rice');
    const sheet = openMicros();
    expect(within(sheet).getAllByText(/short/).length).toBeGreaterThan(0);
    // Every suggestion is something to eat, never something to swallow.
    expect(within(sheet).getByText(/Forq does not recommend supplements/)).toBeDefined();
    expect(within(sheet).getAllByText(/\+\d+%/).length).toBeGreaterThan(0);
  });

  it('shows the week and the full nutrient list on their own tabs', () => {
    onboard();
    fireEvent.click(screen.getByText('Log'));
    logFood('spinach');
    const sheet = openMicros();

    fireEvent.click(within(sheet).getByText('This week'));
    expect(within(sheet).getByText(/1 day logged/)).toBeDefined();

    fireEvent.click(within(sheet).getByText('Every nutrient'));
    for (const label of ['Folate (B9)', 'Vitamin B12', 'Iodine', 'Selenium', 'Omega-3', 'Thiamin (B1)']) {
      expect(within(sheet).getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });
});
