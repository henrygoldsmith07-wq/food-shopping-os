import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * A CSV import of several trips used to push one undo step per trip, so
 * reverting a 12-trip file took 12 presses of Ctrl+Z. An import is one
 * operation: one undo must revert every trip it wrote — and leave no stale
 * batch state behind for whatever comes next.
 */
describe('import undo batching', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  const onboard = () => {
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start using Forq'));
  };

  const importReceipts = async (rows) => {
    // The merged app navigates by journey stage, not a Home/Shop tab pair.
    fireEvent.click(within(document.querySelector('nav')).getByLabelText('Shop: Buy what you need'));
    // The import button lives on the list segment; a previous step may have
    // left the tab on its history segment. The segment chips render label
    // text inside a span, so match the chip button by its full text.
    const listChip = screen.getAllByText('List').find((el) => el.closest('button'));
    fireEvent.click(listChip.closest('button'));
    fireEvent.click(screen.getByText('Import receipts'));
    const dialog = document.querySelector('[role="dialog"]');
    fireEvent.change(within(dialog).getByLabelText('Receipt CSV'), {
      target: { value: ['date,store,item,qty,price', ...rows].join('\n') },
    });
    fireEvent.click(within(dialog).getByText(/Import \d+ items? from \d+ trips?/));
    fireEvent.click(within(dialog).getByLabelText('Close'));
    // The sheet animates closed and unmounts its content a tick later. Let
    // that timer fire — reopening before it does shows the previous import's
    // success card, which no real user can hit (they can't outpace 200ms).
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
  };

  const shopHistory = () => {
    fireEvent.click(screen.getByText('Shops'));
    return document.body.textContent;
  };

  it('reverts a multi-trip import with a single undo', async () => {
    render(<App />);
    onboard();
    await importReceipts(['2026-08-03,Tesco,Bread,1,1.35', '2026-08-03,Tesco,Milk,1,1.10', '2026-08-01,Aldi,Pasta,1,0.85']);

    let text = shopHistory();
    expect(text.includes('Aldi') && text.includes('Tesco')).toBe(true);
    expect(JSON.parse(localStorage.getItem('forq-state-v2')).shops).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    // One undo, both trips gone — the checkpoint is the post-onboarding state,
    // so the app itself (not onboarding) is what you come back to.
    text = shopHistory();
    expect(text.includes('No shops recorded')).toBe(true);
    const persisted = JSON.parse(localStorage.getItem('forq-state-v2'));
    expect(persisted.shops).toHaveLength(0);
    expect(persisted.onboarded).toBe(true);
  });

  it('leaves no stale batch behind: a second import undoes cleanly too', async () => {
    render(<App />);
    onboard();
    await importReceipts(['2026-08-03,Tesco,Bread,1,1.35', '2026-08-03,Tesco,Milk,1,1.10']);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(shopHistory().includes('No shops recorded')).toBe(true);

    await importReceipts(['2026-08-01,Aldi,Pasta,1,0.85']);
    expect(JSON.parse(localStorage.getItem('forq-state-v2')).shops).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(shopHistory().includes('No shops recorded')).toBe(true);
    expect(JSON.parse(localStorage.getItem('forq-state-v2')).shops).toHaveLength(0);
  });
});
