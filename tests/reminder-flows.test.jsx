import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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

const openReminders = () => {
  openProfile();
  const section = screen.getByText('Health & training').closest('section');
  fireEvent.click(within(section).getByText('Reminders'));
  return dialogFor('Reminders');
};

/** Make one, through the form, the way a person would. */
const addReminder = (sheet, { kind = 'Water', text = '', time = '09:00', repeat = null } = {}) => {
  fireEvent.click(within(sheet).getByText(/New reminder/));
  fireEvent.click(within(sheet).getByText(kind));
  if (text) fireEvent.change(within(sheet).getByLabelText('Reminder text'), { target: { value: text } });
  // Clear the kind's default times so the test controls the schedule.
  for (const button of within(sheet).getAllByLabelText(/^Remove \d\d:\d\d$/)) fireEvent.click(button);
  fireEvent.change(within(sheet).getByLabelText('New time'), { target: { value: time } });
  fireEvent.click(within(sheet).getByText('Add'));
  if (repeat) fireEvent.click(within(sheet).getByText(repeat));
  fireEvent.click(within(sheet).getByText(/Add reminder/));
};

/** Profile moved out of the tab bar; the avatar in the header opens it. */
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));

describe('reminders start empty', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('invents no routine for you, and says so', () => {
    onboard();
    const sheet = openReminders();
    expect(within(sheet).getByText(/won’t invent a routine for you/)).toBeTruthy();
    expect(within(sheet).queryByText('Due now')).toBeNull();
  });

  it('is straight about when a notification can and cannot reach you', () => {
    onboard();
    const sheet = openReminders();
    expect(within(sheet).getByText(/While Forq is open, a due reminder shows as a notification/)).toBeTruthy();
    expect(within(sheet).getByText(/server can queue reminder jobs, but Forq has no Web Push subscription/)).toBeTruthy();
    // And no switch that pretends otherwise.
    expect(within(sheet).queryByText(/[Bb]ackground notifications/)).toBeNull();
  });

  it('offers the calendar as the path that works with the app shut', () => {
    onboard();
    const sheet = openReminders();
    expect(within(sheet).getByText(/Your phone already does that job properly/)).toBeTruthy();
    expect(within(sheet).getByText('Nothing switched on to send')).toBeTruthy();
  });

  it('offers all nine notification presets and installs them in one tap', () => {
    onboard();
    const sheet = openReminders();
    expect(within(sheet).getByText('Notification presets')).toBeTruthy();
    expect(within(sheet).getByText('Expiry')).toBeTruthy();
    expect(within(sheet).getByText('Sale alerts')).toBeTruthy();
    expect(within(sheet).getByText('Restock')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Set up all 9'));
    expect(within(sheet).getByText('Check what needs using soon')).toBeTruthy();
    expect(within(sheet).getByText('Your weekly report')).toBeTruthy();
    expect(within(sheet).getByText('Repeat buys due')).toBeTruthy();
    expect(within(sheet).queryByText('Notification presets')).toBeNull();
  });
});

describe('making one', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('keeps it, with its schedule and when it next goes off', () => {
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { kind: 'Water', text: 'Glass of water', time: '09:00' });
    expect(within(sheet).getAllByText('Glass of water').length).toBeGreaterThan(0);
    expect(within(sheet).getByText(/Every day · 09:00/)).toBeTruthy();
  });

  it('refuses one that could never go off, and says which part is missing', () => {
    onboard();
    const sheet = openReminders();
    fireEvent.click(within(sheet).getByText(/New reminder/));
    for (const button of within(sheet).getAllByLabelText(/^Remove \d\d:\d\d$/)) fireEvent.click(button);
    expect(within(sheet).getByText(/No times yet/)).toBeTruthy();
    expect(within(sheet).getByText(/needs at least one time and one day/)).toBeTruthy();
    expect(within(sheet).getByText(/Add reminder/).closest('button').disabled).toBe(true);
  });

  it('shows the line it would arrive with, drawn from your own figures', () => {
    onboard();
    const sheet = openReminders();
    fireEvent.click(within(sheet).getByText(/New reminder/));
    fireEvent.click(within(sheet).getByText('Water'));
    expect(within(sheet).getByText(/You're at 0 of [\d,]+ ml/)).toBeTruthy();
  });

  it('turns one off without losing it, and deletes it when asked', () => {
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { text: 'Glass of water' });
    fireEvent.click(within(sheet).getByRole('switch'));
    expect(within(sheet).getByText(/Every day · 09:00 · Off/)).toBeTruthy();
    fireEvent.click(within(sheet).getByLabelText('Delete Glass of water'));
    expect(within(sheet).getByText(/won’t invent a routine for you/)).toBeTruthy();
  });

  it('can be sent to the calendar once there is something to send', () => {
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { text: 'Glass of water' });
    expect(within(sheet).getByText('Download 1 repeating alarm')).toBeTruthy();
  });
});

describe('when one comes due', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  /** Fix the clock so "due" is a fact about the test, not about when it runs. */
  const atTime = (hh, mm = 0) => {
    const now = new Date();
    now.setHours(hh, mm, 0, 0);
    vi.setSystemTime(now);
  };

  /** Let the app's own minute tick run, the way it does while you have it open. */
  const passAMinute = () => act(() => { vi.advanceTimersByTime(61000); });

  it('shows it as due, with your own figure attached, and ticks off', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    atTime(8, 55);
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { kind: 'Water', text: 'Glass of water', time: '09:00' });
    expect(within(sheet).queryByText('Due now')).toBeNull();

    atTime(9, 10);
    passAMinute();
    expect(within(sheet).getByText('Due now')).toBeTruthy();
    expect(within(sheet).getByText(/09:00 · \d+ min ago · You're at 0 of [\d,]+ ml/)).toBeTruthy();

    fireEvent.click(within(sheet).getByLabelText('Done: Glass of water at 09:00'));
    expect(within(sheet).queryByText('Due now')).toBeNull();
  });

  it('snoozing puts it away for a while rather than for good', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    atTime(9, 10);
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { kind: 'Water', text: 'Glass of water', time: '09:00' });
    expect(within(sheet).getByText('Due now')).toBeTruthy();

    fireEvent.click(within(sheet).getByText('10 min'));
    expect(within(sheet).queryByText('Due now')).toBeNull();

    atTime(9, 25);
    passAMinute();
    expect(within(sheet).getByText('Due now')).toBeTruthy();
  });

  it('reaches you on Home, where you will actually see it', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    atTime(9, 10);
    onboard();
    const sheet = openReminders();
    addReminder(sheet, { kind: 'Water', text: 'Glass of water', time: '09:00' });
    fireEvent.click(within(sheet).getByLabelText('Close'));
    fireEvent.click(screen.getByText('Home'));
    const section = within(document.querySelector('main')).getAllByText('Reminders')[0].closest('section');
    expect(within(section).getByText('Glass of water')).toBeTruthy();
  });
});
