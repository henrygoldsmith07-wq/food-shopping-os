import { Check, CloudOff, Package, Receipt, TriangleAlert, X } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { checkedTotalOf } from '../data/stores.js';
import { weekDates } from '../lib/kitchen.js';
import { planStats } from '../lib/mealplan.js';
import { householdPortionsFor } from '../lib/portions.js';
import ShoppingProgress from './ShoppingProgress.jsx';
import TripUndo from './TripUndo.jsx';
import OutOfStockCard from './OutOfStockCard.jsx';
import { outOfStockPatch } from '../lib/out-of-stock.js';
import { Card, Chip, Meter, Section } from './ui.jsx';

/** Where an estimated total came from, in one line. */
const estimateLine = (basket, estimate) => {
  const { receipt, live, observed, typical } = estimate.sources;
  const parts = [
    receipt && `${receipt} receipt`,
    live && `${live} live`,
    observed && `${observed} community`,
    typical && `${typical} typical`,
  ].filter(Boolean).join(', ');
  const borrowed = `about ${gbp(estimate.estimated, { always: true })} for ${estimate.estimatedCount} item${estimate.estimatedCount === 1 ? '' : 's'} at ${parts} price${estimate.estimatedCount === 1 ? '' : 's'}`;
  return basket.projected > 0
    ? `${gbp(basket.projected, { always: true })} from your prices + ${borrowed}.`
    : `Estimated: ${borrowed}. Type a price or read a receipt to replace it.`;
};

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
  cap = null, reRanked = false, onReRank = null, estimate = null,
}) {
  // What has actually been ticked off, which is the running total once a shop
  // is under way; derived here because it is only ever read here.
  const checkedTotal = checkedTotalOf(visibleList);
  const offlineMode = Boolean(app.shoppingPreferences?.offlineMode);
  const largeTouch = Boolean(app.shoppingPreferences?.largeTouch);
  // With no recorded prices the receipt estimate is £0, which reads as "free"
  // beside the Plan tab's cost. Quote the plan's own recipe estimate instead,
  // labelled as such, until a receipt gives real prices.
  // Rows without a price borrow one (live, community, or typical for the
  // pack) so the total is the whole shop, not just the part you've typed in.
  const estimated = estimate?.estimatedCount > 0 ? estimate : null;
  const planEstimate = basket.projected > 0 || estimated ? 0
    : planStats(app.plan, weekDates(app.day), { people: householdPortionsFor(app).portions }).cost;
  const fromRecipes = basket.unpriced > 0 && planEstimate > 0;
  const projected = estimated ? Math.round((basket.projected + estimated.estimated) * 100) / 100
    : fromRecipes ? planEstimate : basket.projected;
  const about = fromRecipes || Boolean(estimated);
  const unpricedLeft = estimated ? estimated.unknownCount : basket.unpriced;

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
              <span key={shoppingMode ? checkedTotal : projected} className="count-up inline-block">
                {!shoppingMode && about && 'about '}{gbp(shoppingMode ? checkedTotal : projected, { always: true })}
              </span>
              {shoppingMode && (
                <span className="text-[0.8125rem] font-semibold ml-1.5" style={{ color: 'var(--muted)' }}>
                  of {about && 'about '}{gbp(projected, { always: true })}
                </span>
              )}
            </p>
            {!shoppingMode && <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {estimated ? estimateLine(basket, estimated)
                : fromRecipes ? 'Rough estimate from this week’s recipes — a receipt replaces it with what you paid.'
                  : 'Estimate from your receipts (“you paid this”) — not live prices.'}
            </p>}
            {basket.saved > 0 && (
              <p className="text-[0.75rem] font-bold" style={{ color: 'var(--good)' }}>
                {gbp(basket.total, { always: true })} less {gbp(basket.saved, { always: true })} of your offers
              </p>
            )}
        {unpricedLeft > 0 && !shoppingMode && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {unpricedLeft} item{unpricedLeft === 1 ? '' : 's'} with no price yet{about ? '.' : ' — the total is only what you’ve typed in.'}
          </p>
        )}
        {onOpenPantry && app.pantry.length > 0 && !shoppingMode && (
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
              onClick={() => shoppingSession.stop()}
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
            {cap && basket.over && !shoppingMode && (
              <div className="mt-2 rounded-2xl border p-2.5 space-y-2" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--warn)' }}>
                  <span className="font-extrabold">What you can afford now:</span> the cheapest{' '}
                  {cap.fitCount} priced item{cap.fitCount === 1 ? '' : 's'} ({gbp(cap.fitsCost, { always: true })})
                  {' '}fit your {gbp(cap.headroom, { always: true })} headroom
                  {cap.outsideCount > 0
                    ? ` — ${cap.outsideCount} priced item${cap.outsideCount === 1 ? '' : 's'} (${gbp(cap.outsideCost, { always: true })}) sit past it`
                    : ''}
                  {cap.unpriced > 0 ? `, plus ${cap.unpriced} unpriced` : ''}.
                </p>
                {onReRank && (
                  <button
                    type="button"
                    onClick={onReRank}
                    aria-label={reRanked ? 'Back to my order' : 'Rank by what I can afford'}
                    className="press rounded-xl px-3 py-2 text-[0.71875rem] font-extrabold"
                    style={reRanked ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : { background: 'var(--accent)', color: 'var(--on-accent)' }}
                  >
                    {reRanked ? 'Back to my order' : 'Rank by what I can afford'}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Set a weekly budget in your profile to see headroom here.
          </p>
        )}

        {/* Progress, options and sync detail fold away so the list starts on
            the first screen; the bottom bar already counts what is ticked. */}
        {shoppingMode && <TripUndo list={visibleList} onUndo={app.toggleChecked} />}
        {shoppingMode && (
          <OutOfStockCard
            list={visibleList}
            verifiedFor={(row) => app.shoppingInsights?.byId?.[row.id]?.substitutions?.candidates || []}
            onSwap={(id, option) => { app.substituteListItem(id, option); app.updateListItem(id, { outOfStock: false, outOfStockAt: null }); }}
            onClear={(id) => app.updateListItem(id, outOfStockPatch({ outOfStock: true }))}
          />
        )}
        {shoppingMode && (
          <details className="mt-3 rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <summary className="cursor-pointer list-none text-[0.75rem] font-extrabold" style={{ color: 'var(--muted)' }}>Progress and shopping options</summary>
          <ShoppingProgress total={visibleList.length} checked={ticked} minutesLeft={shoppingSession.minutesLeft(visibleList.length - ticked)} />
          <p className="mt-2 inline-flex items-center gap-1.5 text-[0.71875rem] font-bold" style={{ color: isOnline ? 'var(--good)' : 'var(--warn)' }}>
            {isOnline ? <Check size={12} /> : <CloudOff size={12} />}
            {offlineMode
              ? 'Offline shopping mode · the list and aisle route stay available locally.'
              : ['disabled', 'signed-out'].includes(app.cloudStatus?.kind || 'disabled') ? 'Saved on this device as you tick.'
                : isOnline ? 'Online · changes save locally and sync when available.' : 'Offline · changes save locally; sync resumes when you reconnect.'}
          </p>
          <div className="mt-2">
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
          </details>
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
