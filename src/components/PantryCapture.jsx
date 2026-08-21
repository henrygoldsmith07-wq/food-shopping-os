import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Image, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { recogniseShelf } from '../lib/foodlog.js';
import { CATEGORIES, LOCATIONS } from '../data/pantry.js';
import { Card, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

/**
 * Editable demonstration of a shelf-recognition workflow. This offline build
 * does not ship a vision model, so every suggestion must be checked.
 */
export default function PantryCapture({ onDone }) {
  const app = useApp();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [location, setLocation] = useState('Fridge');
  const [saved, setSaved] = useState(0);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const analyse = (seed, url) => {
    setPreview(url);
    setBusy(true);
    setSaved(0);
    setMessage('');
    setTimeout(() => {
      const read = recogniseShelf(seed, app.catalogue);
      // Keep what the recogniser said so an edit can be taught back.
      setItems(read.map((item) => ({ ...item, original: item.name })));
      setLocation(read[0]?.location || 'Fridge');
      setBusy(false);
    }, 1200);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setItems([]);
    setMessage('Photo added, but this offline build has no vision model to identify its pixels. Use the sample workflow or add pantry items by search.');
  };

  const update = (i, patch) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () => {
    for (const item of items) {
      const from = String(item.original || '').trim();
      const to = String(item.name || '').trim();
      if (from && to && from !== to) app.learnCorrection({ from, to });
      app.addPantryItem({
        name: item.name,
        emoji: item.emoji,
        qty: item.qty,
        cat: item.cat,
        location,
        cost: 0,
        store: '',
        expiry: null,
      });
    }
    setSaved(items.length);
    setItems([]);
    setPreview(null);
  };

  return (
    <div className="px-5 pb-10 space-y-4">
      <div
        className="relative overflow-hidden rounded-3xl border flex items-center justify-center"
        style={{ height: 200, background: 'var(--card-2)', borderColor: 'var(--line)' }}
      >
        {preview
          ? <img src={preview} alt="Your shelf" className="h-full w-full object-cover" />
          : (
            <div className="text-center px-8">
              <Camera size={34} strokeWidth={1.4} style={{ color: 'var(--muted)' }} />
              <p className="mt-2 text-[0.78125rem] font-bold" style={{ color: 'var(--muted)' }}>
                Open the fridge and take one photo
              </p>
            </div>
          )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--bg) 70%, transparent)' }}>
            <p className="inline-flex items-center gap-2 text-[0.8125rem] font-extrabold">
              <Sparkles size={15} className="pulse-dot" /> Preparing sample suggestions…
            </p>
          </div>
        )}
      </div>
      {message && <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{message}</p>}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => fileRef.current?.click()}
          className="press rounded-2xl py-3 text-[0.875rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Image size={15} /> Choose photo</span>
        </button>
        <button
          onClick={() => analyse(`shelf-${Date.now() % 8}`, null)}
          className="press rounded-2xl border py-3 text-[0.875rem] font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          Try a sample shelf
        </button>
      </div>

      {saved > 0 && (
        <p className="text-center">
          <Pill tone="good"><Check size={11} strokeWidth={3} /> {saved} item{saved === 1 ? '' : 's'} added to your pantry</Pill>
        </p>
      )}

      {/* What the list is about to look like, so it doesn't arrive as a jolt. */}
      {busy && items.length === 0 && (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="skeleton h-8 w-8 rounded-xl shrink-0" />
              <div className="skeleton h-3 rounded" style={{ width: `${64 - i * 9}%` }} />
            </div>
          ))}
        </Card>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Spotted · correct anything
            </p>
            <Pill tone="accent">{items.length} items</Pill>
          </div>

          <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
            {items.map((item, i) => (
              <div key={`${item.name}-${i}`} className="p-3 space-y-2" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-3">
                  <Glyph e={item.emoji} size={20} style={{ color: 'var(--muted)' }} />
                  <input
                    value={item.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    aria-label={`Name of item ${i + 1}`}
                    className="min-w-0 flex-1 rounded-xl border px-2.5 py-1.5 text-[0.875rem] font-bold outline-none"
                    style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                  />
                  <span className="text-[0.6875rem] font-bold shrink-0" style={{ color: 'var(--faint)' }}>{item.confidence}%</span>
                  <button
                    onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    aria-label={`Remove ${item.name}`}
                    className="press p-1 shrink-0"
                    style={{ color: 'var(--faint)' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-8">
                  <input
                    value={item.qty}
                    onChange={(e) => update(i, { qty: e.target.value })}
                    aria-label={`Amount of ${item.name}`}
                    placeholder="Amount"
                    className="w-28 rounded-xl border px-2.5 py-1.5 text-[0.8125rem] font-semibold outline-none"
                    style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                  />
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {CATEGORIES.slice(0, 5).map((c) => (
                      <Chip key={c} active={item.cat === c} onClick={() => update(i, { cat: c })}>{c}</Chip>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
              Put it all in
            </p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
              {LOCATIONS.map((l) => (
                <Chip key={l} active={location === l} onClick={() => setLocation(l)}>{l}</Chip>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Add {items.length} item{items.length === 1 ? '' : 's'} to {location.toLowerCase()}
          </button>
          <p className="text-[0.71875rem] font-semibold text-center" style={{ color: 'var(--faint)' }}>
            Use-by dates and costs stay blank — add them on the item when you know them.
          </p>
          <p className="text-[0.71875rem] font-semibold text-center" style={{ color: 'var(--faint)' }}>
            Catalogue demo only: this build does not inspect the image pixels or identify the actual shelf.
          </p>
        </>
      )}

      {onDone && items.length === 0 && saved > 0 && (
        <button
          onClick={onDone}
          className="press w-full rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={{ borderColor: 'var(--line)' }}
        >
          Back to the pantry
        </button>
      )}
    </div>
  );
}
