import { useMemo, useState } from 'react';
import { Store, TrendingUp, Search, Info } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { priceHistory } from '../lib/kitchen.js';
import { compareStores, savingsAvailable, shoppingNameKey } from '../lib/shopping.js';
import { fetchObservedForList, observedStaleness, clearObservedPriceCache } from '../lib/observed-prices.js';
import { Card, Pill, Sparkline, Section } from './ui.jsx';
import { Glyph } from './icons.jsx';
import PriceGraphs from './PriceGraphs.jsx';

/**
 * Price comparison, built only from receipts you recorded.
 *
 * There is no price feed behind this app, so a comparison is only as good as
 * what you've actually paid — and it says how much of your list each shop can
 * price rather than quietly totalling two items and calling it a winner.
 */
export default function PriceCompare() {
  const app = useApp();
  const history = useMemo(() => priceHistory(app.shops), [app.shops]);
  const stores = useMemo(() => compareStores(app.shoppingList, app.shops), [app.shoppingList, app.shops]);
  const savings = useMemo(() => savingsAvailable(app.shoppingList, app.shops), [app.shoppingList, app.shops]);
  const best = stores.length ? [...stores].sort((a, b) => b.covered - a.covered || a.total - b.total)[0] : null;
  const [observed, setObserved] = useState(null); // { byKey, checkedAt, fromCache, fetched, error } | null
  const [observedBusy, setObservedBusy] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const fetchObserved = async () => {
    if (!app.shoppingList.length || observedBusy || app.shoppingPreferences?.offlineMode) return;
    setObservedBusy(true);
    try {
      const result = await fetchObservedForList(app.shoppingList);
      setObserved(result);
    } catch (error) {
      setObserved({ byKey: {}, checkedAt: new Date().toISOString(), error: error.status === 401 ? 'Sign in to check community observations.' : error.status === 429 ? 'Too many checks — try again in a few minutes.' : (error.message || 'Community observations unavailable.') });
    } finally {
      setObservedBusy(false);
    }
  };

  return (
    <>
      <Section className="rise rise-1" title="This list, shop by shop">
        {stores.length === 0 ? (
          <Card className="text-center py-8">
            <Store size={28} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
            <p className="font-bold">No comparison yet</p>
            <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Record a shop with prices against the items and Forq can price the same list
              at every shop you've been to. Nothing is fetched from anywhere.
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {stores.map((row) => (
              <Card key={row.store} className="flex items-center justify-between !p-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-[0.90625rem] truncate">{row.store}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    prices known for {row.covered} of {row.of} item{row.of === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-[1rem]">{gbp(row.total, { always: true })}</p>
                  {best && row.store === best.store && row.covered === best.covered && (
                    <Pill tone="good">best cover</Pill>
                  )}
                </div>
              </Card>
            ))}
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Totals only count items that shop has a price for, so two shops with different
              cover aren’t the same basket.
            </p>
          </div>
        )}
      </Section>

      {app.shoppingList.length > 0 && (
        <Section className="rise rise-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.9375rem] font-bold tracking-tight">Price evidence on your list</h2>
              <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Receipt changes and like-for-like unit values</p>
            </div>
            <button
              type="button"
              onClick={() => setShowEvidence((value) => !value)}
              aria-expanded={showEvidence}
              className="press rounded-xl border px-3 py-2 text-[0.71875rem] font-extrabold"
              style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
            >
              {showEvidence ? 'Hide' : 'Show'}
            </button>
          </div>
          {showEvidence && (
            <>
              <Card className="mt-3 !p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
                {app.shoppingList.map((item) => {
                  const insight = app.shoppingInsights?.byId?.[item.id] || {};
                  const change = insight.priceChange;
                  const unit = insight.unitPrices;
                  const bestUnit = unit?.best?.unitPrice;
                  const bestSource = unit?.best?.store || unit?.best?.source;
                  const tone = insight.price?.level === 'high' ? 'good' : insight.price?.level === 'medium' ? 'accent' : insight.price?.level === 'low' ? 'warn' : 'muted';
                  return (
                    <div key={item.id} className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-bold text-[0.84375rem]">{item.name}</p>
                        <Pill tone={tone}>{insight.price?.label || 'No price'}</Pill>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {change?.status === 'tracked' && change.pct !== null
                          ? <span style={{ color: change.direction === 'up' ? 'var(--danger)' : change.direction === 'down' ? 'var(--good)' : 'var(--muted)' }}>{change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '·'} {Math.abs(change.pct)}% since the previous receipt</span>
                          : <span>{change?.observations === 1 ? 'One receipt — one more gives a price change.' : 'No recorded price change yet.'}</span>}
                        {unit?.comparable > 1 && bestUnit
                          ? <span>Best like-for-like: £{bestUnit.value.toFixed(2)} / {bestUnit.unit}{bestSource ? ` · ${bestSource}` : ''}</span>
                          : <span>Unit value needs a matching, readable quantity.</span>}
                      </div>
                    </div>
                  );
                })}
              </Card>
              <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                Confidence separates recorded receipts from entered, observed and estimated prices. Unit comparisons never cross mass, volume or count scales.
              </p>
            </>
          )}
        </Section>
      )}

      <Section className="rise rise-1" title="Community observed prices">
        <p className="text-[0.75rem] font-semibold mb-3" style={{ color: 'var(--muted)' }}>
          Honest, dated observations from Open Prices — people who shopped and reported what they paid. Not a live supermarket feed; dates and staleness are shown so you can judge.
        </p>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={fetchObserved} disabled={observedBusy || !app.shoppingList.length || app.shoppingPreferences?.offlineMode} className="press rounded-2xl px-4 py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            <span className="inline-flex items-center gap-1.5"><Search size={14} /> {app.shoppingPreferences?.offlineMode ? 'Offline mode' : observedBusy ? 'Checking…' : observed ? 'Check again' : 'Check community prices for this list'}</span>
          </button>
          {observed && (
            <button type="button" onClick={() => { clearObservedPriceCache(); setObserved(null); }} className="press rounded-2xl border px-4 text-[0.8125rem] font-bold" style={{ borderColor: 'var(--line)' }}>Clear cache</button>
          )}
        </div>
        {!observed && !observedBusy && (
          <Card className="text-center py-6">
            <Info size={22} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.shoppingPreferences?.offlineMode ? 'Offline shopping mode is on. Your recorded receipts and unit values remain available without a network lookup.' : app.shoppingList.length ? 'Tap check to look up dated GBP observations for up to 12 items on this list. Nothing is fetched until you ask.' : 'Add items to your list first.'}
            </p>
          </Card>
        )}
        {observedBusy && <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Checking community observations — up to 12 items, cached 24h.</p>}
        {observed?.error && <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--danger)' }}>{observed.error}</p>}
        {observed && !observed.error && (
          <>
            <p className="text-[0.6875rem] font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              {Object.keys(observed.byKey).length} item{Object.keys(observed.byKey).length === 1 ? '' : 's'} with an observation{observed.fromCache ? ` · ${observed.fromCache} from 24h cache` : ''} · checked {new Date(observed.checkedAt).toLocaleString('en-GB')} — community observed, not live.
            </p>
            {Object.keys(observed.byKey).length === 0 ? (
              <Card className="text-center py-6">
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>No GBP observations found for this list. Your receipt prices remain the primary comparison.</p>
              </Card>
            ) : (
              <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
                {app.shoppingList.filter((item) => observed.byKey[shoppingNameKey(item.name)]).map((item) => {
                  const entry = observed.byKey[shoppingNameKey(item.name)];
                  const stale = entry?.observedAt ? observedStaleness(entry.observedAt) : null;
                  const tone = stale?.tone === 'good' ? 'good' : stale?.tone === 'warn' ? 'warn' : stale?.tone === 'danger' ? 'danger' : 'muted';
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                          {entry?.store || 'Shop not named'}{entry?.location ? ` · ${entry.location}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {typeof entry?.price === 'number' ? (
                          <>
                            <p className="font-extrabold text-[0.9375rem]">{gbp(entry.price, { always: true })}</p>
                            <Pill tone={tone}>{stale?.label || 'observed'}</Pill>
                          </>
                        ) : (
                          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{entry?.error || 'No observation'}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
            <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
              Source: Open Prices (community observed) via <code className="font-mono">/api/integrations/prices</code> · 30 rows max per lookup · authenticated, 120/h · cached 24h on device · old rows are dated and may be out of date.
            </p>
          </>
        )}
      </Section>

      {savings.length > 0 && (
        <Section className="rise rise-2" title="Cheaper elsewhere, going by your receipts">
          <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
            {savings.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-bold text-[0.875rem] truncate">{s.name}</p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    you’ve paid {gbp(s.best, { always: true })} at {s.store}
                  </p>
                </div>
                <Pill tone="good">save {gbp(s.saving, { always: true })}</Pill>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <PriceGraphs history={history} />

      <Section className="rise rise-2" title="All tracked products — latest snapshot">
        {history.length === 0 ? (
          <Card className="text-center py-8">
            <TrendingUp size={28} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
            <p className="font-bold">No products with prices yet</p>
            <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Put prices against items as you shop — the graphs above and this list both come from the same receipts.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((p) => (
              <Card key={p.name}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[0.90625rem] flex items-center gap-1.5">
                      <Glyph e={p.emoji} size={15} style={{ color: 'var(--muted)' }} /> {p.name}
                    </p>
                    <p className="text-[0.8125rem] font-bold mt-0.5">
                      {gbp(p.latest, { always: true })}
                      {p.change !== null && (
                        <span
                          className="ml-1.5 text-[0.71875rem] font-bold"
                          style={{ color: p.change > 0 ? 'var(--danger)' : p.change < 0 ? 'var(--good)' : 'var(--faint)' }}
                        >
                          {p.change > 0 ? `▲ ${gbp(p.change, { always: true })}` : p.change < 0 ? `▼ ${gbp(-p.change, { always: true })}` : '· flat'}
                        </span>
                      )}
                    </p>
                  </div>
                  {p.prices.length > 1 && <Sparkline points={p.prices} />}
                </div>
                <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {p.times === 1
                    ? 'Bought once — buy it again to see a trend.'
                    : `Bought ${p.times} times · cheapest ${gbp(p.best, { always: true })}${p.bestStore ? ` at ${p.bestStore}` : ''}`}
                  {p.latestDate && ` · last paid ${p.latestDate}${p.latestStore ? ` at ${p.latestStore}` : ''}`}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
