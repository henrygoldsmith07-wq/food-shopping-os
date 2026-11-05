import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShopLater from '../src/components/ShopLater.jsx';
import { setMyRecipes } from '../src/data/recipes.js';

const recipe = (id, name) => ({ id, name, servings: 2, time: 20, costPerServing: 1, ingredients: [{ name: 'x', qty: '1' }] });
const TODAY = '2026-10-30'; // a Friday

const app = (shoppingList, plan = {}) => ({
  day: TODAY, plan, shoppingList, householdAccess: { shopping: true },
  holdForTopUp: () => {}, releaseTopUp: () => {},
});

describe('ShopLater', () => {
  setMyRecipes([recipe('sl-a', 'Fish pie'), recipe('sl-b', 'Curry')]);

  it('names the date when a bare weekday could mean two different days', () => {
    render(<ShopLater app={app([
      { id: '1', name: 'Haddock', checked: false, sourceRecipes: ['Fish pie'], topUpOn: '2026-11-02' },
      { id: '2', name: 'Paneer', checked: false, sourceRecipes: ['Curry'], topUpOn: '2026-11-10' },
    ], { '2026-11-03': { dinner: 'sl-a' }, '2026-11-11': { dinner: 'sl-b' } })} />);
    expect(screen.getByText('Back on Monday')).toBeTruthy();
    expect(screen.getByText('Back on Tuesday 10 November')).toBeTruthy();
  });

  it('drops a hold from the card once its meal has moved before the return day', () => {
    const { container } = render(<ShopLater app={app([
      { id: '1', name: 'Haddock', checked: false, sourceRecipes: ['Fish pie'], topUpOn: '2026-11-02' },
    ], { '2026-10-31': { dinner: 'sl-a' } })} />);
    expect(container.textContent).not.toMatch(/Held for a top-up/);
  });
});
