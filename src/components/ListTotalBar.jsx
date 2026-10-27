import { ShoppingCart } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { listTotals } from '../lib/basket-estimate.js';

/**
 * The list's total, pinned to the top while you scroll a long list (the
 * NeatEat header): what is in the trolley, what is still to get, and how many
 * items are left. "about" appears whenever any row's price is borrowed rather
 * than yours, and unpriced rows are counted, not treated as free.
 */
export default function ListTotalBar({ items, evidence }) {
  const totals = listTotals(items, evidence);
  const about = totals.estimated ? 'about ' : '';
  return (
    <div
      className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
      style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--card) 92%, transparent)' }}
      data-testid="list-total-bar"
    >
      <div className="min-w-0">
        <p className="text-[1.125rem] font-extrabold leading-tight tabular-nums">
          {about}{gbp(totals.total, { always: true })}
        </p>
        <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {totals.left} item{totals.left === 1 ? '' : 's'} left
          {totals.unpriced > 0 ? ` · ${totals.unpriced} not priced yet` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="inline-flex items-center gap-1 text-[0.8125rem] font-extrabold tabular-nums" style={{ color: totals.inTrolley > 0 ? 'var(--good)' : 'var(--muted)' }}>
          <ShoppingCart size={14} /> {gbp(totals.inTrolley, { always: true })}
        </p>
        <p className="text-[0.71875rem] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
          {about}{gbp(totals.toGo, { always: true })} to go
        </p>
      </div>
    </div>
  );
}

/** An aisle's heading: a tick once everything in it is in the trolley, and what the aisle costs. */
export function AisleHeading({ aisle, items, evidence }) {
  const allDone = items.every((i) => i.checked);
  const totals = listTotals(items, evidence);
  return (
    <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: allDone ? 'var(--good)' : 'var(--faint)' }}>
      {aisle} {allDone && '✓'}
      {totals.total > 0 && (
        <span className="ml-auto normal-case tracking-normal tabular-nums" data-testid="aisle-subtotal">
          {totals.estimated ? 'about ' : ''}{gbp(totals.total, { always: true })}
        </span>
      )}
    </p>
  );
}
