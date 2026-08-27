import { ExternalLink } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { methodLabel, methodTone, rankShops, rankingSpread, viaLabel } from '../lib/live-prices.js';
import { Pill } from './ui.jsx';

/**
 * The shops for one food item, cheapest first.
 *
 * Ordered by what the thing actually costs per unit, not by the number on the
 * shelf edge. A 1.13L bottle at 85p beats a 2.27L bottle at £1.45 on the
 * ticket and loses by 18% a litre; ranking on the ticket hands back the wrong
 * answer with a number attached. Where the sizes will not support that — none
 * given, or mixed scales — it falls back to price and says so, because a
 * silent fallback is a ranking the reader would misread.
 *
 * The bar is the same magnitude idiom the receipt graphs use, drawn on
 * whichever basis the ranking used so its lengths and its order agree.
 *
 * Every row keeps how its number was obtained, because a ranking built partly
 * from AI-read prices should not present itself as evenly reliable. A row
 * found only after the search was widened says so for the same reason: it
 * answers a broader question than the one that was asked.
 */
export default function LiveShopRanking({ perRetailer = [], name }) {
  const ranking = rankShops(perRetailer, { name });
  const ranked = ranking.rows;
  if (!ranked.length) return null;
  const spread = rankingSpread(ranking);
  const byUnit = ranking.basis === 'unit';
  const magnitude = (row) => (byUnit ? row.unit.value : row.price);
  const dearest = magnitude(ranked.at(-1)) || 1;

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          {byUnit ? `Shops ranked per ${ranking.unitLabel}` : 'Shops ranked by price'}
        </p>
        {spread && spread.saving > 0 && (
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {gbp(spread.saving, { always: true })}
            {byUnit ? ` / ${spread.unitLabel}` : ''} between best and worst
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
                {row.unit && (
                  <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: 'var(--muted)' }}>
                    {gbp(row.unit.value, { always: true })}
                    {row.unit.dim === 'count' ? ` ${row.unit.unit}` : ` / ${row.unit.unit}`}
                  </span>
                )}
                {row.over > 0 && (
                  <span className="text-[0.6875rem] font-semibold tabular-nums" style={{ color: 'var(--faint)' }}>
                    +{gbp(row.over, { always: true })}{row.overPct !== null ? ` · ${row.overPct}%` : ''}
                  </span>
                )}
              </span>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(10, (magnitude(row) / dearest) * 100)}%`,
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
              {row.isCheapest && <Pill tone="good">{byUnit ? 'best value' : 'cheapest'}</Pill>}
              <Pill tone={methodTone(row.method)}>{methodLabel(row.method)}</Pill>
              {row.broadened && (
                <span title={`Searched for "${row.searched}"`}>
                  <Pill tone="warn">wider search</Pill>
                </span>
              )}
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

      {ranking.ticketMisleads && ranking.cheapestByTicket && (
        <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
          {ranking.cheapestByTicket.retailer} has the cheaper ticket at{' '}
          {gbp(ranking.cheapestByTicket.price, { always: true })}, but it is the smaller pack —
          {' '}{ranked[0].retailer} is better value per {ranking.unitLabel}.
        </p>
      )}
      {!byUnit && (
        <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          {ranking.mixedScales
            ? 'These packs are sized on different scales — by weight against by count — so they are listed by price rather than ranked by value.'
            : 'Not every shop stated a pack size, so this is ranked on the ticket price. The smaller pack will look cheaper.'}
        </p>
      )}
    </div>
  );
}
