import { useRef, useState } from 'react';
import { Check, History, Plus, Receipt } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';
import { gbp } from '../lib/utils.js';
import { COMMON_STORES, checkedTotalOf, guessAisle } from '../data/stores.js';
import { findShoppingDuplicate, quantitySuggestion } from '../lib/shopping.js';
import { Card, Chip } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';

/**
 * The two forms the shop tab needs: putting something on the list, and
 * recording what a trip actually cost once you're at the till.
 */

/* ---------- Add an item ---------- */

export function AddItem({ onAdd }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const duplicate = findShoppingDuplicate(name, app.shoppingList);
  const usualQuantity = quantitySuggestion(name, app.shops);
  const amountInput = useRef(null);

  const submit = () => {
    if (name.trim().length < 2 || duplicate?.kind === 'exact') return;
    onAdd({ name: name.trim(), qty: qty.trim(), price: Number(price) || 0, note: note.trim(), priority, aisle: guessAisle(name) });
    setName(''); setQty(''); setPrice(''); setNote(''); setPriority('normal');
  };

  return (
    <Card className="space-y-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add to the list…"
        aria-label="Item name"
        className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      {duplicate && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>
          {duplicate.kind === 'exact'
            ? `Already on your list as “${duplicate.item.name}”. Edit that row instead of adding a duplicate.`
            : `This looks like “${duplicate.item.name}” already on your list. Check the existing row before adding.`}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Amount</span>
          <input
            ref={amountInput}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="2, 500 g…"
            aria-label="Amount"
            className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        <NumberField label="Price each" value={price} onChange={setPrice} suffix="£" step={0.5} />
      </div>
      {usualQuantity && !qty.trim() && (
        <button
          type="button"
          onClick={() => {
            setQty(usualQuantity.qty);
            amountInput.current?.focus();
          }}
          className="press w-full rounded-xl border px-3 py-2 text-left text-[0.75rem] font-bold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          aria-label={`Use usual quantity ${usualQuantity.qty}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <History size={13} /> Usually {usualQuantity.qty}
            <span className="font-semibold" style={{ color: 'var(--faint)' }}>
              · {usualQuantity.matches} previous shop{usualQuantity.matches === 1 ? '' : 's'}
            </span>
          </span>
        </button>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note, e.g. semi-skimmed"
        aria-label="Item note"
        className="w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="flex gap-2">
        <Chip active={priority === 'normal'} onClick={() => setPriority('normal')}>Normal priority</Chip>
        <Chip active={priority === 'high'} onClick={() => setPriority('high')}>Need it</Chip>
      </div>
      <button
        onClick={submit}
        disabled={name.trim().length < 2 || duplicate?.kind === 'exact'}
        className="press w-full rounded-2xl py-2.5 text-[0.84375rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-1.5"><Plus size={15} /> Add item</span>
      </button>
    </Card>
  );
}

/* ---------- Record what a trip cost ---------- */

export function FinishShop({ items, store: initial, onDone }) {
  const app = useApp();
  const suggested = checkedTotalOf(items);
  const [store, setStore] = useState(initial || '');
  const [total, setTotal] = useState(suggested ? suggested.toFixed(2) : '');
  const [toPantry, setToPantry] = useState(true);

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Ticked off</p>
        <p className="text-[1.625rem] font-extrabold">{items.filter((i) => i.checked).length} items</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Estimated {gbp(suggested, { always: true })} — put in what you actually paid.
        </p>
      </Card>

      <label className="block">
        <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Where</span>
        <input
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="Shop name"
          aria-label="Shop name"
          className="mt-1 w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
      </label>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        {COMMON_STORES.map((s) => (
          <Chip key={s} active={store === s} onClick={() => setStore(s)}>{s}</Chip>
        ))}
      </div>

      <NumberField label="Total paid" value={total} onChange={setTotal} suffix="£" step={1} />

      <button
        onClick={() => setToPantry((v) => !v)}
        className="press w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left"
        style={{ borderColor: toPantry ? 'var(--accent)' : 'var(--line)' }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 shrink-0"
          style={toPantry
            ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
            : { borderColor: 'var(--line)', color: 'transparent' }}
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <span>
          <span className="block font-bold text-[0.875rem]">Put these in the pantry</span>
          <span className="block text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            You can add use-by dates afterwards.
          </span>
        </span>
      </button>

      <button
        onClick={() => {
          app.recordShop({ store, total, toPantry, itemIds: items.map((item) => item.id) });
          if (toPantry) recordProductEvent('pantry_reconciled', { count: items.filter((i) => i.checked).length });
          onDone();
        }}
        className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-2"><Receipt size={16} /> Record this shop</span>
      </button>
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        The order you ticked things off becomes this shop’s aisle order next time.
      </p>
    </div>
  );
}
