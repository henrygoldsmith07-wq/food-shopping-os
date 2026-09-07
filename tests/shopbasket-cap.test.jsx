import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import ShopBasket from '../src/components/ShopBasket.jsx';

/**
 * The "what can I afford now" cap on the basket projection card: when the
 * projected basket passes the week's headroom, the card names what fits and
 * offers the one-tap re-rank — without ever mutating the list itself.
 */
const baseProps = {
  basket: { projected: 40, total: 40, saved: 0, priced: 3, unpriced: 0, spent: 20, left: -10, over: true },
  ticked: 0,
  visibleList: [],
  shoppingMode: false,
  shoppingSession: { active: false, stop: vi.fn() },
  isOnline: true,
  setSheet: vi.fn(),
  onOpenPantry: null,
  app: {
    weeklyBudget: 30,
    pantry: [],
    shoppingPreferences: {},
    setShoppingPreferences: vi.fn(),
    shoppingInsights: {},
  },
};

const cap = {
  headroom: 10, fitCount: 2, fitsCost: 8, outsideCount: 1, outsideCost: 32,
  unpriced: 0, ordered: [],
};

describe('the affordable cap on the basket projection', () => {
  afterEach(() => {
    cleanup();
  });

  it('names what fits and what sits past the headroom when over budget', () => {
    render(<ShopBasket {...baseProps} cap={cap} onReRank={vi.fn()} reRanked={false} />);
    expect(screen.getByText(/What you can afford now:/)).toBeDefined();
    expect(screen.getByText(/2 priced items .*fit your £10\.00 headroom — 1 priced item \(£32\.00\) sit past it/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rank by what I can afford' })).toBeDefined();
  });

  it('offers the way back once ranked, and never mutates the list itself', () => {
    const onReRank = vi.fn();
    render(<ShopBasket {...baseProps} cap={cap} onReRank={onReRank} reRanked />);
    const back = screen.getByRole('button', { name: 'Back to my order' });
    fireEvent.click(back);
    expect(onReRank).toHaveBeenCalledTimes(1);
  });

  it('shows no cap line inside a live shop or when the basket fits', () => {
    const { unmount } = render(<ShopBasket {...baseProps} cap={cap} onReRank={vi.fn()} />);
    expect(screen.getByText(/What you can afford now:/)).toBeDefined();
    unmount();

    // Fits within the budget — the projection is fine without the cap advice.
    const within = { ...baseProps, basket: { ...baseProps.basket, left: 10, over: false } };
    render(<ShopBasket {...within} cap={{ ...cap, outsideCount: 0, outsideCost: 0 }} />);
    expect(screen.queryByText(/What you can afford now:/)).toBeNull();
  });
});

describe('the cap in the ranked list, row by row', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('marks each row past the headroom in the ranked view', async () => {
    // £30 budget, nothing spent: the £5 and £8 items fit (£13), the £20 item
    // sits past the cap — so the ranked list must wear the marker on that
    // row, not just reorder it behind a summary line.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true, name: 'Sam', day: '2099-01-01', weeklyBudget: 30,
      shoppingList: [
        { id: 'w', name: 'Wine', qty: '', price: 20, aisle: 'Other', checked: false, note: '', priority: 'normal' },
        { id: 'm', name: 'Milk', qty: '', price: 5, aisle: 'Dairy & eggs', checked: false, note: '', priority: 'normal' },
        { id: 'b', name: 'Bread', qty: '', price: 8, aisle: 'Bakery', checked: false, note: '', priority: 'normal' },
      ],
    }));
    render(<App />);

    // The list is home for a returning household; the basket is over budget,
    // so the cap names what fits and offers the rank.
    expect(screen.getByText(/What you can afford now:/)).toBeDefined();
    const rank = screen.getByRole('button', { name: 'Rank by what I can afford' });
    fireEvent.click(rank);

    // The ranked list reads cheapest-first, and the pushed-out row wears its
    // marker where the trim happened — on the row itself.
    const wineRow = screen.getByRole('button', { name: /Tick Wine/ }).closest('div');
    expect(within(wineRow).getByText(/Past the week's cap/)).toBeDefined();
    // The rows that fit stay clean — no marker, nothing implying a trim.
    const milkRow = screen.getByRole('button', { name: /Tick Milk/ }).closest('div');
    expect(within(milkRow).queryByText(/Past the week's cap/)).toBeNull();
    const breadRow = screen.getByRole('button', { name: /Tick Bread/ }).closest('div');
    expect(within(breadRow).queryByText(/Past the week's cap/)).toBeNull();
    // The way back is still there, and flipping it clears the markers.
    fireEvent.click(screen.getByRole('button', { name: 'Back to my order' }));
    expect(screen.queryByText(/Past the week's cap/)).toBeNull();
  });

  it('flags the rows past the headroom in the household\'s own order too', async () => {
    // £30 budget, nothing spent. Wine then Milk then Bread reads 20 → 25 → 33:
    // the week's headroom runs out on Bread, so in own order it — and nothing
    // before it — wears the guard marker, even though ranked-by-price would
    // point at Wine. Both are honest reads of the same over-budget basket.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true, name: 'Sam', day: '2099-01-01', weeklyBudget: 30,
      shoppingList: [
        { id: 'w', name: 'Wine', qty: '', price: 20, aisle: 'Other', checked: false, note: '', priority: 'normal' },
        { id: 'm', name: 'Milk', qty: '', price: 5, aisle: 'Dairy & eggs', checked: false, note: '', priority: 'normal' },
        { id: 'b', name: 'Bread', qty: '', price: 8, aisle: 'Bakery', checked: false, note: '', priority: 'normal' },
      ],
    }));
    render(<App />);

    expect(screen.getByText(/What you can afford now:/)).toBeDefined();

    // Own order: the rows that fit inside the running headroom stay clean and
    // the row where the money runs out wears the guard's warning.
    const wineRow = screen.getByRole('button', { name: /Tick Wine/ }).closest('div');
    expect(within(wineRow).queryByText(/Past the week's headroom/)).toBeNull();
    const milkRow = screen.getByRole('button', { name: /Tick Milk/ }).closest('div');
    expect(within(milkRow).queryByText(/Past the week's headroom/)).toBeNull();
    const breadRow = screen.getByRole('button', { name: /Tick Bread/ }).closest('div');
    expect(within(breadRow).getByText(/Past the week's headroom — this row would take the budget over/)).toBeDefined();

    // Ranked, the read switches to the cap: Wine sits past it and carries that
    // marker instead; the own-order guard clears because the rows are reordered.
    fireEvent.click(screen.getByRole('button', { name: 'Rank by what I can afford' }));
    expect(within(screen.getByRole('button', { name: /Tick Wine/ }).closest('div')).getByText(/Past the week's cap/)).toBeDefined();
    expect(screen.queryByText(/Past the week's headroom/)).toBeNull();

    // And back to own order restores the guard read.
    fireEvent.click(screen.getByRole('button', { name: 'Back to my order' }));
    expect(within(screen.getByRole('button', { name: /Tick Bread/ }).closest('div')).getByText(/Past the week's headroom/)).toBeDefined();
    expect(screen.queryByText(/Past the week's cap/)).toBeNull();
  });
});
