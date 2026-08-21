import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Card, FoodArt, GestureMenu, Sheet } from '../src/components/ui.jsx';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('gesture menus', () => {
  const renderRow = (over = {}) => {
    const remove = vi.fn();
    const left = vi.fn();
    const right = vi.fn();
    render(
      <GestureMenu
        label="Milk"
        actions={[{ label: 'Remove', onClick: remove }]}
        onSwipeLeft={left}
        onSwipeRight={right}
        {...over}
      >
        <span>Milk row</span>
      </GestureMenu>,
    );
    return { remove, left, right };
  };

  it('opens the same accessible menu from a context click', () => {
    const { remove } = renderRow();
    fireEvent.contextMenu(screen.getByLabelText('Actions for Milk'));
    fireEvent.click(screen.getByText('Remove'));
    expect(remove).toHaveBeenCalledOnce();
  });

  it('opens the action menu from the standard keyboard context shortcut', () => {
    renderRow();
    fireEvent.keyDown(screen.getByLabelText('Actions for Milk'), { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu', { name: 'Actions for Milk' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeTruthy();
  });

  it('opens on long press', () => {
    vi.useFakeTimers();
    renderRow();
    fireEvent.touchStart(screen.getByLabelText('Actions for Milk'), { touches: [{ clientX: 20, clientY: 20 }] });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByText('Remove')).toBeTruthy();
  });

  it('maps deliberate horizontal swipes to row actions', () => {
    const { left, right } = renderRow();
    const row = screen.getByLabelText('Actions for Milk');
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 20 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 10, clientY: 20 }] });
    expect(left).toHaveBeenCalledOnce();
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 20 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 100, clientY: 20 }] });
    expect(right).toHaveBeenCalledOnce();
  });
});

describe('accessible shared surfaces', () => {
  it('uses the shared Lucide system for recipe artwork', () => {
    render(<FoodArt recipe={{ name: 'Leek soup', meal: 'lunch' }} alt="Leek soup recipe icon" />);
    const artwork = screen.getByRole('img', { name: 'Leek soup recipe icon' });

    expect(artwork.closest('[data-recipe-family]').dataset.recipeFamily).toBe('soup');
    expect(artwork.classList.contains('lucide-soup')).toBe(true);
    expect(artwork.closest('[data-recipe-family]').querySelector('img')).toBeNull();
  });

  it('activates clickable cards with Enter and Space', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Open pantry</Card>);
    const card = screen.getByRole('button', { name: 'Open pantry' });

    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('labels sheets, focuses them and restores the trigger on close', async () => {
    vi.useFakeTimers();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Pantry details">
        <button>First action</button>
      </Sheet>,
    );

    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('dialog', { name: 'Pantry details' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    rerender(<Sheet open={false} onClose={() => {}} title="Pantry details" />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

});
