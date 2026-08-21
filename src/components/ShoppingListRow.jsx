import { useState } from 'react';
import { Check, Star, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { AISLE_ORDER } from '../data/stores.js';
import { cx } from '../lib/utils.js';
import { haptic } from '../lib/haptics.js';
import { shoppingNameKey, unitPrice } from '../lib/shopping.js';
import { gbp } from '../lib/utils.js';
import { Glyph } from './icons.jsx';
import { Chip, GestureMenu, Pill } from './ui.jsx';

export default function ShoppingListRow({ item, onAisle, onStore, storeOptions = [], dragging, setDragging, observedPrice, largeTouch = false }) {
  const app = useApp();
  const [moving, setMoving] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const comparablePrice = unitPrice(item);
  const insight = app.shoppingInsights?.byId?.[item.id] || {};
  const substitutions = insight.substitutions?.candidates || [];
  const change = insight.priceChange;
  const favourite = app.favouriteShopping.some((saved) => shoppingNameKey(saved.name) === shoppingNameKey(item.name));
  const toggle = () => {
    app.toggleChecked(item.id);
    if (!item.checked) haptic();
  };
  return (
    <GestureMenu
      label={item.name}
      actions={[
        { label: item.checked ? 'Mark not bought' : 'Mark bought', onClick: toggle },
        { label: item.priority === 'high' ? 'Normal priority' : 'High priority', onClick: () => app.updateListItem(item.id, { priority: item.priority === 'high' ? 'normal' : 'high' }) },
        { label: favourite ? 'Remove favourite' : 'Save as favourite', onClick: () => app.toggleFavouriteShopping(item) },
        ...(substitutions.length ? [{ label: 'Find a substitution', onClick: () => setSwapping(true) }] : []),
        { label: 'Move to another aisle', onClick: () => setMoving(true) },
        { label: 'Remove', tone: 'danger', onClick: () => app.removeListItem(item.id) },
      ]}
      onSwipeLeft={() => app.removeListItem(item.id)}
      onSwipeRight={toggle}
      draggable
      onDragStart={() => setDragging(item.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => {
        if (dragging) app.moveListItem(dragging, item.id);
        setDragging(null);
      }}
    >
      <div className={largeTouch ? 'p-5' : 'p-3'} style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          aria-label={`Tick ${item.name}`}
          className={cx('press flex items-center justify-center rounded-full border-2 shrink-0', largeTouch ? 'h-10 w-10' : 'h-6 w-6')}
          style={item.checked
            ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
            : { borderColor: 'var(--line)', color: 'transparent' }}
        >
          {item.checked && <Check className="check-in" size={13} strokeWidth={3} />}
        </button>
        <button onClick={() => setMoving((v) => !v)} aria-label={`Move ${item.name} to another aisle`} className="press shrink-0">
          <Glyph e={item.emoji} size={20} style={{ color: 'var(--muted)' }} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cx('font-bold truncate', largeTouch ? 'text-[1rem]' : 'text-[0.875rem]', item.checked && 'line-through opacity-45')}>
            {item.name}
            {item.qty && <span className="font-semibold text-[0.75rem]" style={{ color: 'var(--muted)' }}> · {item.qty}</span>}
          </p>
          {item.priority === 'high' && <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>Need it</p>}
          {item.note && <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>{item.note}</p>}
          {item.fromRecipe && (
            <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>for {item.fromRecipe}</p>
          )}
          {item.store && (
            <p className="text-[0.71875rem] font-bold truncate" style={{ color: 'var(--accent)' }}>at {item.store}</p>
          )}
          {item.substitutedFrom && (
            <p className="text-[0.6875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
              swap for {item.substitutedFrom}{item.substitutionWhy ? ` · ${item.substitutionWhy}` : ''}
            </p>
          )}
          {item.purchaseWarning && (
            <p className="mt-1 text-[0.6875rem] font-bold" style={{ color: 'var(--warn)' }}>
              Bought {item.purchaseWarning.store || 'recently'} on {item.purchaseWarning.date} · check before buying again
            </p>
          )}
          {comparablePrice && (
            <p className="text-[0.71875rem] font-extrabold" style={{ color: 'var(--accent)' }}>
              £{comparablePrice.value.toFixed(2)} / {comparablePrice.unit}
            </p>
          )}
          {insight.price?.level !== 'unknown' && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill tone={insight.price.level === 'high' ? 'good' : insight.price.level === 'medium' ? 'accent' : 'warn'}>
                {insight.price.label}
              </Pill>
              {change?.status === 'tracked' && change.pct !== null && (
                <span className="text-[0.625rem] font-bold" style={{ color: change.direction === 'up' ? 'var(--danger)' : change.direction === 'down' ? 'var(--good)' : 'var(--faint)' }}>
                  {change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '·'} {Math.abs(change.pct)}% since last receipt
                </span>
              )}
            </div>
          )}
          {observedPrice && !observedPrice.error && typeof observedPrice.price === 'number' && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold" style={{ color: observedPrice.staleness?.tone === 'danger' ? 'var(--muted)' : 'var(--muted)' }}>
              <span className="inline-flex items-center gap-1">
                {gbp(observedPrice.price, { always: true })} · {observedPrice.store || 'Shop not named'}
              </span>
              <Pill tone={observedPrice.staleness?.tone === 'good' ? 'good' : observedPrice.staleness?.tone === 'warn' ? 'warn' : observedPrice.staleness?.tone === 'danger' ? 'danger' : 'muted'}>
                {observedPrice.staleness?.label || 'community observed'}
              </Pill>
              <span className="text-[0.625rem]" style={{ color: 'var(--faint)' }}>community observed — not live</span>
            </p>
          )}
          {observedPrice?.error && (
            <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{observedPrice.error}</p>
          )}
          {app.members.length > 0 && (
            <details className="mt-1">
              <summary className="inline-flex cursor-pointer list-none rounded-lg px-1 py-1 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
                {item.assigneeId
                  ? `For ${app.members.find((member) => member.id === item.assigneeId)?.name || 'someone'}`
                  : 'Assign to someone'}
              </summary>
              <select
                value={item.assigneeId || ''}
                onChange={(event) => app.assignListItem(item.id, event.target.value)}
                aria-label={`Assign ${item.name}`}
                className="mt-1 rounded-lg border px-2 py-1 text-[0.6875rem] font-bold"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                <option value="">Anyone</option>
                {app.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </details>
          )}
        </div>
        <input
          type="number"
          min="0"
          step="0.25"
          value={item.price || ''}
          onChange={(e) => app.updateListItem(item.id, { price: Number(e.target.value) || 0 })}
          placeholder="£"
          aria-label={`Price of ${item.name}`}
          className={cx('shrink-0 rounded-xl border px-2 text-right outline-none', largeTouch ? 'w-24 py-3 text-[0.9375rem]' : 'w-16 py-1.5 text-[0.8125rem]', 'font-bold')}
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={() => app.toggleFavouriteShopping(item)}
          aria-label={favourite ? `Remove favourite ${item.name}` : `Save ${item.name} as favourite`}
          aria-pressed={favourite}
          className="press p-1 shrink-0"
          style={{ color: favourite ? 'var(--accent)' : 'var(--faint)' }}
        >
          <Star size={15} fill={favourite ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => app.removeListItem(item.id)}
          aria-label={`Remove ${item.name}`}
          className="press p-1 shrink-0"
          style={{ color: 'var(--faint)' }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {substitutions.length > 0 && (
        <button
          type="button"
          onClick={() => setSwapping((value) => !value)}
          aria-expanded={swapping}
          aria-label={`Find a substitution for ${item.name}`}
          className={cx('press mt-2 rounded-full border px-3 py-1.5 text-[0.71875rem] font-extrabold', largeTouch && 'px-4 py-2 text-[0.8125rem]')}
          style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
        >
          {swapping ? 'Hide substitutions' : 'Swap this item'}
        </button>
      )}
      {swapping && substitutions.length > 0 && (
        <div className="mt-2 rounded-2xl border p-2.5 space-y-2" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Verified substitutions
          </p>
          {substitutions.map((option) => (
            <button
              type="button"
              key={option.name}
              onClick={() => { app.substituteListItem(item.id, option); setSwapping(false); }}
              className="press w-full rounded-xl border p-2.5 text-left"
              style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            >
              <span className="block text-[0.8125rem] font-extrabold">{option.name}</span>
              <span className="mt-0.5 block text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{option.rationale}</span>
            </button>
          ))}
        </div>
      )}
      {moving && (
        <>
          <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
            {AISLE_ORDER.map((aisle) => (
              <Chip
                key={aisle}
                active={item.aisle === aisle}
                onClick={() => { onAisle(item.id, aisle); setMoving(false); }}
              >
                {aisle}
              </Chip>
            ))}
          </div>
          {onStore && storeOptions.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
              <Chip active={!item.store} onClick={() => { onStore(item.id, ''); setMoving(false); }}>Any shop</Chip>
              {storeOptions.map((store) => (
                <Chip key={store} active={item.store === store} onClick={() => { onStore(item.id, store); setMoving(false); }}>
                  {store}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </GestureMenu>
  );
}
