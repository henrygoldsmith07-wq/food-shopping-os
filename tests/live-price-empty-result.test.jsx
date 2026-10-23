import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoShopAnswered } from '../src/components/LivePriceCheck.jsx';

/**
 * The total miss is where the honesty invariant is most load-bearing: a 0%
 * hit rate with no explanation reads as malfunction and invites filling the
 * gap with a made-up number. This pins the copy that must survive redesigns.
 */
describe('live price total miss', () => {
  it('says empty is normal and never a fabricated price', () => {
    render(<NoShopAnswered />);
    expect(screen.getByText('No shop answered this time.')).toBeTruthy();
    // Names the real causes, including the honoured robots refusal.
    expect(screen.getByText(/robots\.txt — which Forq honours/)).toBeTruthy();
    // Promises no invention.
    expect(screen.getByText(/reported as empty rather than filled in/)).toBeTruthy();
    // Points at where real numbers still live.
    expect(screen.getByText(/recorded receipt prices/)).toBeTruthy();
  });
});
