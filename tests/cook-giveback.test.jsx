import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { consumePantryIngredients } from '../src/lib/kitchen.js';
import { giveBackUsedRow, markGivenBack } from '../src/lib/cook-giveback.js';
import { pantryActions } from '../src/lib/pantry-actions.js';
import CookGiveBack from '../src/components/CookGiveBack.jsx';

const stock = (over = {}) => ({ id: 'p1', name: 'Spinach', qty: '400 g', cost: 2, confidence: 'definite', lastConfirmedAt: '2026-10-28', ...over });
const cook = (pantry, ingredients) => consumePantryIngredients(pantry, ingredients, { today: '2026-10-28' });

describe('giving a cook deduction back', () => {
  it('adds a partly used amount back to the row', () => {
    const r = cook([stock()], [{ name: 'Spinach', qty: '150 g' }]);
    expect(r.pantry[0].qty).toBe('250 g');
    const back = giveBackUsedRow(r.pantry, r.used[0]);
    expect(back.restored).toBe(true);
    expect(back.pantry[0].qty).toBe('400 g');
    expect(back.pantry[0].cost).toBe(2);
  });

  it('brings back a row the cook used whole', () => {
    const r = cook([stock({ qty: '100 g' })], [{ name: 'Spinach', qty: '150 g' }]);
    expect(r.pantry).toHaveLength(0);
    const back = giveBackUsedRow(r.pantry, r.used[0]);
    expect(back.pantry).toEqual([expect.objectContaining({ id: 'p1', qty: '100 g' })]);
  });

  it('puts a one-unit deduction back to its old quantity', () => {
    const r = cook([stock({ qty: '3 tins' })], [{ name: 'Spinach' }]);
    expect(r.pantry[0].qty).not.toBe('3 tins');
    expect(giveBackUsedRow(r.pantry, r.used[0]).pantry[0].qty).toBe('3 tins');
  });

  it('refuses a second give-back and leaves incomparable units alone', () => {
    const r = cook([stock()], [{ name: 'Spinach', qty: '150 g' }]);
    expect(giveBackUsedRow(r.pantry, { ...r.used[0], givenBack: true }).restored).toBe(false);
    const odd = giveBackUsedRow([stock({ qty: '2 bunches' })], { ...r.used[0], usedQty: '150 g' });
    expect(odd.restored).toBe(false);
  });

  it('the store action restores the pantry once and updates the event', () => {
    const r = cook([stock()], [{ name: 'Spinach', qty: '150 g' }]);
    const event = { id: 'pe1', type: 'recipe_consumption', enabled: true, used: r.used, explanation: 'x' };
    let state = { day: '2026-10-28', pantry: r.pantry, pantryEvents: [event], lastPantryEvent: event, household: null };
    const set = (fn) => { state = { ...state, ...fn(state) }; };
    const { giveBackCookUse } = pantryActions(set);
    giveBackCookUse('pe1', 0);
    expect(state.pantry[0].qty).toBe('400 g');
    expect(state.lastPantryEvent.used[0].givenBack).toBe(true);
    expect(state.lastPantryEvent.explanation).toMatch(/put back/);
    giveBackCookUse('pe1', 0);
    expect(state.pantry[0].qty).toBe('400 g');
    expect(markGivenBack(event, 0).used[0].givenBack).toBe(true);
  });
});

describe('CookGiveBack', () => {
  afterEach(cleanup);
  it('offers Didn’t use it per ingredient and calls back with the index', () => {
    const onGiveBack = vi.fn();
    const event = { id: 'pe1', enabled: true, used: [stock({ usedQty: '150 g' }), stock({ id: 'p2', name: 'Rice', givenBack: true })] };
    render(<CookGiveBack event={event} onGiveBack={onGiveBack} />);
    expect(screen.getByText(/Spinach · 150 g/)).toBeTruthy();
    expect(screen.getByText(/Rice · put back/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Didn’t use Spinach/ }));
    expect(onGiveBack).toHaveBeenCalledWith('pe1', 0);
    expect(screen.queryAllByRole('button')).toHaveLength(1);
  });
  it('renders nothing when deduction was off', () => {
    const { container } = render(<CookGiveBack event={{ enabled: false, used: [stock()] }} onGiveBack={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
