import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import ShoppingListRow from '../src/components/ShoppingListRow.jsx';

/**
 * A shared list should read as people's ticks, not one anonymous checkmark:
 * checking records the active member, unchecking forgets them, and a member
 * who ticked sees "You" while the row stays legible to everyone else.
 */
function Probe({ children, render }) {
  const app = useApp();
  return <div data-testid="probe">{render ? render(app) : children}</div>;
}

const seeded = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  activeMemberId: 'm1',
  members: [
    { id: 'm1', name: 'Ada' },
    { id: 'm2', name: 'Sam' },
  ],
  shoppingList: [
    { id: 'i1', name: 'Milk', aisle: 'Dairy & eggs', price: 0, qty: '1 pint', checked: false },
  ],
};

describe('ticks carry the name of who made them', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderRow = () => {
    let snap;
    render(
      <AppProvider>
        <Probe
          render={(app) => {
            snap = app;
            return <ShoppingListRow item={app.shoppingList[0]} dragging={false} setDragging={() => {}} />;
          }}
        />
      </AppProvider>,
    );
    return () => snap;
  };

  it('records the active member on tick and clears it on untick', () => {
    const getSnap = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Tick Milk' }));
    expect(getSnap().shoppingList[0]).toMatchObject({ checked: true, checkedBy: 'm1' });
    expect(getSnap().shoppingList[0].checkedAt).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tick Milk' }));
    expect(getSnap().shoppingList[0]).toMatchObject({ checked: false, checkedBy: null });
  });

  it('shows the ticker by name to everyone else in a shared household', () => {
    // This device belongs to Sam — Ada's tick stays attributed by name.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, activeMemberId: 'm2' }));
    render(
      <AppProvider>
        <Probe
          render={(app) => (
            <ShoppingListRow item={{ ...app.shoppingList[0], checked: true, checkedBy: 'm1' }} dragging={false} setDragging={() => {}} />
          )}
        />
      </AppProvider>,
    );
    expect(screen.getByText(/Ada ticked this/)).toBeTruthy();
  });
});
