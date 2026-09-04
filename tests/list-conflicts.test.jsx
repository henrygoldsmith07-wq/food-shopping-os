import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import ListConflictCard from '../src/components/ListConflictCard.jsx';

/**
 * A shared list that split on two devices must ask the household, not pick a
 * silent winner: the card shows both copies (with the ticker's name where a
 * tick is the difference), and Keep-mine / Keep-household's resolves the row.
 */
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

const conflict = (over = {}) => ({
  id: 'c1',
  itemId: 'i1',
  name: 'Milk',
  field: 'checked',
  localIndex: 0,
  createdAt: 1,
  status: 'open',
  mine: { id: 'i1', name: 'Milk', qty: '2 pints', checked: true, checkedAt: 100, checkedBy: 'm1' },
  theirs: { id: 'i1', name: 'Milk', qty: '1 pint', checked: true, checkedAt: 200, checkedBy: 'm2' },
  ...over,
});

function Probe({ render }) {
  const app = useApp();
  return <div data-testid="probe">{render(app)}</div>;
}

const seedWith = (listConflicts) => localStorage.setItem(
  STORAGE_KEY, JSON.stringify({ ...seeded, listConflicts }),
);

describe('a list conflict is a human call', () => {
  beforeEach(() => seedWith([conflict()]));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderCard = () => {
    let snap;
    render(
      <AppProvider>
        <Probe
          render={(app) => {
            snap = app;
            return <ListConflictCard app={app} />;
          }}
        />
      </AppProvider>,
    );
    return () => snap;
  };

  it('surfaces the row and both copies instead of a silent winner', () => {
    renderCard();
    expect(screen.getByText('List conflicts · 1')).toBeDefined();
    expect(screen.getByText('Milk')).toBeDefined();
    expect(screen.getByText(/You ticked · 2 pints/)).toBeDefined(); // m1 is this device
    expect(screen.getByText(/Sam ticked · 1 pint/)).toBeDefined(); // m2 by name
  });

  it('keeps the household copy, ticker name included, when picked', () => {
    const getSnap = renderCard();
    fireEvent.click(screen.getByText("Keep household's"));
    expect(getSnap().shoppingList).toHaveLength(1);
    expect(getSnap().shoppingList[0]).toMatchObject({ checked: true, checkedBy: 'm2', qty: '1 pint' });
    expect(getSnap().listConflicts[0].status).toBe('resolved');
    expect(screen.queryByText('List conflicts · 1')).toBeNull();
  });

  it('keeps this devices copy when picked instead', () => {
    const getSnap = renderCard();
    fireEvent.click(screen.getByText("Keep this device's"));
    expect(getSnap().shoppingList[0]).toMatchObject({ checked: true, checkedBy: 'm1', qty: '2 pints' });
    expect(getSnap().listConflicts[0].resolution).toBe('mine');
  });

  it('hides entirely once every conflict is resolved or there are none', () => {
    const getSnap = renderCard();
    fireEvent.click(screen.getByText("Keep household's"));
    expect(screen.queryByText(/List conflicts/)).toBeNull();
    expect(getSnap().listConflicts.filter((c) => c.status !== 'resolved')).toHaveLength(0);
  });

  it('renders nothing for a resolved-only or empty conflict list', () => {
    cleanup();
    seedWith([conflict({ status: 'resolved', resolution: 'theirs' })]);
    const { container } = render(
      <AppProvider>
        <Probe render={(app) => <ListConflictCard app={app} />} />
      </AppProvider>,
    );
    expect(container.textContent).toBe('');
  });
});

describe('an unticked-vs-ticked split reads as a tick difference', () => {
  it('describes which side ticked and which did not', () => {
    seedWith([conflict({
      mine: { id: 'i1', name: 'Milk', qty: '1 pint', checked: false },
      theirs: { id: 'i1', name: 'Milk', qty: '1 pint', checked: true, checkedAt: 200, checkedBy: 'm2' },
    })]);
    render(
      <AppProvider>
        <Probe render={(app) => <ListConflictCard app={app} />} />
      </AppProvider>,
    );
    expect(screen.getByText(/unticked on one device, ticked on the other/)).toBeDefined();
  });
});
