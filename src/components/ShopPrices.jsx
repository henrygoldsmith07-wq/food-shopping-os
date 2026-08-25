import { Card, Pill, Section } from './ui.jsx';
import { clearObservedPriceCache } from '../lib/observed-prices.js';

/**
 * What this list is likely to cost, and how sure that is.
 *
 * Two sources, kept apart on purpose. Your own receipts are primary: a rise or
 * a bargain is measured against what you actually paid before. Community
 * observations are dated context fetched only when asked for, never a live
 * quote, and the copy says so every time they are shown.
 */
export default function ShopPrices({
  app, visibleList, checkObservedPrices, observedBusy, observedByKey, observedError, observedMeta,
  setObservedByKey, setObservedMeta, setObservedError, offlineMode, isOnline,
}) {
  // Nothing on the list, nothing to price.
  if (!visibleList.length) return null;

  return (
    <Section className="rise rise-2">
      <Card className="!p-3.5 space-y-2.5">
        {(app.priceAnomalies.rises.length > 0 || app.priceAnomalies.bargains.length > 0) && (
          <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: app.priceAnomalies.rises.length ? 'var(--warn)' : 'var(--line)', background: 'var(--card-2)' }}>
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: app.priceAnomalies.rises.length ? 'var(--warn)' : 'var(--good)' }}>
              {app.priceAnomalies.rises.length > 0 && `${app.priceAnomalies.rises.length} price rise${app.priceAnomalies.rises.length === 1 ? '' : 's'} vs your receipts`}
              {app.priceAnomalies.rises.length > 0 && app.priceAnomalies.bargains.length > 0 ? ' · ' : ''}
              {app.priceAnomalies.bargains.length > 0 && `${app.priceAnomalies.bargains.length} bargain${app.priceAnomalies.bargains.length === 1 ? '' : 's'}`}
              <span className="font-semibold normal-case tracking-normal ml-1" style={{ color: 'var(--muted)' }}>· receipt-only · {app.priceAnomalies.config.risePct}/{app.priceAnomalies.config.bargainPct}%</span>
            </p>
            {(app.priceAnomaliesForList.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {app.priceAnomaliesForList.slice(0, 6).map(({ item, anomaly }) => (
                  <span key={item.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.6875rem] font-bold" style={{ borderColor: anomaly.kind === 'rise' ? 'var(--danger)' : 'var(--good)', color: anomaly.kind === 'rise' ? 'var(--danger)' : 'var(--good)', background: 'var(--card)' }}>
                    {anomaly.kind === 'rise' ? '↗' : '↘'} {item.name} {anomaly.pct > 0 ? `+${anomaly.pct}%` : `${anomaly.pct}%`}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Budget → thresholds are 15% by default and tunable per item.</p>
          </div>
        )}
        {app.couponVault.active > 0 && app.couponsForList.length > 0 && (
          <div className="rounded-2xl border px-3 py-2.5 flex items-center gap-2" style={{ borderColor: 'var(--good)', background: 'var(--card)' }}>
            <Pill tone="good">{app.couponsForList.length} coupon{app.couponsForList.length === 1 ? '' : 's'} match this list</Pill>
            <span className="text-[0.6875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>{app.couponsForList.slice(0, 2).map((h) => h.coupon.label).join(' · ')}{app.couponsForList.length > 2 ? ` +${app.couponsForList.length - 2}` : ''}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-[0.875rem]">Real prices</p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Your receipts are primary. Community observations are dated context — never a live quote.
            </p>
          </div>
          <button type="button" onClick={checkObservedPrices} disabled={observedBusy || offlineMode || !isOnline} className="press shrink-0 rounded-2xl px-3.5 py-2 text-[0.78125rem] font-extrabold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            {offlineMode ? 'Offline mode' : observedBusy ? 'Checking…' : observedByKey ? 'Check again' : 'Check community prices'}
          </button>
        </div>
        {observedError && <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--danger)' }}>{observedError}</p>}
        {observedMeta && !observedError && (
          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {Object.keys(observedByKey || {}).length} item{Object.keys(observedByKey || {}).length === 1 ? '' : 's'} with an observation{observedMeta.fromCache ? ` · ${observedMeta.fromCache} from 24h cache` : ''} · community observed, not live.
          </p>
        )}
        {observedByKey && (
          <button type="button" onClick={() => { clearObservedPriceCache(); setObservedByKey(null); setObservedMeta(null); setObservedError(''); }} className="press mt-2 rounded-full border px-3 py-1 text-[0.6875rem] font-bold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>Clear cached observations</button>
        )}
      </Card>
    </Section>
  );
}
