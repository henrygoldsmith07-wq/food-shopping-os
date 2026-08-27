import { ExternalLink } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { methodLabel, methodTone, rankShops, rankingSpread, viaLabel } from '../lib/live-prices.js';
import { Pill } from './ui.jsx';

/**
 * The shops for one food item, cheapest first.
 *
 * Ordered, not just listed: a rank, the price, and how far above the cheapest
 * each shop sits. The bar is the same magnitude idiom the receipt graphs use,
 * and it is scaled from zero-ish rather than from the cheapest price, so a 3p
 * difference does not draw as a bar twice the length of another.
 *
 * Every row keeps how its number was obtained, because a ranking built partly
 * from AI-read prices should not present itself as evenly reliable.
 */
export default function LiveShopRanking({ perRetailer = [] }) {
  const ranked = rankShops(perRetailer);
  if (!ranked.length) return null;
  const spread = rankingSpread(ranked);
  const dearest = ranked.at(-1).price || 1;

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Shops ranked
        </p>
        {spread && spread.saving > 0 && (
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {gbp(spread.saving, { always: true })} between best and worst
            {spread.pct !== null ? ` · ${spread.pct}%` : ''}
          </p>
        )}
      </div>

      <ol className="space-y-1.5">
        {ranked.map((row) => (
          <li key={`${row.retailerId}-${row.name}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className="shrink-0 text-[0.6875rem] font-extrabold tabular-nums"
                  style={{ color: row.isCheapest ? 'var(--good)' : 'var(--faint)' }}
                >
                  {row.rank}
                </span>
                <span className="truncate text-[0.78125rem] font-bold">{row.retailer}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="text-[0.8125rem] font-extrabold tabular-nums">{gbp(row.price, { always: true })}</span>
                {row.over > 0 && (
                  <span className="text-[0.6875rem] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                    +{gbp(row.over, { always: true })}{row.overPct !== null ? ` · ${row.overPct}%` : ''}
                  </span>
                )}
              </span>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(10, (row.price / dearest) * 100)}%`,
                  background: row.isCheapest ? 'var(--good)' : 'var(--accent)',
                  opacity: row.isCheapest ? 0.95 : 0.55,
                  transition: 'width 500ms cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
              <span className="min-w-0 truncate">
                {row.name}{row.packSize ? ` · ${row.packSize}` : ''}
                {viaLabel(row.via) ? ` · ${viaLabel(row.via)}` : ''}
              </span>
              {row.isCheapest && <Pill tone="good">cheapest</Pill>}
              <Pill tone={methodTone(row.method)}>{methodLabel(row.method)}</Pill>
              {row.url && (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1"
                  style={{ color: 'var(--accent)' }}
                >
                  <ExternalLink size={11} aria-hidden="true" />
                  <span className="sr-only">{`Open ${row.retailer} page for ${row.name}`}</span>
                  <span aria-hidden="true">open</span>
                </a>
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
