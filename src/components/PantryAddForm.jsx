import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_LOCATION, LOCATIONS } from '../data/pantry.js';
import { Card, Chip, Pill } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';

/**
 * Adding one pantry item by hand, with its two confidences on the form rather
 * than assumed: whether you definitely have it, and how sure the amount is.
 * The quick-add flow next door fills the same fields from what you said.
 */
const BLANK = {
  name: '', qty: '', cost: '', location: DEFAULT_LOCATION,
  confidence: 'definite', amountConfidence: 'approximate',
  cat: DEFAULT_CATEGORY, store: '', expiry: '',
};

export default function PantryAddForm() {
  const app = useApp();
  const [draft, setDraft] = useState(BLANK);
  const [added, setAdded] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const field = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  /** Stays open after saving — putting a shop away means several items in a row. */
  const save = () => {
    if (draft.name.trim().length < 2) return;
    app.addPantryItem({ ...draft, name: draft.name.trim(), expiry: draft.expiry || null, confidence: draft.confidence, amountConfidence: draft.amountConfidence });
    setAdded(draft.name.trim());
    setDraft({ ...BLANK, location: draft.location, cat: draft.cat, store: draft.store });
  };

  return (
    <Card className="space-y-3">
      <input
        value={draft.name}
        onChange={(e) => field('name')(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="What did you put away?"
        aria-label="Item name"
        className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        The name is enough for now. Add an amount or use-by date only when you have it.
      </p>
      <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)} className="rounded-2xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
        <summary className="cursor-pointer list-none text-[0.75rem] font-extrabold">Add details <span className="font-semibold" style={{ color: 'var(--muted)' }}>· optional</span></summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Amount</span>
              <input
                value={draft.qty}
                onChange={(e) => field('qty')(e.target.value)}
                placeholder="500 g, 2 tins…"
                aria-label="Amount"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            <NumberField label="Cost" value={draft.cost} onChange={field('cost')} suffix="£" step={0.5} />
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Use by</span>
              <input
                type="date"
                value={draft.expiry}
                onChange={(e) => field('expiry')(e.target.value)}
                aria-label="Use by"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Where from</span>
              <input
                value={draft.store}
                onChange={(e) => field('store')(e.target.value)}
                placeholder="Shop"
                aria-label="Where from"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {LOCATIONS.map((l) => (
              <Chip key={l} active={draft.location === l} onClick={() => field('location')(l)}>{l}</Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="Stock confidence">
            {[['definite','Definitely have'],['probable','Probably have'],['unknown','Unknown']].map(([id,label]) => (
              <Chip key={id} active={draft.confidence === id} onClick={() => field('confidence')(id)}>{label}</Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="Amount confidence">
            {[['exact','Amount known'],['approximate','Amount approx.'],['unknown','Amount unknown']].map(([id,label]) => (
              <Chip key={id} active={draft.amountConfidence === id} onClick={() => field('amountConfidence')(id)}>{label}</Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="Category">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={draft.cat === c} onClick={() => field('cat')(c)}>{c}</Chip>
            ))}
          </div>
        </div>
      </details>
      <button
        onClick={save}
        disabled={draft.name.trim().length < 2}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Add to pantry
      </button>
      {added && (
        <p className="text-center"><Pill tone="good"><Check size={11} strokeWidth={3} /> {added} added</Pill></p>
      )}
    </Card>
  );
}
