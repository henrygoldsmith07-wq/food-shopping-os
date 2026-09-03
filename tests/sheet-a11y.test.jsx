import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Sheet } from '../src/components/ui.jsx';

/**
 * A modal without a focus trap lets a keyboard user tab out of the dialog
 * into the page behind it — the page reads on, they keep tabbing, and the
 * dialog they were using is silently gone. The trap cycles Tab within the
 * panel, and only the top-most open sheet owns it, so a sheet opened inside
 * another sheet keeps the inner one in charge.
 *
 * The sheet renders its own Close control ahead of its children, so the
 * first and last focusables are read from the rendered dialog, never assumed.
 */

const buttonsOf = (dialog) => [...dialog.querySelectorAll('button')].filter((button) => !button.disabled);
const firstOf = (dialog) => buttonsOf(dialog)[0];
const lastOf = (dialog) => buttonsOf(dialog)[buttonsOf(dialog).length - 1];

afterEach(cleanup);

describe('sheet focus management', () => {
  it('traps Tab inside the open sheet, wrapping last to first', () => {
    render(
      <div>
        <button>Behind the sheet</button>
        <Sheet open title="Test sheet" onClose={vi.fn()}>
          <button>First</button>
          <button>Second</button>
        </Sheet>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test sheet' });
    lastOf(dialog).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(firstOf(dialog)); // wrapped, not escaped
    // And the other way round: Shift+Tab from the first lands on the last.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastOf(dialog));
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    render(
      <div>
        <button>Behind the sheet</button>
        <Sheet open title="Test sheet" onClose={vi.fn()}>
          <button>First</button>
        </Sheet>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test sheet' });
    firstOf(dialog).focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastOf(dialog));
  });

  it('never lets focus reach the page behind the sheet', () => {
    render(
      <div>
        <button>Behind the sheet</button>
        <Sheet open title="Test sheet" onClose={vi.fn()}>
          <button>First</button>
          <button>Second</button>
          <button>Third</button>
        </Sheet>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test sheet' });
    const behind = screen.getByText('Behind the sheet');
    for (let index = 0; index < 8; index += 1) {
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(document.activeElement).not.toBe(behind);
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('gives the keyboard to the innermost sheet when sheets nest', () => {
    render(
      <Sheet open title="Outer sheet" onClose={vi.fn()}>
        <button>Outer control</button>
        <Sheet open title="Inner sheet" onClose={vi.fn()}>
          <button>Inner first</button>
          <button>Inner last</button>
        </Sheet>
      </Sheet>,
    );
    const inner = screen.getByRole('dialog', { name: 'Inner sheet' });
    const outerControl = screen.getByText('Outer control');
    lastOf(inner).focus();
    fireEvent.keyDown(inner, { key: 'Tab' });
    // The inner sheet owns the trap: focus wrapped inside it, never reaching
    // the outer sheet's own control.
    expect(inner.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(outerControl);
    fireEvent.keyDown(inner, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastOf(inner));
  });

});