import { useMemo } from 'react';
import { AlertTriangle, Check, ShoppingBasket } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { optimiseLiveBasket } from '../lib/basket-optimizer.js';
import { Card, Pill, Section } from './ui.jsx';

/**
 * The whole-list decision, kept separate from per-item price evidence.
 *
 * A cheap item at one shop is not automatically a cheap shop: the basket only
 * counts products that match the request, charges for the packs needed, and
 * keeps missing or excluded products visible. The evidence is still labelled
 * as live, receipt or paid-data input by each matched line.
 */
export default function CheapestBasket({ items = [], liveResults = {}, shops = [] }) {
  const comparison = useMemo(
    () => optimiseLiveBasket(items, { liveResults, shops }),
    [items, liveResults, shops],
  );

  if (!items.length) return null;

  return (
    <Section className="rise rise-1" title="Automatic cheapest-basket check">
      {!comparison.stores.length ? (
        <Card className="text-center py-6">
          <ShoppingBasket size={24} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
          <p className="font-bold">No complete basket to compare yet</p>
          <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Check live shop prices, or record prices on receipts from at least one shop. Forq will
            compare only evidence it has — it never fills a missing price with a guess.
          </p>
        </Card>
      ) : (
        <>
          {comparison.best && (
            <Card className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                    {comparison.best.complete ? 'Cheapest complete basket' : 'Closest available basket'}
                  </p>
                  <p className="mt-1 text-[1.2rem] font-extrabold tabular-nums">
                    {comparison.best.store} · {gbp(comparison.best.total, { always: true })}
                  </p>
                  <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {comparison.best.matched} of {items.length} item{items.length === 1 ? '' : 's'} matched
                  </p>
                </div>
                <Pill tone={comparison.best.complete ? 'good' : 'warn'}>
                  {comparison.best.complete ? <><Check size={11} /> full basket</> : <><AlertTriangle size={11} /> incomplete</>}
                </Pill>
              </div>
              <p className="mt-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {comparison.recommendation}
              </p>
              {!comparison.best.complete && (
                <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
                  {comparison.best.unavailableItems.join(', ')} still need pricing or a deliberate substitution.
                </p>
              )}
            </Card>
          )}

          <div className="mt-2.5 space-y-2">
            {comparison.rows.map((row) => (
              <Card key={row.store} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[0.875rem] truncate">{row.store}</p>
                    <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {gbp(row.total, { always: true })} product prices · {row.availability}% matched
                      {row.delivery || row.travel ? ` · ${gbp(row.delivery + row.travel, { always: true })} travel/delivery` : ''}
                    </p>
                  </div>
                  <Pill tone={row.complete ? 'good' : 'muted'}>
                    {row.complete ? 'complete' : `${row.unavailable} missing`}
                  </Pill>
                </div>
                {row.matchedItems.length > 0 && (
                  <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                    {row.matchedItems.map((item) => `${item.name} ${gbp(item.price, { always: true })}${item.packsNeeded > 1 ? ` (${item.packsNeeded} packs)` : ''}`).join(' · ')}
                  </p>
                )}
                {row.unavailableItems.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
                      {row.unavailableItems.length} item{row.unavailableItems.length === 1 ? '' : 's'} not included
                    </summary>
                    <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                      {row.unavailableItems.join(' · ')}
                    </p>
                    {row.excludedItems.length > 0 && (
                      <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
                        {row.excludedItems.map((item) => `${item.item}: ${item.reason}`).join(' · ')}
                      </p>
                    )}
                  </details>
                )}
              </Card>
            ))}
          </div>

          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            Equivalent products are matched before totals are ranked. Different variants stay out
            of the total; pack-size differences are converted to the number of packs you would need.
            Prices are evidence from your checks or receipts, not a checkout quote.
          </p>
        </>
      )}
    </Section>
  );
}
