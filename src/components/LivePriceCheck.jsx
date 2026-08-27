import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { shoppingNameKey } from '../lib/shopping.js';
import {
  checkAge, checkLivePricesForList, clearLivePriceCache, coverageFor,
} from '../lib/live-prices.js';
import {
  clearLivePriceHistory, historyFor, loadLivePriceHistory, recordLivePrices,
} from '../lib/live-price-history.js';
import { liveMovements } from '../lib/live-price-alerts.js';
import {
  dailyCheckDue, dailyCheckSettings, recordDailyCheck, setDailyCheckEnabled,
} from '../lib/daily-price-check.js';
import { brandedAlternatives, tagsForItem } from '../lib/food-tags.js';
import { applyTagView, isAllergenTag, popularTags } from '../lib/food-tag-filters.js';
import { Card, Section } from './ui.jsx';
import LiveShopRanking from './LiveShopRanking.jsx';
import ShopLinks from './ShopLinks.jsx';
import LivePriceHistory from './LivePriceHistory.jsx';
import FoodTags from './FoodTags.jsx';
import FoodTagFilters from './FoodTagFilters.jsx';
import BrandedSuggestions from './BrandedSuggestions.jsx';
import PriceWatch from './PriceWatch.jsx';

/**
 * Live prices, read from the shops' own search pages when you ask.
 *
 * The only place in Forq that fetches a price from a retailer, and built to be
 * doubted: every row says which shop it came from, how the number was
 * obtained, and links to the page it was read off. Shops that refused or
 * failed are listed too — a short table with three shops in it means five
 * shops said no, and hiding that would make the comparison look more complete
 * than it is.
 *
 * Every item on the list is checked, not a sample. Each check is also kept, so
 * asking repeatedly builds the price history charted under each item.
 */
export default function LivePriceCheck({
  items = [], offlineMode = false, isOnline = true, allergens = [], purchaseCounts = {},
  alertConfig = {}, onChecked,
}) {
  const [state, setState] = useState(null);
  const [history, setHistory] = useState(() => loadLivePriceHistory());
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [sort, setSort] = useState('price');
  const [daily, setDaily] = useState(() => dailyCheckSettings());
  const abortRef = useRef(null);
  // A check that has already been started must not be started again by a
  // re-render: `busy` flips a tick too late to guard the effect below.
  const autoRef = useRef(false);

  const run = async (force = false) => {
    if (busy || !items.length || offlineMode || !isOnline) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setProgress({ done: 0, total: items.length, name: null });
    try {
      const result = await checkLivePricesForList(items, {
        force,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setState(result);
      // Keep the run, so checking again next week draws a line rather than
      // replacing today's answer with no memory of the last one.
      recordLivePrices(result.byKey);
      setHistory(loadLivePriceHistory());
      // A manual check counts as today's check. Otherwise opening the app
      // after checking by hand would immediately check the same list again.
      const rows = Object.values(result.byKey || {});
      setDaily(recordDailyCheck({ priced: rows.filter((row) => row?.best).length, total: rows.length }));
      // Tell the resolver above that there is fresh evidence to fold in.
      onChecked?.();
    } catch (caught) {
      setError(caught.status === 401
        ? 'Sign in to check live shop prices.'
        : caught.status === 429
          ? 'That is a lot of price checks — try again in an hour.'
          : caught.status === 503
            ? 'Live price checking is switched off on this deployment.'
            : caught.message || 'Live price check failed.');
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const stop = () => abortRef.current?.abort();

  const due = dailyCheckDue({
    online: isOnline, offlineMode, itemCount: items.length, settings: daily,
  });

  // The daily check, such as it can be in a local-first app: there is no
  // server holding the list, so "daily" means the first time the app is open
  // on a day when a check is owed. Once per mount, never on a re-render.
  useEffect(() => {
    if (!due.due || autoRef.current) return;
    autoRef.current = true;
    run(false);
    // Only the due decision should be able to start a run; `run` is recreated
    // every render and would restart this on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due.due]);

  const toggleDaily = (on) => {
    const next = setDailyCheckEnabled(on);
    setDaily(next);
    // Turning it on should do the thing it promises, not wait until tomorrow.
    if (on) autoRef.current = false;
  };

  // Movements are read from the stored history rather than from this run, so
  // the warnings survive a reload and are there before anything is checked.
  const movements = useMemo(() => liveMovements(history, alertConfig), [history, alertConfig]);

  const entries = Object.entries(state?.byKey || {});
  const priced = entries.filter(([, entry]) => entry?.best);
  const usedAi = entries.some(([, entry]) => entry?.aiUsed);
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const coverage = coverageFor(state?.byKey);

  // Tags are derived from the result, the item's own price history and the
  // household's declared allergies — never fetched, so this stays cheap enough
  // to recompute whenever the results change.
  const tagged = useMemo(() => items
    .filter((item) => state?.byKey?.[shoppingNameKey(item.name)])
    .map((item) => {
      const entry = state.byKey[shoppingNameKey(item.name)];
      const derived = tagsForItem({
        name: item.name,
        perRetailer: entry.perRetailer || [],
        history: historyFor(history, item.name),
        allergens,
        purchaseCount: purchaseCounts[shoppingNameKey(item.name)] || 0,
      });
      return {
        ...derived,
        item,
        entry,
        perRetailer: entry.perRetailer || [],
        // Only worth offering where the shops could not price what was asked.
        suggestions: entry.best ? [] : brandedAlternatives(item.name),
      };
    }), [items, state, history, allergens, purchaseCounts]);

  const offered = useMemo(() => popularTags(tagged), [tagged]);
  const view = useMemo(() => applyTagView(tagged, {
    selected: selected.filter((id) => !isAllergenTag(id)),
    excludeAllergens: selected.filter(isAllergenTag),
    sort,
  }), [tagged, selected, sort]);

  const toggleTag = (id) => setSelected((current) => (
    current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]
  ));

  return (
    <>
      <Section className="rise rise-1" title="Live shop prices">
        <p className="text-[0.75rem] font-semibold mb-3" style={{ color: 'var(--muted)' }}>
          Read from each shop’s public search page at the moment you ask — not a
          retailer feed, and not a quote. Every item on your list is checked, and
          each check is kept so a price trend builds up over time.
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
              <Globe size={14} aria-hidden="true" />
              {offlineMode ? 'Offline mode' : !isOnline ? 'No connection' : busy ? 'Checking shops…' : state ? 'Check again' : `Check all ${items.length} item${items.length === 1 ? '' : 's'}`}
            </span>
          </button>
          {busy && (
            <button
              type="button"
              onClick={stop}
              className="press rounded-2xl border px-3.5 py-2.5 text-[0.8125rem] font-bold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><X size={13} aria-hidden="true" /> Stop</span>
            </button>
          )}
          {state && !busy && (
            <button
              type="button"
              onClick={() => run(true)}
              className="press rounded-2xl border px-3.5 py-2.5 text-[0.8125rem] font-bold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><RefreshCw size={13} aria-hidden="true" /> Ignore cache</span>
            </button>
          )}
          {state && !busy && (
            <button
              type="button"
              onClick={() => {
                clearLivePriceCache();
                clearLivePriceHistory();
                setState(null);
                setHistory({});
                setError('');
              }}
              className="press rounded-2xl border px-3.5 py-2.5 text-[0.8125rem] font-bold"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              Clear cache & history
            </button>
          )}
        </div>

        {error && <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}

        {busy && progress && (
          <div className="mb-3">
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: 'var(--accent)', transition: 'width 300ms ease' }}
              />
            </div>
            <p role="status" className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Checked {progress.done} of {progress.total} — a few shops at a time, one request each, so none get hammered.
            </p>
          </div>
        )}

        {!state && !busy && !error && (
          <Card className="text-center py-6">
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {items.length
                ? 'Checks every item on your list across every shop Forq knows. Results are cached for three hours, so checking again is cheap.'
                : 'Add items to your list first.'}
            </p>
          </Card>
        )}

        {state && !busy && (
          <>
            <p className="text-[0.6875rem] font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              {priced.length} of {entries.length} item{entries.length === 1 ? '' : 's'} priced
              {coverage.pct !== null ? ` · ${coverage.pct}%` : ''}
              {state.fromCache ? ` · ${state.fromCache} from the 3h cache` : ''}
              {state.aborted ? ' · stopped early' : ''}
              {' · '}{checkAge(state.checkedAt).label}
            </p>

            {/* Where the misses went. A hit rate with no breakdown is a number
                nobody can act on: shops that are down and shops that refuse to
                be read are the same figure and different problems entirely. */}
            {coverage.unpriced > 0 && (
              <p className="text-[0.6875rem] font-semibold mb-2" style={{ color: 'var(--faint)' }}>
                {coverage.unpriced} unpriced —{' '}
                {coverage.reasons.map((row) => `${row.count} × ${row.label}`).join(' · ')}
              </p>
            )}
            {coverage.broadened > 0 && (
              <p className="text-[0.6875rem] font-semibold mb-2" style={{ color: 'var(--faint)' }}>
                {coverage.broadened} found only after widening the search — worth checking against the shelf.
              </p>
            )}

            {entries.length === 0 ? (
              <Card className="text-center py-6">
                <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>Nothing to check.</p>
              </Card>
            ) : (
              <div className="space-y-2.5">
                <FoodTagFilters
                  tags={offered}
                  selected={selected}
                  onToggle={toggleTag}
                  onClear={() => setSelected([])}
                  sort={sort}
                  onSort={setSort}
                  shown={view.shown}
                  total={view.total}
                />
                {view.items.length === 0 && (
                  <Card className="text-center py-6">
                    <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      No item matches every filter. Clear one to widen it — filters combine, so each extra tag narrows the list further.
                    </p>
                  </Card>
                )}
                {view.items.map(({ item, entry, tags, suggestions }) => {
                  const past = historyFor(history, item.name);
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
                            <p className="font-extrabold text-[1rem] tabular-nums">{gbp(entry.best.price, { always: true })}</p>
                            <p className="text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>{entry.best.retailer}</p>
                          </div>
                        )}
                      </div>

                      <FoodTags tags={tags} />

                      <BrandedSuggestions
                        suggestions={suggestions}
                        disabled={offlineMode || !isOnline}
                      />

                      <LiveShopRanking perRetailer={entry.perRetailer} />

                      {entry.unanswered?.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-[0.6875rem] font-bold cursor-pointer" style={{ color: 'var(--muted)' }}>
                            {entry.unanswered.length} shop{entry.unanswered.length === 1 ? '' : 's'} could not be priced
                          </summary>
                          <ul className="mt-1.5 space-y-1">
                            {entry.unanswered.map((shop) => (
                              <li key={shop.retailerId} className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                                {/* Still a link. The shop declined our reader,
                                    not the person holding the phone. */}
                                {shop.url ? (
                                  <a
                                    href={shop.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="font-bold"
                                    style={{ color: 'var(--accent)' }}
                                  >
                                    {shop.retailer}
                                    <span className="sr-only">{` — search ${shop.retailer} for ${item.name} yourself`}</span>
                                  </a>
                                ) : <span className="font-bold">{shop.retailer}</span>}
                                {' — '}{shop.note || shop.status}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      <ShopLinks links={entry.shopLinks} name={item.name} />

                    <LivePriceHistory entry={past} />
                    </Card>
                  );
                })}
              </div>
            )}

            {usedAi && (
              <p className="mt-2.5 inline-flex items-start gap-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
                <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden="true" />
                Some prices were read off the page by AI because the shop published no structured price data. Treat those as a hint and confirm at the shelf.
              </p>
            )}
            <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
              Source: each shop’s own search page via <code className="font-mono">/api/integrations/scrape-prices</code> · robots.txt honoured · signed in, 60 requests/h · cached 3h · history kept on this device only.
            </p>
          </>
        )}
      </Section>

      <PriceWatch
        movements={movements}
        dailyEnabled={daily.enabled}
        onToggleDaily={toggleDaily}
        dueLabel={due.label}
        settings={daily}
        busy={busy}
      />
    </>
  );
}
