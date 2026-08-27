import { useState } from 'react';
import { Globe, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { shoppingNameKey } from '../lib/shopping.js';
import {
  checkAge, checkLivePricesForList, clearLivePriceCache, methodLabel, methodTone, viaLabel,
} from '../lib/live-prices.js';
import { Card, Pill, Section } from './ui.jsx';

/**
 * Live prices, read from the shops' own search pages when you ask.
 *
 * This is the only place in Forq that fetches a price from a retailer, and it
 * is built to be doubted: every row says which shop it came from, how the
 * number was obtained, and links to the page it was read off. Shops that
 * refused or failed are listed too — a short table with three shops in it
 * means five shops said no, and hiding that would make the comparison look
 * more complete than it is.
 */
export default function LivePriceCheck({ items = [], offlineMode = false, isOnline = true }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (force = false) => {
    if (busy || !items.length || offlineMode || !isOnline) return;
    setBusy(true);
    setError('');
    try {
      setState(await checkLivePricesForList(items, { force }));
    } catch (caught) {
      setError(caught.status === 401
        ? 'Sign in to check live shop prices.'
        : caught.status === 429
          ? 'That is a lot of price checks — try again in an hour.'
          : caught.status === 503
            ? 'Live price checking is switched off on this deployment.'
            : caught.message || 'Live price check failed.');
    } finally {
      setBusy(false);
    }
  };

  const entries = Object.entries(state?.byKey || {});
  const withPrices = entries.filter(([, entry]) => entry?.best);
  const usedAi = entries.some(([, entry]) => entry?.aiUsed);

  return (
    <Section className="rise rise-1" title="Live shop prices">
      <p className="text-[0.75rem] font-semibold mb-3" style={{ color: 'var(--muted)' }}>
        Read from each shop’s public search page at the moment you ask — not a
        retailer feed, and not a quote. Shops that block automated requests or
        price only after you pick a store will say so rather than go missing.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy || !items.length || offlineMode || !isOnline}
          className="press rounded-2xl px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Globe size={14} />
            {offlineMode ? 'Offline mode' : !isOnline ? 'No connection' : busy ? 'Checking shops…' : state ? 'Check again' : 'Check shops for this list'}
          </span>
        </button>
        {state && !busy && (
          <button
            type="button"
            onClick={() => run(true)}
            className="press rounded-2xl border px-3.5 py-2.5 text-[0.8125rem] font-bold"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="inline-flex items-center gap-1.5"><RefreshCw size={13} /> Ignore cache</span>
          </button>
        )}
        {state && (
          <button
            type="button"
            onClick={() => { clearLivePriceCache(); setState(null); setError(''); }}
            className="press rounded-2xl border px-3.5 py-2.5 text-[0.8125rem] font-bold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Clear cache
          </button>
        )}
      </div>

      {error && <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}

      {!state && !busy && !error && (
        <Card className="text-center py-6">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {items.length
              ? 'Checks the first six items on your list across every shop Forq knows, one at a time. Results are cached for three hours.'
              : 'Add items to your list first.'}
          </p>
        </Card>
      )}

      {busy && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Checking shops one at a time so none of them get hammered — this takes a moment.
        </p>
      )}

      {state && !busy && (
        <>
          <p className="text-[0.6875rem] font-semibold mb-2" style={{ color: 'var(--muted)' }}>
            {withPrices.length} of {entries.length} item{entries.length === 1 ? '' : 's'} priced
            {state.fromCache ? ` · ${state.fromCache} from the 3h cache` : ''}
            {' · '}{checkAge(state.checkedAt).label}
          </p>

          {entries.length === 0 ? (
            <Card className="text-center py-6">
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>Nothing to check.</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {items.filter((item) => state.byKey[shoppingNameKey(item.name)]).slice(0, 6).map((item) => {
                const entry = state.byKey[shoppingNameKey(item.name)];
                return (
                  <Card key={item.id || item.name} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                          {entry.error
                            ? entry.error
                            : `${entry.shopsAnswered} of ${entry.shopsChecked} shops answered`}
                        </p>
                      </div>
                      {entry.best && (
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-[1rem]">{gbp(entry.best.price, { always: true })}</p>
                          <p className="text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>{entry.best.retailer}</p>
                        </div>
                      )}
                    </div>

                    {entry.perRetailer?.length > 1 && (
                      <div className="mt-2.5 divide-y" style={{ borderColor: 'var(--line)' }}>
                        {entry.perRetailer.map((row) => (
                          <div key={`${row.retailerId}-${row.name}`} className="flex items-center justify-between gap-3 py-1.5">
                            <div className="min-w-0">
                              <p className="text-[0.75rem] font-bold truncate">{row.retailer}</p>
                              <p className="text-[0.6875rem] font-semibold truncate" style={{ color: 'var(--faint)' }}>
                                {row.name}{row.packSize ? ` · ${row.packSize}` : ''}
                                {viaLabel(row.via) ? ` · ${viaLabel(row.via)}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Pill tone={methodTone(row.method)}>{methodLabel(row.method)}</Pill>
                              <span className="text-[0.8125rem] font-extrabold">{gbp(row.price, { always: true })}</span>
                              {row.url && (
                                <a
                                  href={row.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  aria-label={`Open ${row.retailer} page for ${row.name}`}
                                  style={{ color: 'var(--accent)' }}
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {entry.unanswered?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[0.6875rem] font-bold cursor-pointer" style={{ color: 'var(--muted)' }}>
                          {entry.unanswered.length} shop{entry.unanswered.length === 1 ? '' : 's'} could not be priced
                        </summary>
                        <ul className="mt-1.5 space-y-1">
                          {entry.unanswered.map((shop) => (
                            <li key={shop.retailerId} className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                              <span className="font-bold">{shop.retailer}</span> — {shop.note || shop.status}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {usedAi && (
            <p className="mt-2.5 inline-flex items-start gap-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
              <AlertTriangle size={13} className="mt-px shrink-0" />
              Some prices were read off the page by AI because the shop published no structured price data. Treat those as a hint and confirm at the shelf.
            </p>
          )}
          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            Source: each shop’s own search page via <code className="font-mono">/api/integrations/scrape-prices</code> · robots.txt honoured · signed in, 20 checks/h · cached 3h on device.
          </p>
        </>
      )}
    </Section>
  );
}
