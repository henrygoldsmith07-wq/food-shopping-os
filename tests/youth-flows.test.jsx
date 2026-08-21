import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import {
  render, screen, fireEvent, cleanup, within,
} from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * Under-18 mode as a user meets it: an age typed into setup, and an app that
 * is different from that point on without anybody choosing a mode.
 */
const onboard = ({ age = null, consent = true } = {}) => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  if (age !== null) {
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: String(age) } });
  }
  fireEvent.click(screen.getByText('Continue'));
  if (age !== null && age < 18 && consent) {
    fireEvent.click(screen.getByLabelText('Accept the under-18 privacy terms'));
  }
  if (!(age !== null && age < 18 && !consent)) fireEvent.click(screen.getByText('Start using Forq'));
};

const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

const dialogFor = (title) => {
  const dialog = [...document.querySelectorAll('[role="dialog"]')]
    .find((d) => d.querySelector('h2')?.textContent === title);
  if (!dialog) throw new Error(`No open sheet titled "${title}"`);
  return dialog;
};

const openGoals = () => {
  openProfile();
  fireEvent.click(screen.getByText(/kcal · /));
  return dialogFor('Goals & targets');
};

describe('setup decides the mode from the age it already asks for', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('says what changes as soon as an under-18 age is typed', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.queryByText('Forq is set up for under-18s')).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '15' } });
    expect(screen.getByText('Forq is set up for under-18s')).toBeTruthy();
    // And it goes again if the age was a typo.
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '35' } });
    expect(screen.queryByText('Forq is set up for under-18s')).toBeNull();
  });

  it('offers no weight-loss or recomposition goal', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Personalise nutrition'));
    expect(screen.queryByText('Weight loss')).toBeNull();
    expect(screen.queryByText('Body recomposition')).toBeNull();
    expect(screen.getAllByText('Maintenance').length).toBeGreaterThan(0);
    expect(screen.getByText('Muscle gain')).toBeTruthy();
  });

  it('asks for consent separately, and will not start until it is given', () => {
    onboard({ age: 15, consent: false });
    expect(screen.getByText('Before you start')).toBeTruthy();
    expect(screen.getByText('Start using Forq').closest('button').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Accept the under-18 privacy terms'));
    expect(screen.getByText('Start using Forq').closest('button').disabled).toBe(false);
  });

  it('asks nobody over 18 for that consent', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.change(screen.getByLabelText(/^Your age/), { target: { value: '35' } });
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.queryByText('Before you start')).toBeNull();
    expect(screen.getByText('Start using Forq').closest('button').disabled).toBe(false);
  });
});

describe('the app an under-18 user ends up with', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('explains the mode on the profile rather than leaving it to be noticed', () => {
    onboard({ age: 15 });
    openProfile();
    expect(screen.getByText('Under-18 mode')).toBeTruthy();
    expect(screen.getByText(/parent or carer, your GP, a school nurse or a registered dietitian/)).toBeTruthy();
  });

  it('shows no weekly calorie budget to pay back', () => {
    onboard({ age: 15 });
    const sheet = openGoals();
    expect(within(sheet).getByText('No weekly calorie budget')).toBeTruthy();
    expect(within(sheet).queryByLabelText(/^Calories per week/)).toBeNull();
  });

  it('keeps the weekly budget for an adult, so this is the age rule', () => {
    onboard({ age: 35 });
    const sheet = openGoals();
    expect(within(sheet).getByText('Weekly target')).toBeTruthy();
    expect(within(sheet).getByLabelText(/^Calories per week/)).toBeTruthy();
  });

  it('tracks caffeine against an age-appropriate figure and drops alcohol', () => {
    onboard({ age: 15 });
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    expect(screen.getByText(/Caffeine 0 mg of 100 mg/)).toBeTruthy();
    expect(screen.queryByText(/^Alcohol /)).toBeNull();
  });

  it('still shows an adult the alcohol line and the 400 mg figure', () => {
    onboard({ age: 35 });
    fireEvent.click(screen.getByRole('button', { name: /^Log/ }));
    expect(screen.getByText(/Caffeine 0 mg of 400 mg/)).toBeTruthy();
    expect(screen.getByText(/^Alcohol /)).toBeTruthy();
  });
});
