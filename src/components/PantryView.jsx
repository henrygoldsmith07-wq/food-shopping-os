import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Camera, Check, Minus, Package, Plus, ScanLine, ShoppingCart, Trash2, TrendingDown, TriangleAlert, X,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cx, gbp, expiryStatus } from '../lib/utils.js';
import {
  daysUntil, expiringSoon, freshnessOf, pantryAnalytics, pantryAvailability, pantryConfidenceLevel,
  pantryTruthLabel, pantryTruthTone, pantryUseLabel, pantryUncertaintyLabel, pantryValue,
} from '../lib/kitchen.js';
import { expiryBuckets } from '../lib/shopping.js';
import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_LOCATION, LOCATIONS } from '../data/pantry.js';
import { Card, Chip, Empty, GestureMenu, Pill, Section } from './ui.jsx';
import { Glyph } from './icons.jsx';
import { NumberField } from './FoodDetail.jsx';
import PantryCapture from './PantryCapture.jsx';
import BarcodeAdd from './BarcodeAdd.jsx';
import PantryShare from './PantryShare.jsx';

const BLANK = {
  name: '', qty: '', cost: '', location: DEFAULT_LOCATION,
  confidence: 'definite', amountConfidence: 'approximate',
  cat: DEFAULT_CATEGORY, store: '', expiry: '',
};

function AddItemForm() {
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

export default function PantryView({ quickAddKey = 0, initialQuery = '', onPlan }) {
  const app = useApp();
  const [location, setLocation] = useState('All');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('expiry');
  const [adding, setAdding] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (quickAddKey) {
      setAdding(true);
      setCapturing(false);
      setScanning(false);
    }
  }, [quickAddKey]);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const items = useMemo(() => {
    let list = app.pantry;
    if (location !== 'All') list = list.filter((p) => p.location === location);
    if (category !== 'All') list = list.filter((p) => p.cat === category);
    if (status === 'low') list = list.filter((p) => pantryAvailability(p, app.day) === 'running_low');
    if (status === 'unknown') list = list.filter((p) => pantryAvailability(p, app.day) === 'unknown');
    if (status === 'sufficient') list = list.filter((p) => pantryAvailability(p, app.day) === 'confirmed_sufficient');
    if (status === 'probable') list = list.filter((p) => pantryAvailability(p, app.day) === 'probably_available');
    if (status === 'expiring') list = list.filter((p) => p.expiry && daysUntil(p.expiry, app.day) <= 7);
    if (status === 'dated') list = list.filter((p) => p.expiry);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'value') return (Number(b.cost) || 0) - (Number(a.cost) || 0) || a.name.localeCompare(b.name);
      if (sort === 'recent') return String(b.addedAt || '').localeCompare(String(a.addedAt || '')) || a.name.localeCompare(b.name);
      const da = a.expiry ? daysUntil(a.expiry, app.day) : 9999;
      const db = b.expiry ? daysUntil(b.expiry, app.day) : 9999;
      return da - db;
    });
  }, [app.pantry, app.day, location, category, query, status, sort]);

  const expiring = expiringSoon(app.pantry, 3, app.day);
  const buckets = useMemo(
    () => expiryBuckets(app.pantry, (stamp) => daysUntil(stamp, app.day)),
    [app.pantry, app.day],
  );
  const undated = app.pantry.filter((p) => !p.expiry).length;
  const empty = app.pantry.length === 0;
  const analytics = useMemo(() => pantryAnalytics(app.pantry, app.day), [app.pantry, app.day]);
  const confidenceChecks = useMemo(
    () => app.pantry
      .map((item) => ({ item, confidence: pantryConfidenceLevel(item, app.day) }))
      .filter(({ confidence }) => confidence.requiresConfirmation),
    [app.pantry, app.day],
  );
  const conflicts = (app.pantryConflicts || []).filter((conflict) => conflict.status !== 'resolved');

  if (!app.householdAccess.pantry) {
    return (
      <div className="px-5 pb-8">
        <Card className="text-center py-8">
          <Package size={28} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
          <p className="font-bold">Pantry editing is off for {app.activeMember?.name}.</p>
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>An adult can change this under household permissions.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 space-y-5">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          [gbp(pantryValue(app.pantry), { always: true }), 'pantry value'],
          [app.pantry.length, 'items tracked'],
          [expiring.length, 'use soon'],
        ].map(([v, label]) => (
          <Card key={label} className="!p-3 text-center">
            <p className="text-[1.0625rem] font-extrabold">{v}</p>
            <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => { setAdding((v) => !v); setCapturing(false); setScanning(false); }}
          className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={adding ? { borderColor: 'var(--line)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            {adding ? <><X size={14} /> Close</> : <><Plus size={15} /> Add an item</>}
          </span>
        </button>
        <button
          onClick={() => { setCapturing((v) => !v); setAdding(false); setScanning(false); }}
          className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={capturing ? { borderColor: 'var(--line)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            {capturing ? <><X size={14} /> Close</> : <><Camera size={15} /> Add by photo</>}
          </span>
        </button>
      </div>
      <button
        onClick={() => { setScanning((v) => !v); setAdding(false); setCapturing(false); }}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
        style={scanning ? { borderColor: 'var(--line)' } : { borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          {scanning ? <><X size={14} /> Close</> : <><ScanLine size={14} /> Scan a barcode in</>}
        </span>
      </button>
      {adding && <AddItemForm />}
      {capturing && <PantryCapture onDone={() => setCapturing(false)} />}
      {scanning && (
        <Card>
          <BarcodeAdd
            action="Put away"
            onPick={(item) => app.addPantryItem({ ...item, cat: DEFAULT_CATEGORY, location: DEFAULT_LOCATION, qty: '', cost: 0, expiry: null })}
          />
        </Card>
      )}
      {app.pantry.length > 1 && (
        <button
          onClick={() => app.consolidatePantry()}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Consolidate matching quantities
        </button>
      )}

      {confidenceChecks.length > 0 && (
        <Section title={`Check pantry confidence · ${confidenceChecks.length}`} className="!px-0">
          <Card className="space-y-3">
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Older or uncertain stock is not silently treated as confirmed. Confirm anything you still have.
            </p>
            {confidenceChecks.length > 1 && (
              <button
                type="button"
                onClick={() => confidenceChecks.forEach(({ item }) => app.confirmPantryItem(item.id))}
                className="press w-full rounded-xl border px-3 py-2.5 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Confirm all {confidenceChecks.length} stock rows
              </button>
            )}
            {confidenceChecks.slice(0, 8).map(({ item, confidence }) => (
              <div key={item.id} className="flex items-center gap-3">
                <Glyph e={item.emoji} size={20} style={{ color: 'var(--muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[0.8125rem] truncate">{item.name}</p>
                  <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{confidence.reason}</p>
                </div>
                <button
                  onClick={() => app.confirmPantryItem(item.id)}
                  aria-label={`Confirm ${item.name}`}
                  className="press shrink-0 rounded-xl border px-2.5 py-1.5 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Confirm stock
                </button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {conflicts.length > 0 && (
        <Section title={`Pantry conflicts · ${conflicts.length}`} className="!px-0">
          <Card className="space-y-3">
            {conflicts.slice(0, 8).map((conflict) => (
              <div key={conflict.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--line)' }}>
                <p className="font-bold text-[0.8125rem]">{conflict.title}</p>
                <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{conflict.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'keep_separate')}
                    className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    Keep separate
                  </button>
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'merge')}
                    className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    Merge as written
                  </button>
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'dismiss')}
                    className="press rounded-xl px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ color: 'var(--faint)' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {/* What's going off, and what waste has cost you */}
      {(buckets.length > 0 || app.wasted.count > 0) && (
        <Section title="Use-by dates" className="!px-0">
          {buckets.map((bucket) => (
            <div key={bucket.id} className="mb-2.5">
              <p className="mb-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: bucket.id === 'gone' ? 'var(--danger)' : 'var(--faint)' }}>
                {bucket.label} · {bucket.items.length}
              </p>
              <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
                {bucket.items.map(({ item, days }) => (
                  <div key={item.id} className="flex items-center gap-3 p-3">
                    <Glyph e={item.emoji} size={20} style={{ color: 'var(--muted)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[0.875rem] truncate">{item.name}</p>
                      <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {pantryUncertaintyLabel(item, app.day)}{days !== null ? ` · ${expiryStatus(days).label}` : ''}{item.cost > 0 ? ` · ${gbp(item.cost, { always: true })}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => app.binPantryItem(item.id)}
                      className="press rounded-full border px-3 py-1.5 text-[0.75rem] font-extrabold shrink-0"
                      style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                    >
                      Threw it away
                    </button>
                  </div>
                ))}
              </Card>
            </div>
          ))}
          {undated > 0 && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {undated} item{undated === 1 ? ' has' : 's have'} no use-by date, so {undated === 1 ? 'it isn’t' : 'they aren’t'} tracked here.
            </p>
          )}
          {app.wasted.count > 0 && (
            <Card className="mt-2 flex items-center gap-3 !p-3">
              <TrendingDown size={16} style={{ color: 'var(--muted)' }} />
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                You’ve binned {app.wasted.count} item{app.wasted.count === 1 ? '' : 's'}, worth{' '}
                {gbp(app.wasted.cost, { always: true })} at what you paid
                {app.wasted.worst?.cost > 0 && ` — the priciest was ${app.wasted.worst.name}`}.
              </p>
            </Card>
          )}
        </Section>
      )}

      {empty ? (
        <Card className="text-center py-10">
          <Package size={30} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
          <p className="font-bold">Your pantry is empty</p>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Add what you have in and Forq can tell you what's about to go off, what a
            recipe still needs, and what your kitchen is worth.
          </p>
        </Card>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your pantry…"
            aria-label="Search pantry"
            className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Pantry status filter"
              className="rounded-xl border px-3 py-2.5 text-[0.75rem] font-bold"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            >
              <option value="all">All stock</option>
              <option value="low">Running low</option>
              <option value="unknown">Unknown stock</option>
              <option value="sufficient">Confirmed sufficient</option>
              <option value="probable">Probably have</option>
              <option value="expiring">Expiring this week</option>
              <option value="dated">Has expiry date</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort pantry"
              className="rounded-xl border px-3 py-2.5 text-[0.75rem] font-bold"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            >
              <option value="expiry">Expiry first</option>
              <option value="name">Name A–Z</option>
              <option value="value">Highest value</option>
              <option value="recent">Recently added</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {['All', ...LOCATIONS].map((loc) => (
              <Chip key={loc} active={location === loc} onClick={() => setLocation(loc)}>{loc}</Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5" aria-label="Pantry categories">
            {['All', ...CATEGORIES].map((cat) => (
              <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)}>{cat}</Chip>
            ))}
          </div>

          {location === 'All' && !query && expiring.length > 0 && (
            <Section
              title="Use soon"
              action={onPlan ? 'Open meal planner' : undefined}
              onAction={onPlan}
              className="!px-0"
            >
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5">
                {expiring.map((p) => {
                  const st = expiryStatus(daysUntil(p.expiry, app.day));
                  return (
                    <Card key={p.id} className="w-[150px] shrink-0 !p-3">
                      <Glyph e={p.emoji} size={22} style={{ color: 'var(--muted)' }} />
                      <p className="mt-1 font-bold text-[0.8125rem] leading-tight">{p.name}</p>
                      <div className="mt-1.5"><Pill tone={st.tone}>{st.label}</Pill></div>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}

          {items.length === 0 && (
            app.pantry.length === 0 ? (
              <Empty
                Icon={Package}
                title="Your pantry is empty"
                action="Add an item"
                onAction={() => { setAdding(true); setCapturing(false); setScanning(false); }}
                note="Or photograph a shelf, or scan a barcode."
              >
                Until it knows what you have, recipes can’t say what you’re missing and nothing can
                warn you about a use-by date.
              </Empty>
            ) : (
              <Empty title="Nothing matches">
                {query.trim()
                  ? `No pantry item matches “${query.trim()}”.`
                  : `Nothing is stored in ${location.toLowerCase()} right now.`}
              </Empty>
            )
          )}

          <Card className={cx('!p-0 divide-y', items.length === 0 && 'hidden')} style={{ borderColor: 'var(--line)' }}>
            {items.map((p) => {
              const days = p.expiry ? daysUntil(p.expiry, app.day) : null;
              const st = days === null ? null : expiryStatus(days); const useLabel = pantryUseLabel(p);
              const fresh = freshnessOf(p, app.day);
              const confidence = pantryConfidenceLevel(p, app.day);
              const menuActions = [
                { label: p.low ? 'Mark stocked' : 'Mark running low', onClick: () => app.togglePantryLow(p.id) },
                { label: useLabel, onClick: () => app.usePantryItem(p.id) },
                { label: p.openedDate ? 'Opened — reset opened date' : 'Mark opened today', onClick: () => app.updatePantryItem(p.id, { openedDate: p.openedDate ? null : app.day }) },
                { label: 'Add to shopping list', onClick: () => app.addToList({ name: p.name, emoji: p.emoji, qty: p.qty }) },
                { label: 'Remove', tone: 'danger', onClick: () => app.removePantryItem(p.id) },
              ];
              if (confidence.requiresConfirmation) {
                menuActions.unshift({ label: 'Confirm stock', onClick: () => app.confirmPantryItem(p.id) });
              }
              if (p.location === 'Freezer') {
                menuActions.splice(3, 0, { label: 'Move to fridge (thaw)', onClick: () => app.updatePantryItem(p.id, { location: 'Fridge' }) });
              } else if (p.cat !== 'Leftovers') {
                menuActions.splice(3, 0, { label: 'Move to freezer', onClick: () => app.updatePantryItem(p.id, { location: 'Freezer' }) });
              }
              return (
                <GestureMenu
                  key={p.id}
                  label={p.name}
                  actions={menuActions}
                  onSwipeLeft={() => app.removePantryItem(p.id)}
                  onSwipeRight={() => app.togglePantryLow(p.id)}
                >
                  <div className="flex items-center gap-3 p-3" style={{ borderColor: 'var(--line)' }}>
                  <Glyph e={p.emoji} size={22} style={{ color: 'var(--muted)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[0.875rem] truncate">{p.name}</p>
                    <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                      {[p.qty, p.location, p.store].filter(Boolean).join(' · ') || p.cat}
                    </p>
                    {fresh.kind !== 'unknown' && (
                      <p className="text-[0.65625rem] font-semibold" style={{ color: 'var(--muted)' }}>{fresh.label}</p>
                    )}
                    <p className="text-[0.65625rem] font-bold" style={{ color: confidence.requiresConfirmation ? 'var(--warn)' : 'var(--faint)' }}>
                      {pantryUncertaintyLabel(p, app.day)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.cost > 0 && <p className="font-bold text-[0.8125rem]">{gbp(p.cost, { always: true })}</p>}
                    {st && <Pill tone={st.tone}>{st.label}</Pill>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => app.usePantryItem(p.id)} aria-label={`${useLabel} ${p.name}`} title={useLabel} className="press p-1" style={{ color: 'var(--muted)' }}><Minus size={15} /></button>
                    {confidence.requiresConfirmation && (
                      <button
                        onClick={() => app.confirmPantryItem(p.id)}
                        aria-label={`Confirm ${p.name}`}
                        title="Confirm stock"
                        className="press p-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <Check size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => app.togglePantryLow(p.id)}
                      aria-label={`Mark ${p.name} ${p.low ? 'stocked' : 'running low'}`}
                      className="press p-1"
                      style={{ color: p.low ? 'var(--warn)' : 'var(--faint)' }}
                    >
                      {p.low ? <TriangleAlert size={15} /> : <Check size={15} />}
                    </button>
                    <button
                      onClick={() => app.removePantryItem(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="press p-1"
                      style={{ color: 'var(--faint)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                </GestureMenu>
              );
            })}
          </Card>

          {app.pantry.some((p) => p.low) && (
            <button
              onClick={() => app.addToList(app.pantry.filter((p) => p.low).map((p) => ({ name: p.name, emoji: p.emoji, qty: p.qty })))}
              className="press w-full rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <ShoppingCart size={15} /> Add {app.pantry.filter((p) => p.low).length} low items to the shopping list
              </span>
            </button>
          )}

          <Section title="Pantry analytics" className="!px-0">
            <Card>
              <div className="flex items-center gap-2">
                <BarChart3 size={16} style={{ color: 'var(--muted)' }} />
                <p className="text-[0.8125rem] font-bold">
                  {analytics.dated} of {analytics.total} items have expiry dates
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>By location</p>
                  {analytics.byLocation.slice(0, 4).map((row) => (
                    <p key={row.label} className="mt-1 flex justify-between text-[0.75rem] font-semibold">
                      <span>{row.label}</span><span>{row.count}</span>
                    </p>
                  ))}
                </div>
                <div>
                  <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>By category</p>
                  {analytics.byCategory.slice(0, 4).map((row) => (
                    <p key={row.label} className="mt-1 flex justify-between text-[0.75rem] font-semibold">
                      <span>{row.label}</span><span>{row.count}</span>
                    </p>
                  ))}
                </div>
              </div>
            </Card>
          </Section>

          <button
            onClick={() => app.set({ autoUsePantry: !app.autoUsePantry })}
            className="press w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left"
            style={{ borderColor: app.autoUsePantry ? 'var(--accent)' : 'var(--line)' }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 shrink-0"
              style={app.autoUsePantry
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
                : { borderColor: 'var(--line)', color: 'transparent' }}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            <span>
              <span className="block font-bold text-[0.875rem]">Auto-remove cooked ingredients</span>
              <span className="block text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Completing a recipe removes matching inventory rows.
              </span>
            </span>
          </button>

        </>
      )}
      <PantryShare />
    </div>
  );
}
