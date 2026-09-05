import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import BulkListActions from '../src/components/BulkListActions.jsx';
import UndoNotice from '../src/components/UndoNotice.jsx';
import ShoppingListRow from '../src/components/ShoppingListRow.jsx';

/**
 * The bulk actions exist so a mid-shop user can act on several ticked rows at
 * once; the contract that makes them trustworthy is atomicity — one snapshot,
 * one undo reverses the entire operation, never half of it.
 */
function Probe({ children, render }) {
  const app = useApp();
  return <div data-testid="probe">{render ? render(app) : children}</div>;
}

const seeded = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
  shoppingList: [
    { id: 'i1', name: 'Milk', aisle: 'Dairy & eggs', price: 0, qty: '1 pint', checked: false },
    { id: 'i2', name: 'Bread', aisle: 'Bakery', price: 0, checked: false },
    { id: 'i3', name: 'Eggs', aisle: 'Dairy & eggs', price: 0, checked: false },
  ],
  pantry: [
    { id: 'p1', name: 'Rice', qty: '1 bag', location: 'Cupboard', low: false },
  ],
};

describe('bulk shopping actions are atomic and undoable', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('moveCheckedToPantry moves ticked rows to the pantry and undo restores them', () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <span data-testid="list">{app.shoppingList.length}</span>
              <span data-testid="pantry">{app.pantry.length}</span>
              <button onClick={() => app.toggleChecked('i1')}>tick</button>
              <button onClick={() => app.moveCheckedToPantry('Fridge')}>move</button>
              <button onClick={() => app.undoLast()}>undo</button>
            </div>
          );
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('move'));
    expect(screen.getByTestId('list').textContent).toBe('2'); // Milk left the list
    expect(screen.getByTestId('pantry').textContent).toBe('2'); // Milk entered the pantry
    expect(snap.pantry.find((entry) => entry.name === 'Milk').location).toBe('Fridge');
    fireEvent.click(screen.getByText('undo'));
    expect(screen.getByTestId('list').textContent).toBe('3');
    expect(screen.getByTestId('pantry').textContent).toBe('1');
  });

  it('removeListItems removes several at once and one undo brings all back', () => {
    render(
      <AppProvider>
        <Probe render={(app) => (
          <div>
            <span data-testid="list">{app.shoppingList.length}</span>
            <button onClick={() => app.removeListItems(['i1', 'i2'])}>remove</button>
            <button onClick={() => app.undoLast()}>undo</button>
          </div>
        )} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('remove'));
    expect(screen.getByTestId('list').textContent).toBe('1');
    fireEvent.click(screen.getByText('undo'));
    expect(screen.getByTestId('list').textContent).toBe('3');
  });

  it('removePantryItems deletes multiple pantry rows at once and undo restores them', () => {
    render(
      <AppProvider>
        <Probe render={(app) => (
          <div>
            <span data-testid="pantry">{app.pantry.length}</span>
            <button onClick={() => app.removePantryItems(['p1'])}>delete</button>
            <button onClick={() => app.undoLast()}>undo</button>
          </div>
        )} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('delete'));
    expect(screen.getByTestId('pantry').textContent).toBe('0');
    fireEvent.click(screen.getByText('undo'));
    expect(screen.getByTestId('pantry').textContent).toBe('1');
  });

  it('bulk bar operates on ticked rows and offers its own undo', () => {
    render(
      <AppProvider>
        <Probe render={(app) => (
          <div>
            <button onClick={() => app.toggleChecked('i3')}>tick</button>
            <BulkListActions ticked={app.shoppingList.filter((item) => item.checked).length} />
          </div>
        )} />
      </AppProvider>,
    );
    expect(screen.queryByText(/ticked/)).toBeNull(); // nothing ticked yet
    fireEvent.click(screen.getByText('tick'));
    expect(screen.getByText('1 ticked')).toBeDefined();
    fireEvent.click(screen.getByText('To pantry'));
    expect(screen.getByText('Moved to pantry.')).toBeDefined();
    fireEvent.click(screen.getByText('Undo'));
    expect(screen.getByText('Undone.')).toBeDefined();
  });
});

describe('confirmed purchases update the pantry automatically', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('stocks checked purchases by default and records the reconciliation', () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.toggleChecked('i1')}>tick</button>
              <button onClick={() => app.recordShop({ store: 'Aldi', total: 1.3 })}>record</button>
            </div>
          );
        }} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('record'));
    // A second tap after the first state transition must not create a second
    // receipt or add the same stock twice.
    fireEvent.click(screen.getByText('record'));

    expect(snap.shoppingList).toHaveLength(2);
    expect(snap.shops).toHaveLength(1);
    expect(snap.shops[0]).toMatchObject({ store: 'Aldi', pantryReconciled: true });
    expect(snap.pantry.find((entry) => entry.name === 'Milk')).toMatchObject({
      qty: '1 pint',
      store: 'Aldi',
      purchaseDate: snap.day,
      purchaseSource: 'purchase',
    });
    expect(snap.pantryEvents.at(-1)).toMatchObject({
      type: 'purchase_reconciliation',
      store: 'Aldi',
      added: 1,
      merged: 0,
      conflicts: 0,
    });
  });

  it('honours an explicit opt-out without pretending the pantry was updated', () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.toggleChecked('i1')}>tick</button>
              <button onClick={() => app.recordShop({ store: 'Aldi', total: 1.3, toPantry: false })}>record</button>
            </div>
          );
        }} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('record'));

    expect(snap.pantry).toHaveLength(1);
    expect(snap.shops[0]).toMatchObject({ pantryReconciled: false });
    expect(snap.pantryEvents).toEqual([]);
  });

  it('merges a purchase into existing stock instead of creating a duplicate row', () => {
    const current = {
      ...seeded,
      shoppingList: [{ ...seeded.shoppingList[0], price: 1.3, qty: '500 ml' }],
      pantry: [{ id: 'p1', name: 'Milk', qty: '500 ml', cost: 1.1, location: 'Fridge' }],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return (
            <div>
              <button onClick={() => app.toggleChecked('i1')}>tick</button>
              <button onClick={() => app.recordShop({ store: 'Aldi' })}>record</button>
            </div>
          );
        }} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('tick'));
    fireEvent.click(screen.getByText('record'));

    expect(snap.pantry).toHaveLength(1);
    expect(snap.pantry[0]).toMatchObject({ name: 'Milk', qty: '1 l', cost: 2.4, location: 'Fridge' });
    expect(snap.pantryEvents.at(-1)).toMatchObject({ added: 0, merged: 1, conflicts: 0 });
  });
});

describe('quick quantity editing on a shopping row', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('opens inline, commits on Enter, and updates the row', () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          const item = app.shoppingList[0];
          return <ShoppingListRow item={item} onAisle={() => {}} onStore={() => {}} />;
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    const input = screen.getByLabelText('Quantity for Milk');
    fireEvent.change(input, { target: { value: '2 pints' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(snap.shoppingList[0].qty).toBe('2 pints');
    expect(screen.queryByLabelText('Quantity for Milk')).toBeNull(); // closed
  });
});

describe('UndoNotice surfaces the recoverable moment', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing without a message and auto-hides after the window', () => {
    vi.useFakeTimers();
    const { rerender } = render(<UndoNotice message="" onUndo={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<UndoNotice message="Rice removed from your pantry." onUndo={() => {}} />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(within(screen.getByRole('status')).getByText('Undo')).toBeDefined();
    act(() => vi.advanceTimersByTime(7000));
    expect(screen.queryByRole('status')).toBeNull();
  });
});