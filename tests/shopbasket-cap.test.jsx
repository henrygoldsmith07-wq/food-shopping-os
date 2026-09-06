import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
