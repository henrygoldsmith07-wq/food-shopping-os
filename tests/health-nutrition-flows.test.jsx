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
  const visible = [...document.querySelectorAll('[role="dialog"]')]
    .filter((d) => d.getAttribute('aria-hidden') !== 'true')
    .filter((d) => d.querySelector('h2')?.textContent === title);
  // Sheets linger in the DOM for their 200ms close animation (marked
  // aria-hidden); the live one is the last match, never a closing one.
  const dialog = visible.at(-1);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

/** Close any open sheet so the next surface opens unstacked. */
const closeSheets = () => {
  for (const button of [...document.querySelectorAll('[role="dialog"]:not([aria-hidden="true"]) [aria-label="Close"]')]) {
    fireEvent.click(button);
  }
};

const enableTools = async (...labels) => {
  // Wedge opt-in, the way a user does it: Guidance → Tools → Add tools.
  closeSheets();
  fireEvent.click(screen.getByRole('button', { name: 'Guidance — what matters now' }));
  const guidance = dialogFor('Guidance');
  fireEvent.click(within(guidance).getByText('Tools'));
  fireEvent.click(within(guidance).getByText('Add tools'));
  for (const label of labels) {
    const toggle = await within(guidance).findByRole('switch', {
      name: new RegExp(`(?:Enable|Disable) ${label}`),
    });
    if (toggle.getAttribute('aria-checked') !== 'true') fireEvent.click(toggle);
  }
  for (const label of labels) {
    const toggle = await within(guidance).findByRole('switch', {
      name: new RegExp(`Disable ${label}`),
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  }
  fireEvent.click(within(guidance).getByLabelText('Close'));
  closeSheets();
};

const openHealth = async () => {
  onboard();
  // The Health card is parked behind Add tools: opt in explicitly first.
  await enableTools('Health vault and body log', 'Exercise log', 'Blood results', 'Fasting windows');
  fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
  const section = screen.getByText('Health & training').closest('section');
  fireEvent.click(within(section).getByText('Health'));
  return dialogFor('Health');
};

describe('integrated health area', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('puts the full nutrition breakdown and salt equivalent under Health', async () => {
    const health = await openHealth();
    fireEvent.click(within(health).getByText('Nutrition'));

    for (const label of ['Calories', 'Protein', 'Fat', 'Fibre', 'Sugar', 'Vitamin C', 'Water intake']) {
      expect(within(health).getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(within(health).getByText(/Salt equivalent/)).toBeTruthy();
    expect(within(health).getByText(/0 g \/ 5.8 g/)).toBeTruthy();
  });

  it('edits macro and weight goals from Health', async () => {
    const health = await openHealth();
    fireEvent.click(within(health).getByText('Targets'));

    expect(within(health).getByText('Daily targets')).toBeTruthy();
    expect(within(health).getAllByLabelText(/^Calories/).length).toBeGreaterThan(0);
    const target = within(health).getByLabelText(/^Target weight/);
    fireEvent.change(target, { target: { value: '68' } });
    expect(target).toHaveProperty('value', '68');
  });

  it('offers healthy swaps without inventing a food on an empty diary', async () => {
    const health = await openHealth();
    fireEvent.click(within(health).getByText('Swaps'));

    expect(within(health).getByText(/Log a food first/)).toBeTruthy();
  });
});
