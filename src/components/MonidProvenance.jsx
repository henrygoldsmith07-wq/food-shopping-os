import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { monidLabel } from '../lib/live-prices.js';
import { Pill } from './ui.jsx';

/**
 * What a Monid lookup cost and where its rows came from — in one place.
 *
 * The price table already labels each row by how it was obtained; this panel
 * exists because "paid data" is a different kind of provenance from "read off
 * the page": it draws down a workspace balance, it is one rung for the whole
 * product rather than per shop, and it can be the only answer when every shop
 * refused. So it reports three things, all honestly shaped:
 *
 *  - which of this run's checks went through Monid and what came back
 *  - the miss statuses — disabled, error, no-match — with the reason, because
 *    a silent empty set looks identical to an empty-handed service
 *  - the balance, so the cost side is as visible as the data side
 *
 * `status` comes from GET /api/integrations/monid-status and is fetched
 * lazily and on demand: the panel renders the row-side facts immediately and
 * the balance when it lands. A failed probe renders as "balance unknown",
 * never as zero — an unknown is not a free balance.
 */
export default function MonidProvenance({ results = [] }) {
  const [status, setStatus] = useState(null);

  const loadStatus = useCallback(() => {
    fetch('/api/integrations/monid-status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { configured: false, balance: null }))
      .then((body) => setStatus(body || { configured: false, balance: null }))
      // A probe that could not run at all is an unknown, not a "no": claiming
      // the deployment is unconfigured would be a false statement, and the
      // balance line says "unknown" instead.
      .catch(() => setStatus({ configured: null, balance: null }));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runs = useMemo(() => results
    .map((entry) => ({
      name: entry.name,
      status: entry.monid?.status || 'not-asked',
      provider: entry.monid?.provider || null,
      rows: entry.monid?.rows || 0,
    }))
    .filter((run) => run.status !== 'not-asked'), [results]);

  const priced = runs.filter((run) => run.status === 'ok' && run.rows > 0);
  const missed = runs.filter((run) => run.status !== 'ok');
  const balanceKnown = Boolean(status?.configured === true && typeof status?.balance === 'number');
  // Unknown covers both "probe failed" and "configured but would not say" —
  // either way the honest display is "unknown", never a zero.

  const statusLabel = {
    ok: 'answered',
    'no-match': 'no data for this product',
    disabled: 'not set up',
    error: 'lookup failed',
    timeout: 'lookup timed out',
  };

  if (!runs.length) {
    if (!status?.configured) return null;
    return (
      <p className="mt-2.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Monid is connected{balanceKnown ? ` · ${status.balance} credits of balance left` : ''} —
        it is only asked when the shops alone cannot price an item.
      </p>
    );
  }

  return (
    <div className="mt-2.5">
      <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        <span className="inline-flex items-center gap-1">
          <Database size={11} aria-hidden="true" /> Paid data provenance
        </span>
      </p>

      <ul className="mt-1 space-y-1">
        {priced.map((run) => (
          <li key={run.name} className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {run.name}: Monid ({run.provider || 'unknown endpoint'}) returned {run.rows}
            {' '}price{run.rows === 1 ? '' : 's'} — marked <Pill tone="accent">paid data</Pill> in the
            ranking above, not merged with the scraped rows.
          </li>
        ))}
        {missed.map((run) => (
          <li key={run.name} className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            {run.name}: Monid {statusLabel[run.status] || run.status}.
          </li>
        ))}
      </ul>

      <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        {monidLabel}
        {balanceKnown ? ` · ${status.balance} credits left in the Monid balance` : ''}
        {status && !balanceKnown && status.configured !== false ? ' · balance unknown' : ''}
        {!status ? ' · balance loading…' : ''}
        {' · '}
        <button
          type="button"
          onClick={loadStatus}
          className="inline-flex items-center gap-1 font-bold underline-offset-2 hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          <RefreshCw size={11} aria-hidden="true" /> refresh
        </button>
      </p>

      {status?.configured === false && (
        <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
          Monid reports as unconfigured on this deployment now. Rows marked “paid data” were paid
          for when they were fetched; the balance they drew down is not visible from here.
        </p>
      )}
    </div>
  );
}
