import { useMemo } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { resolveList } from '../lib/price-resolver.js';
import { Card, Pill, Section } from './ui.jsx';

/**
 * A price for every item, and where each one came from.
 *
 * The live scraper answers for some shops and not others, so on its own it
 * leaves most of a list blank. This fills the list from whatever is actually
 * known — a live scrape, your own receipt, an earlier check, a community
 * report — and then refuses to let those look alike.
 *
 * That last part is the whole design. A six-month-old receipt shown in the
 * same type as a live quote is worse than showing nothing, because a number
 * with no provenance gets trusted. So every row carries its source and its
 * age, the basket total says how much of it is live, and an item nothing is
 * known about says exactly that rather than borrowing a number from elsewhere.
 */
const TONE = { high: 'good', medium: 'accent', low: 'warn', stale: 'danger' };

export default function ResolvedPrices({ items = [], sources = {} }) {
  const view = useMemo(() => resolveList(items, sources), [items, sources]);
  if (!items.length) return null;

  const missing = view.rows.filter((row) => !row.resolved);

  return (
    <Section className="rise rise-1" title="What this list costs">
      <Card className="!p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[1.25rem] font-extrabold tabular-nums">
              {gbp(view.estimatedTotal, { always: true })}
            </p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {view.resolved} of {view.total} item{view.total === 1 ? '' : 's'} priced
              {view.resolved > 0 && ` · ${view.liveShare}% live`}
            </p>
          </div>
          <Pill tone={view.coverage === 100 ? 'good' : view.coverage >= 60 ? 'accent' : 'warn'}>
            {view.coverage}% covered
          </Pill>
        </div>
        {view.resolved > 0 && view.liveShare < 100 && (
          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            Not a checkout total. Only the live rows were read from a shop just now — the rest
            are what you paid before, an earlier check, or a community report, each dated below.
          </p>
        )}
      </Card>

      <div className="mt-2.5 space-y-2">
        {view.rows.map((row) => (
          <Card key={row.item.id || row.name} className="!p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-[0.875rem] truncate">{row.name}</p>
                {row.resolved ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    <Pill tone={TONE[row.confidence.level] || 'muted'}>{row.sourceLabel}</Pill>
                    <span>{row.confidence.label}</span>
                    {row.where && <span>· {row.where}</span>}
                    {row.url && (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ExternalLink size={11} aria-hidden="true" />
                        <span className="sr-only">{`Open the ${row.where} page for ${row.name}`}</span>
                        <span aria-hidden="true">page</span>
                      </a>
                    )}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                    {row.reason}
                  </p>
                )}
              </div>
              {row.resolved && (
                <p className="shrink-0 font-extrabold text-[0.9375rem] tabular-nums">
                  {gbp(row.price, { always: true })}
                </p>
              )}
            </div>

            {row.disagreement && (
              <p className="mt-1.5 inline-flex items-start gap-1.5 text-[0.65625rem] font-semibold" style={{ color: 'var(--warn)' }}>
                <AlertTriangle size={11} className="mt-px shrink-0" aria-hidden="true" />
                Sources disagree by more than half. That usually means a search matched a
                different product rather than the price moving — check the page before trusting it.
              </p>
            )}

            {row.alternatives?.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[0.65625rem] font-bold" style={{ color: 'var(--muted)' }}>
                  {row.alternatives.length} other source{row.alternatives.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {row.alternatives.map((alt) => (
                    <li key={`${alt.source}-${alt.price}`} className="flex justify-between gap-3 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
                      <span className="truncate">
                        {alt.sourceLabel} · {alt.confidence.label}{alt.where ? ` · ${alt.where}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">{gbp(alt.price, { always: true })}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          {missing.length} item{missing.length === 1 ? ' has' : 's have'} no price from any source yet.
          Nothing is guessed to fill the gap — a made-up number would look exactly like a real one.
        </p>
      )}
    </Section>
  );
}
