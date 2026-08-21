import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

const onboard = () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Start using Forq'));
};

const dialogFor = (title) => [...document.querySelectorAll('[role="dialog"]')]
  .find((dialog) => dialog.querySelector('h2')?.textContent === title);

const openHousehold = () => {
  onboard();
  fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
  fireEvent.click(screen.getByText('Just you'));
  return dialogFor('Family');
};

describe('household controls', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('creates a child profile and enforces its shopping permission', () => {
    const sheet = openHousehold();
    fireEvent.change(within(sheet).getByLabelText('New household member'), { target: { value: 'Alex' } });
    fireEvent.click(within(sheet).getByText('Add'));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Child profile for Alex' }));
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Alex can shop' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Use Alex profile' }));
    fireEvent.click(within(sheet).getByLabelText('Close'));

    fireEvent.click(screen.getByText('Shop'));
    expect(screen.getByText(/Shopping is off for Alex/)).toBeTruthy();
  });

  it('assigns household chores and records activity notifications', () => {
    const sheet = openHousehold();
    fireEvent.change(within(sheet).getByLabelText('New household member'), { target: { value: 'Alex' } });
    fireEvent.click(within(sheet).getByText('Add'));
    fireEvent.click(within(sheet).getByText('Tasks'));
    fireEvent.change(within(sheet).getByLabelText('New household task'), { target: { value: 'Clear the fridge' } });
    fireEvent.change(within(sheet).getByLabelText('Assign task to'), { target: { value: within(sheet).getByText('Alex').closest('option')?.value || '' } });
    fireEvent.click(within(sheet).getByText('Add task'));

    expect(within(sheet).getByText('Clear the fridge')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Activity'));
    expect(within(sheet).getByText(/Task added/)).toBeTruthy();
  });

  it('assigns shopping items to a household member', () => {
    const sheet = openHousehold();
    fireEvent.change(within(sheet).getByLabelText('New household member'), { target: { value: 'Alex' } });
    fireEvent.click(within(sheet).getByText('Add'));
    fireEvent.click(within(sheet).getByLabelText('Close'));
    fireEvent.click(screen.getByText('Shop'));
    fireEvent.click(screen.getByText('Add an item'));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Milk' } });
    fireEvent.click(screen.getByText('Add item'));

    const assignee = screen.getByLabelText('Assign Milk');
    fireEvent.change(assignee, { target: { value: [...assignee.options].find((option) => option.text === 'Alex').value } });
    expect(assignee.selectedOptions[0].text).toBe('Alex');
  });

  it('explains the boundary of live and cross-device syncing', () => {
    const sheet = openHousehold();
    fireEvent.click(within(sheet).getByText('Sharing'));
    expect(within(sheet).getByText(/open tabs in this browser update live/i)).toBeTruthy();
    expect(within(sheet).getByText(/Signed-in households receive cross-device changes/i)).toBeTruthy();
    expect(within(sheet).getByLabelText('Household share code').value).toMatch(/^FORQ-HOUSEHOLD-1\./);
  });

  it('applies a live update received from another browser tab', async () => {
    onboard();
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: JSON.stringify({ ...current, householdName: 'Synced home' }),
    }));
    fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
    fireEvent.click(screen.getByText('Just you'));
    const sheet = dialogFor('Family');
    await waitFor(() => expect(within(sheet).getByLabelText('Household name').value).toBe('Synced home'));
  });
});
