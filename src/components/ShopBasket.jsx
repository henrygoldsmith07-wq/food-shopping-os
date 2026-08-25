import { Check, CloudOff, Package, Receipt, TriangleAlert, X } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { checkedTotalOf } from '../data/stores.js';
import ShoppingProgress from './ShoppingProgress.jsx';
import { Card, Chip, Meter, Section } from './ui.jsx';

/**
 * What this shop is going to cost, and what that does to the budget.
 *
 * Two numbers, and they mean different things: before a shop starts it is an
 * estimate built only from prices you have recorded, so unpriced items are
 * counted as unpriced rather than as free. Once you are walking round it
 * becomes the running total of what you have actually ticked off.
 */
export default function ShopBasket({
  app, basket, ticked, visibleList, shoppingMode, shoppingSession, isOnline, setSheet, onOpenPantry,
}) {
  // What has actually been ticked off, which is the running total once a shop
  // is under way; derived here because it is only ever read here.
  const checkedTotal = checkedTotalOf(visibleList);
  const offlineMode = Boolean(app.shoppingPreferences?.offlineMode);
  const largeTouch = Boolean(app.shoppingPreferences?.largeTouch);

  return (
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
  );
}
