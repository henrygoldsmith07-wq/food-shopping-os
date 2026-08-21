import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, Building2, Check, CloudOff, Copy, MapPin, Mic, Package, Plus, Receipt, RotateCcw, ScanLine, ShoppingCart, Star, Tag,
  Trash2, TrendingUp, TriangleAlert, X,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Glyph } from './icons.jsx';
import { gbp, cx, prettyDate } from '../lib/utils.js';
import { AISLE_ORDER, COMMON_STORES, checkedTotalOf } from '../data/stores.js';
import {
  basketProjection, dealQuality, groupForStore, parseVoiceShopping, recurringStaples, shoppingNameKey,
} from '../lib/shopping.js';
import { AISLE_ORDER as ALL_AISLES } from '../data/stores.js';
import { clearObservedPriceCache, fetchObservedForList } from '../lib/observed-prices.js';
import { haptic } from '../lib/haptics.js';
import { gbp as gbpFmt } from '../lib/utils.js';
import ReceiptScan from './ReceiptScan.jsx';
import {
  Section, Card, Empty, Meter, Chip, GestureMenu, Pill, Sheet,
} from './ui.jsx';
import PrimaryAction from './PrimaryAction.jsx';
import PriceCompare from './PriceCompare.jsx';
import { AddItem, FinishShop } from './ShopForms.jsx';
import OffersPanel from './OffersPanel.jsx';
import BarcodeAdd from './BarcodeAdd.jsx';
import BudgetPanel from './BudgetPanel.jsx';
import StoreIntegrations from './StoreIntegrations.jsx';
import ShoppingListRow from './ShoppingListRow.jsx';
import RestockSection from './RestockSection.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';
import { useShoppingSession } from '../lib/shopping-session.js';
import ShoppingProgress from './ShoppingProgress.jsx'; import CloudSyncRow from './CloudSyncRow.jsx';
import ShoppingExport from './ShoppingExport.jsx';

/* ---------- Tab ---------- */

export default function ShopTab({ quickAddKey = 0, onOpenPantry }) {
  const app = useApp();
  const shoppingSession = useShoppingSession();
  const store = shoppingSession.store;
  const [view, setView] = useState('list'); // list · history · prices · stores · budget
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState(null); // finish · offers · scan · export
  const [voiceStatus, setVoiceStatus] = useState('');
  const [dragging, setDragging] = useState(null);
  const [repeatedShopId, setRepeatedShopId] = useState('');
  const [routeEditor, setRouteEditor] = useState(false);
  const [routeOrder, setRouteOrder] = useState([]);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [observedByKey, setObservedByKey] = useState(null); // { [shoppingNameKey]: observedPrice } | null
  const [observedBusy, setObservedBusy] = useState(false);
  const [observedError, setObservedError] = useState('');
  const [observedMeta, setObservedMeta] = useState(null); // { checkedAt, fromCache, fetched }
  const shoppingMode = shoppingSession.active;
  const largeTouch = Boolean(app.shoppingPreferences?.largeTouch);
  const offlineMode = Boolean(app.shoppingPreferences?.offlineMode);

  useEffect(() => {
    if (quickAddKey) {
      setView('list');
      setAdding(true);
    }
  }, [quickAddKey]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const list = app.shoppingList;
  const lastShop = app.shops.at(-1);
  const repeatedLastShop = Boolean(lastShop?.id && repeatedShopId === lastShop.id);
  const stores = useMemo(() => [...new Set([
    ...app.shops.map((s) => s.store),
    ...list.map((item) => item.store).filter(Boolean),
  ])], [app.shops, list]);
  const storeChoices = useMemo(() => [...new Set([...stores, ...COMMON_STORES])].slice(0, 8), [stores]);
  const visibleList = useMemo(() => (store ? list.filter((item) => item.store === store) : list), [list, store]);
  const grouped = useMemo(
    () => groupForStore(visibleList, { store, routes: app.storeRoutes, memory: app.aisleMemory }),
    [visibleList, store, app.storeRoutes, app.aisleMemory],
  );

  const basket = useMemo(() => (store
    ? basketProjection(visibleList, {
      budget: app.weeklyBudget,
      spent: app.spentThisWeek,
      offers: app.offers,
      store,
      today: app.day,
    })
    : app.basket), [store, visibleList, app.weeklyBudget, app.spentThisWeek, app.offers, app.day, app.basket]);
  const ticked = visibleList.filter((i) => i.checked).length;
  const checkedTotal = checkedTotalOf(visibleList);
  const known = store && app.storeRoutes[store];
  const staples = useMemo(
    () => recurringStaples(app.shops, app.pantry, list, { today: app.day }),
    [app.shops, app.pantry, list, app.day],
  );
  const staplesDue = staples.filter((s) => s.dueNow);
  // Honest offers: a multibuy that can't fire on this list says so instead of
  // printing a saving nobody can get.
  const honestOffers = useMemo(
    () => app.offers.map((offer) => ({ offer, quality: dealQuality(offer, visibleList, { today: app.day }) })),
    [app.offers, visibleList, app.day],
  );
  const openRouteEditor = () => {
    setRouteOrder(known || ALL_AISLES);
    setRouteEditor(true);
  };
  const saveRoute = () => {
    if (store) {
      app.setStoreRoute(store, routeOrder);
      setRouteEditor(false);
    }
  };
  const moveAisle = (index, dir) => {
    setRouteOrder((order) => {
      const target = index + dir;
      if (target < 0 || target >= order.length) return order;
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const asText = () => {
    const lines = grouped.map(([aisle, items]) =>
      `${aisle}\n${items.map((i) => `- ${i.name}${i.qty ? ` (${i.qty})` : ''}`).join('\n')}`);
    return `Shopping list${store ? ` · ${store}` : ''}\n\n${lines.join('\n\n')}`;
  };

  const voiceAdd = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setVoiceStatus('Voice input is not supported by this browser.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.onresult = (event) => {
      const parsed = parseVoiceShopping(event.results[0][0].transcript);
      if (!parsed.items.length) {
        setVoiceStatus('Could not find an item — try “add milk and bananas”.');
        return;
      }
      app.addToList(parsed.items.map((item) => ({ ...item, store })));
      setVoiceStatus(parsed.items.length === 1 ? `Added “${parsed.items[0].name}”.` : `Added ${parsed.items.length} items.`);
    };
    recognition.onerror = () => setVoiceStatus('Could not hear that — try again.');
    recognition.start();
    setVoiceStatus('Listening…');
  };

  const repeatLastShop = () => {
    if (repeatedLastShop) return window.scrollTo({ top: 0, behavior: 'smooth' });
    app.repeatLastShop();
    shoppingSession.start(lastShop?.store || '');
    setRepeatedShopId(lastShop?.id || '');
  };

  const checkObservedPrices = async () => {
    if (!visibleList.length || observedBusy || offlineMode || !isOnline) return;
    setObservedBusy(true);
    setObservedError('');
    try {
      const result = await fetchObservedForList(visibleList);
      setObservedByKey(result.byKey);
      setObservedMeta({ checkedAt: result.checkedAt, fromCache: result.fromCache, fetched: result.fetched });
    } catch (error) {
      setObservedError(error.status === 401 ? 'Sign in to check community observations.' : error.status === 429 ? 'Too many checks — try again in a few minutes.' : (error.message || 'Community observations unavailable.'));
    } finally {
      setObservedBusy(false);
    }
  };

  if (!app.householdAccess.shopping) {
    return (
      /* The shared header already says "Shop" — a second <h1> here would be
         two page titles on one screen. */
      <div className="pb-6 pt-2">
        <Section>
          <Empty Icon={ShoppingCart} title={`Shopping is off for ${app.activeMember?.name}`}>
            An adult can change this profile’s household permissions from the avatar in the
            top corner, under Household.
          </Empty>
        </Section>
      </div>
    );
  }

  return (
    <div className={cx('pb-6 space-y-6', shoppingMode && largeTouch && 'shopping-large-touch')}><CloudSyncRow />
      {/* The shared header carries the title now. Five views don't fit a
          320px phone on one line, so this scrolls rather than pushing the
          whole page sideways. */}
      <div className="hero-gradient pt-1 pb-3">
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar px-5 rise rise-1">
          {[['list', 'List', ShoppingCart], ['history', 'Shops', Receipt], ['prices', 'Prices', TrendingUp], ['stores', 'Stores', Building2], ['budget', 'Budget', Banknote]].map(([k, label, Icon]) => (
            <Chip key={k} active={view === k} onClick={() => {
              setView(k);
              if (k === 'prices') recordProductEvent('price_comparison_opened');
            }}>
              <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
            </Chip>
          ))}
        </div>
      </div>

      {view === 'list' && (
        <>
          <Section className="rise rise-1">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                    {shoppingMode ? 'Running total' : 'Estimated basket'}
                  </p>
                  <p className="text-[1.5rem] font-extrabold">
                    {/* Keyed on the value, so a changed total animates in
                        instead of silently swapping under your eyes. */}
                    <span key={shoppingMode ? checkedTotal : basket.projected} className="count-up inline-block">
                      {gbp(shoppingMode ? checkedTotal : basket.projected, { always: true })}
                    </span>
                    {shoppingMode && (
                      <span className="text-[0.8125rem] font-semibold ml-1.5" style={{ color: 'var(--muted)' }}>
                        of {gbp(basket.projected, { always: true })}
                      </span>
                    )}
                  </p>
                  {basket.saved > 0 && (
                    <p className="text-[0.75rem] font-bold" style={{ color: 'var(--good)' }}>
                      {gbp(basket.total, { always: true })} less {gbp(basket.saved, { always: true })} of your offers
                    </p>
                  )}
              {basket.unpriced > 0 && (
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {basket.unpriced} item{basket.unpriced === 1 ? '' : 's'} with no price yet — the total is only what you’ve typed in.
                </p>
              )}
              {onOpenPantry && app.pantry.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenPantry}
                  className="press mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  <Package size={13} /> Check pantry before buying <span className="font-semibold">· {app.pantry.length} items</span>
                </button>
              )}
                </div>
                {/* Starting a shop is the primary action at the bottom of the
                    screen now; only the way out of it belongs up here. */}
                {shoppingMode && (
                  <button
                    onClick={shoppingSession.stop}
                    className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold shrink-0"
                    style={{ background: 'var(--card-2)', color: 'var(--ink)' }}
                  >
                    <span className="inline-flex items-center gap-1.5"><X size={14} /> Exit mode</span>
                  </button>
                )}
              </div>

              {app.weeklyBudget > 0 ? (
                <div className="mt-3">
                  <Meter
                    value={basket.spent + (shoppingMode ? checkedTotal : basket.projected)}
                    max={app.weeklyBudget}
                    color={basket.over ? 'var(--warn)' : 'var(--accent)'}
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    <span>{gbp(basket.spent, { always: true })} spent this week</span>
                    <span className="inline-flex items-center gap-1" style={basket.over ? { color: 'var(--warn)', fontWeight: 700 } : {}}>
                      {basket.over && <TriangleAlert size={12} />}
                      {basket.over
                        ? `${gbp(Math.abs(basket.left), { always: true })} over budget`
                        : `${gbp(basket.left, { always: true })} headroom`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Set a weekly budget in your profile to see headroom here.
                </p>
              )}

              {shoppingMode && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[0.71875rem] font-bold" style={{ color: isOnline ? 'var(--good)' : 'var(--warn)' }}>
                  {isOnline ? <Check size={12} /> : <CloudOff size={12} />}
                  {offlineMode
                    ? 'Offline shopping mode · the list and aisle route stay available locally.'
                    : isOnline ? 'Online · changes save locally and sync when available.' : 'Offline · changes save locally; sync resumes when you reconnect.'}
                </p>
              )}

              {shoppingMode && <ShoppingProgress total={visibleList.length} checked={ticked} />}

              {shoppingMode && (
                <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={largeTouch} onClick={() => app.setShoppingPreferences({ largeTouch: !largeTouch })}>
                      {largeTouch ? 'Large-touch UI on' : 'Large-touch UI'}
                    </Chip>
                    <Chip active={offlineMode} onClick={() => app.setShoppingPreferences({ offlineMode: !offlineMode })}>
                      {offlineMode ? 'Offline mode on' : 'Offline mode'}
                    </Chip>
                  </div>
                  <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {app.shoppingInsights?.shared
                      ? <>
                        {app.cloudStatus?.kind === 'live' ? 'Shared live list · household changes appear here.' : 'Shared list · changes save locally and sync when available.'}
                        {app.shoppingInsights.lastChangedBy && <span> · Last change by {app.members.find((member) => member.id === app.shoppingInsights.lastChangedBy)?.name || app.shoppingInsights.lastChangedBy}</span>}
                      </>
                      : 'Private list · add household members to share it live.'}
                  </p>
                </div>
              )}
              {!shoppingMode && app.shoppingInsights?.shared && (
                <p className="mt-3 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Shared household list · changes sync when available.
                  {app.shoppingInsights.lastChangedBy && <span> Last change by {app.members.find((member) => member.id === app.shoppingInsights.lastChangedBy)?.name || app.shoppingInsights.lastChangedBy}.</span>}
                </p>
              )}

              {ticked > 0 && (
                <button
                  onClick={() => setSheet('finish')}
                  className="press mt-3 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Receipt size={14} /> Finish shop · {ticked} item{ticked === 1 ? '' : 's'}
                  </span>
                </button>
              )}
            </Card>
          </Section>

          {/* Which shop you're walking round: its aisles, in your order */}
          {(stores.length > 0 || list.length > 0) && (
            <Section className="rise rise-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
                  <MapPin size={12} /> Shopping at
                </p>
                {known && <Pill tone="good">your route, learned</Pill>}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <Chip active={!shoppingSession.store} onClick={() => shoppingSession.selectStore('')}>All shops</Chip>
                {storeChoices.map((s) => (
                  <Chip key={s} active={shoppingSession.store === s} onClick={() => shoppingSession.selectStore(s)}>{s}</Chip>
                ))}
              </div>
              {store && (
                <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {known
                    ? `Aisles in the order you walked ${store} last time: ${known.join(' → ')}.`
                    : `No route for ${store} yet — tick items off in the order you find them and it'll remember.`}
                </p>
              )}
              {store && known && (
                <button
                  type="button"
                  onClick={openRouteEditor}
                  className="press mt-1.5 rounded-full border px-3 py-1.5 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> Edit this store's route</span>
                </button>
              )}
              {store && (
                <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {visibleList.length} assigned item{visibleList.length === 1 ? '' : 's'} shown. Add items while this shop is selected to assign them here.
                </p>
              )}
            </Section>
          )}

          <Section className="rise rise-2">
            <div className="grid grid-cols-4 gap-2.5 mb-3">
              <button
                onClick={() => setAdding((v) => !v)}
                className="press col-span-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={adding ? { borderColor: 'var(--line)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {adding ? <><X size={13} /> Close</> : <><Plus size={14} /> Add an item</>}
                </span>
              </button>
              <button
                onClick={() => setSheet('scan')}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex items-center gap-1.5"><ScanLine size={14} /> Scan</span>
              </button>
              <button
                onClick={() => setSheet('offers')}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: app.offers.length ? 'var(--accent)' : 'var(--line)', color: app.offers.length ? 'var(--accent)' : 'var(--ink)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Tag size={14} /> Offers{app.offers.length ? ` (${app.offers.length})` : ''}</span>
              </button>
              <button
                onClick={voiceAdd}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Mic size={14} /> Voice</span>
              </button>
              {/* Receipt capture is an optional tool — manual shop entry always works. */}
              {app.hasTool('receipt') && (
              <button
                onClick={() => setSheet('receipt')}
                className="press col-span-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Receipt size={14} /> Read a receipt</span>
              </button>
              )}
            </div>
            {adding && <AddItem onAdd={(item) => app.addToList({ ...item, store })} />}
            {voiceStatus && <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{voiceStatus}</p>}
          </Section>

          {app.shops.length > 0 && (
            <Section className="rise rise-2">
              <button
                onClick={repeatLastShop}
                className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
                style={{ borderColor: repeatedLastShop ? 'var(--good)' : 'var(--line)', color: repeatedLastShop ? 'var(--good)' : 'var(--ink)' }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {repeatedLastShop ? <><Check size={14} /> Review shopping list</> : <><RotateCcw size={14} /> Repeat your last shop</>}
                </span>
              </button>
            </Section>
          )}

          <RestockSection items={app.restock} store={store} />

          {staplesDue.length > 0 && (
            <Section className="rise rise-2" title="Due — you buy these on a rhythm">
              <p className="text-[0.75rem] font-semibold mb-2.5" style={{ color: 'var(--muted)' }}>
                Read off your own shop history — how often you actually restock, not a guess.
              </p>
              <div className="flex flex-wrap gap-2">
                {staplesDue.slice(0, 8).map((staple) => (
                  <Chip
                    key={staple.name}
                    onClick={() => app.addToList({ name: staple.name, emoji: staple.emoji, qty: '', store })}>
                    <span className="inline-flex items-center gap-1.5">
                      {staple.emoji} {staple.name}
                      <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                        {staple.since} days · every ~{staple.cadence}
                      </span>
                    </span>
                  </Chip>
                ))}
              </div>
              {staples.length > staplesDue.length && (
                <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                  {staples.length - staplesDue.length} more tracked staple{staples.length - staplesDue.length === 1 ? '' : 's'} not due yet.
                </p>
              )}
            </Section>
          )}

          {app.favouriteShopping.length > 0 && (
            <Section className="rise rise-2" title="Favourites">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
                {app.favouriteShopping.map((item) => (
                  <Chip key={shoppingNameKey(item.name)} onClick={() => app.addToList({ ...item, store: store || item.store })}>
                    <span className="inline-flex items-center gap-1.5">
                      <Star size={11} fill="currentColor" /> {item.name}
                    </span>
                  </Chip>
                ))}
              </div>
            </Section>
          )}

          {visibleList.length > 0 && (
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
          )}

          {visibleList.length === 0 ? (
            <Section className="rise rise-2">
              <Card className="text-center py-10">
                <ShoppingCart size={30} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
                <p className="font-bold">{store ? `Nothing assigned to ${store}` : 'Nothing on the list yet'}</p>
                <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {store
                    ? 'Add an item while this shop is selected, or choose All shops to see unassigned items.'
                    : "Add items here, scan a barcode, send a week's meals over from the planner, or flag something as running low in your pantry."}
                </p>
              </Card>
            </Section>
          ) : (
            <Section className="rise rise-2" title={shoppingMode ? `${visibleList.length - ticked} items to go` : 'Your list'}>
              <div className="space-y-4">
                {grouped.map(([aisle, items]) => {
                  const allDone = items.every((i) => i.checked);
                  return (
                    <div key={aisle}>
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: allDone ? 'var(--good)' : 'var(--faint)' }}>
                        {aisle} {allDone && '✓'}
                      </p>
                      <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
                        {items.map((item) => (
                          <ShoppingListRow
                            key={item.id}
                            item={item}
                            onAisle={app.setItemAisle}
                            onStore={app.setItemStore}
                            storeOptions={storeChoices}
                            dragging={dragging}
                            setDragging={setDragging}
                            observedPrice={observedByKey?.[shoppingNameKey(item.name)] || null}
                            largeTouch={largeTouch}
                          />
                        ))}
                      </Card>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setSheet('export')}
                className="press mt-3 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Copy size={14} /> Copy the list as text</span>
              </button>

            </Section>
          )}
        </>
      )}

      {view === 'history' && (
        <Section className="rise rise-1" title="Shops you’ve recorded">
          {app.shops.length === 0 ? (
            <Card className="text-center py-10">
              <Receipt size={30} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
              <p className="font-bold">No shops recorded</p>
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Tick items off as you shop, then hit “Finish shop”. Spending, budget streaks,
                price comparison and your route round each shop all come from these.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {[...app.shops].reverse().map((s) => (
                <Card key={s.id} className="flex items-center justify-between !p-3.5">
                  <div className="min-w-0">
                    <p className="font-bold text-[0.90625rem] truncate">{s.store}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {prettyDate(s.date)} · {s.items.length} item{s.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <p className="font-extrabold text-[1rem] shrink-0">{gbp(s.total, { always: true })}</p>
                </Card>
              ))}
            </div>
          )}
        </Section>
      )}

      {view === 'prices' && <PriceCompare />}
      {view === 'stores' && <StoreIntegrations />}
      {view === 'budget' && <BudgetPanel />}

      <Sheet open={sheet === 'finish'} onClose={() => setSheet(null)} title="Finish shop">
        <FinishShop
          items={visibleList}
          store={store}
          onDone={() => {
            recordProductEvent('shopping_completed', { count: ticked });
            setSheet(null);
            shoppingSession.stop();
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'offers'} onClose={() => setSheet(null)} title="Offers you have">
        <div className="px-5 pb-10 space-y-3">
          <OffersPanel />
          {honestOffers.filter((row) => !row.quality.honest && row.offer.kind === 'multibuy').length > 0 && (
            <Card className="!p-3 space-y-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                Deals that can't fire on this list
              </p>
              {honestOffers.filter((row) => !row.quality.honest && row.offer.kind === 'multibuy').map(({ offer, quality }) => (
                <p key={offer.id} className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {offer.label}: {quality.note}
                </p>
              ))}
            </Card>
          )}
        </div>
      </Sheet>
      <Sheet open={routeEditor} onClose={() => setRouteEditor(false)} title={`Route for ${store || 'this shop'}`}>
        <div className="px-5 pb-10 space-y-2">
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Move aisles into the order you walk them. This replaces the learned route for {store}.
          </p>
          {routeOrder.map((aisle, index) => (
            <Card key={aisle} className="!p-3 flex items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-extrabold truncate">
                <span className="mr-2 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>{index + 1}</span>
                {aisle}
              </span>
              <span className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveAisle(index, -1)}
                  aria-label={`Move ${aisle} up`}
                  className="press flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-30"
                  style={{ borderColor: 'var(--line)' }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === routeOrder.length - 1}
                  onClick={() => moveAisle(index, 1)}
                  aria-label={`Move ${aisle} down`}
                  className="press flex h-9 w-9 items-center justify-center rounded-full border disabled:opacity-30"
                  style={{ borderColor: 'var(--line)' }}
                >
                  ↓
                </button>
              </span>
            </Card>
          ))}
          <button
            type="button"
            onClick={saveRoute}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Save route for {store}
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'scan'} onClose={() => setSheet(null)} title="Scan onto the list">
        <div className="px-5 pb-10">
            <BarcodeAdd action="Add" onPick={(item) => app.addToList({ ...item, store })} />
        </div>
      </Sheet>
      <Sheet open={sheet === 'receipt'} onClose={() => setSheet(null)} title="Read a receipt">
        <ReceiptScan onDone={() => { setSheet(null); onOpenPantry?.(); }} />
      </Sheet>
      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title="Your list as text">
        <ShoppingExport text={asText()} />
      </Sheet>

      {/* Whichever step of a shop you're actually at. */}
      {view === 'list' && (
        visibleList.length === 0
          ? <PrimaryAction label="Add something to the list" onClick={() => setAdding(true)} />
            : !shoppingMode
            ? <PrimaryAction
              label="Start shopping"
              hint={`${visibleList.length} item${visibleList.length === 1 ? '' : 's'}`}
              onClick={() => {
                recordProductEvent('shopping_started', { count: visibleList.length, store: store || 'all' });
                shoppingSession.start(store);
              }}
            />
            : <PrimaryAction label="Finish and record this shop" hint={`${ticked}/${visibleList.length} ticked`} onClick={() => setSheet('finish')} />
      )}
    </div>
  );
}
