import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import ShoppingListRow from '../src/components/ShoppingListRow.jsx';

const LONG = 'Sainsbury’s Wholemeal Seeded Batch Loaf';

const row = (overrides = {}) => render(
  <AppProvider>
    <ShoppingListRow
      item={{ id: 'x', name: LONG, qty: '800g', aisle: 'Bakery', ...overrides }}
      storeOptions={[]}
      setDragging={() => {}}
    />
  </AppProvider>,
);

afterEach(cleanup);

describe('a shopping list row shows the whole item name', () => {
  it('never truncates the name with an ellipsis', () => {
    // The name shares its row with a price field and two icon buttons, none
    // of which shrink. On a 390px phone that left the name about 110px —
    // twelve characters — so "Wholemeal bread" rendered as "Wholemeal ...".
    // The name is the one thing a shopping list exists to tell you.
    row();
    const name = screen.getByText(LONG, { exact: false });
    expect(name.className).not.toContain('truncate');
  });

  it('lets a long name wrap rather than overflow its column', () => {
    row();
    const name = screen.getByText(LONG, { exact: false });
    expect(name.className).toContain('overflow-wrap:anywhere');
  });

  it('still shows the quantity beside the name', () => {
    row();
    expect(screen.getByText(/800g/)).toBeTruthy();
  });

  it('keeps the name readable when the row is ticked off', () => {
    row({ checked: true });
    const name = screen.getByText(LONG, { exact: false });
    expect(name.className).toContain('line-through');
    expect(name.className).not.toContain('truncate');
  });
});

describe('a row survives an item the insight pass has not seen', () => {
  it('renders a brand-new item instead of crashing', () => {
    // `insight.price?.level !== 'unknown'` reads as a guard and is not one:
    // with no insight the optional chain yields undefined, undefined is not
    // 'unknown', and the branch then read .level off undefined. An item added
    // a moment ago has no insight yet, so it took its own row down.
    expect(() => row({ id: 'brand-new' })).not.toThrow();
    expect(screen.getByText(LONG, { exact: false })).toBeTruthy();
  });
})
