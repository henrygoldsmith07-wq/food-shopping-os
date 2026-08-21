import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import ShoppingExport, { canShareShopping } from '../src/components/ShoppingExport.jsx';

afterEach(() => {
  cleanup();
  delete navigator.share;
  delete navigator.clipboard;
  vi.restoreAllMocks();
});

describe('shopping list hand-off', () => {
  it('falls back to the clipboard when the share sheet is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShoppingExport text={'Shopping list\n\n- Milk'} />);

    expect(canShareShopping()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Share shopping list' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Shopping list\n\n- Milk'));
    expect(screen.getByRole('status').textContent).toContain('Copied to your clipboard.');
  });

  it('uses the native share sheet when the device exposes it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShoppingExport text={'Shopping list\n\n- Bread'} />);

    expect(canShareShopping()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Share shopping list' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Forq shopping list', text: 'Shopping list\n\n- Bread' }));
    expect(screen.getByRole('status').textContent).toContain('Shared with your chosen app.');
  });
});
