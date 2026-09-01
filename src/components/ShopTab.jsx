import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, Building2, Check, CloudOff, Copy, FileUp, MapPin, Mic, Package, Plus, Receipt, RotateCcw, ScanLine, ShoppingCart, Star, Tag,
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
import ShopSheets from './ShopSheets.jsx';
import ShopBasket from './ShopBasket.jsx';
import ShopPrices from './ShopPrices.jsx';
import ShopHistory from './ShopHistory.jsx';
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
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar scroll-x-fade px-5 rise rise-1">
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
          <ShopBasket
            app={app}
            basket={basket}
            ticked={ticked}
            visibleList={visibleList}
            shoppingMode={shoppingMode}
            shoppingSession={shoppingSession}
            isOnline={isOnline}
            setSheet={setSheet}
            onOpenPantry={onOpenPantry}
          />

          {/* Which shop you're walking round: its aisles, in your order */}
          {(stores.length > 0 || list.length > 0) && (
            <Section className="rise rise-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
                  <MapPin size={12} /> Shopping at
                </p>
                {known && <Pill tone="good">your route, learned</Pill>}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-x-fade">
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
                  <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><MapPin size={12} /> Edit this store's route</span>
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
            {/* Four across at normal text; the tracks are sized in rem, so large
                text drops them to two rather than spilling the labels sideways. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2.5 mb-3">
              <button
                onClick={() => setAdding((v) => !v)}
                className="press col-span-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={adding ? { borderColor: 'var(--line)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                  {adding ? <><X size={13} /> Close</> : <><Plus size={14} /> Add an item</>}
                </span>
              </button>
              <button
                onClick={() => setSheet('scan')}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><ScanLine size={14} /> Scan</span>
              </button>
              <button
                onClick={() => setSheet('offers')}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: app.offers.length ? 'var(--accent)' : 'var(--line)', color: app.offers.length ? 'var(--accent)' : 'var(--ink)' }}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><Tag size={14} /> Offers{app.offers.length ? ` (${app.offers.length})` : ''}</span>
              </button>
              <button
                onClick={voiceAdd}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><Mic size={14} /> Voice</span>
              </button>
              {/* Receipt capture is an optional tool — manual shop entry always works. */}
              {app.hasTool('receipt') && (
              <button
                onClick={() => setSheet('receipt')}
                className="press col-span-2 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><Receipt size={14} /> Read a receipt</span>
              </button>
              )}
              <button
                onClick={() => setSheet('csv')}
                className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex items-center gap-1.5"><FileUp size={14} /> Import receipts</span>
              </button>
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
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
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
                    <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
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
              <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-x-fade -mx-5 px-5">
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

          <ShopPrices
            app={app}
            visibleList={visibleList}
            checkObservedPrices={checkObservedPrices}
            observedBusy={observedBusy}
            observedByKey={observedByKey}
            observedError={observedError}
            observedMeta={observedMeta}
            setObservedByKey={setObservedByKey}
            setObservedMeta={setObservedMeta}
            setObservedError={setObservedError}
            offlineMode={offlineMode}
            isOnline={isOnline}
          />

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
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5"><Copy size={14} /> Copy the list as text</span>
              </button>

            </Section>
          )}
        </>
      )}

      {view === 'history' && <ShopHistory shops={app.shops} />}

      {view === 'prices' && <PriceCompare />}
      {view === 'stores' && <StoreIntegrations />}
      {view === 'budget' && <BudgetPanel />}

      <ShopSheets
        app={app}
        sheet={sheet}
        setSheet={setSheet}
        store={store}
        visibleList={visibleList}
        ticked={ticked}
        shoppingSession={shoppingSession}
        honestOffers={honestOffers}
        routeEditor={routeEditor}
        setRouteEditor={setRouteEditor}
        routeOrder={routeOrder}
        moveAisle={moveAisle}
        saveRoute={saveRoute}
        asText={asText}
        onOpenPantry={onOpenPantry}
      />

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
