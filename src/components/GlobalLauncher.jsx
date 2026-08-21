import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Apple, BookOpen, Command, Package, Plus, Search, ShoppingCart, Sparkles, Undo2,
  Utensils, Waves,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { buildGlobalResults } from '../lib/global-search.js';
import { Sheet } from './ui.jsx';

const TYPE_LABELS = {
  command: 'Command',
  food: 'Food',
  recipe: 'Recipe',
  pantry: 'Pantry',
  shopping: 'Shopping',
};

const ResultIcon = ({ type }) => {
  const Icon = {
    command: Command,
    food: Apple,
    recipe: BookOpen,
    pantry: Package,
    shopping: ShoppingCart,
  }[type] || Search;
  return <Icon size={16} />;
};

export function CommandPalette({ open, onClose, onRun }) {
  const app = useApp();
  const input = useRef(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('relevance');
  const results = useMemo(
    () => buildGlobalResults(app, query, { type, sort }).slice(0, 40),
    [app, query, type, sort],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setType('all');
    setSort('relevance');
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Command palette">
      <div className="px-5 pb-8 space-y-3">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-3.5" style={{ color: 'var(--faint)' }} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) onRun(results[0]);
            }}
            aria-label="Search Forq"
            placeholder="Search everything or type a command…"
            className="w-full rounded-2xl border py-3 pl-10 pr-4 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            aria-label="Result type"
            className="rounded-xl border px-3 py-2 text-[0.75rem] font-bold"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <option value="all">All results</option>
            {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort results"
            className="rounded-xl border px-3 py-2 text-[0.75rem] font-bold"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <option value="relevance">Best match</option>
            <option value="name">A–Z</option>
          </select>
        </div>
        <div className="rounded-2xl border divide-y overflow-hidden" style={{ borderColor: 'var(--line)' }}>
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => onRun(result)}
              className="press flex w-full items-center gap-3 p-3 text-left"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--card-2)', color: 'var(--muted)' }}>
                <ResultIcon type={result.type} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.84375rem] font-extrabold">{result.title}</span>
                <span className="block truncate text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {TYPE_LABELS[result.type]} · {result.subtitle}
                </span>
              </span>
            </button>
          ))}
          {!results.length && (
            <p className="p-6 text-center text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Nothing matched. Try fewer words or another result type.
            </p>
          )}
        </div>
        <p className="text-center text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          Ctrl K search · Q quick add · Ctrl Z undo · 1–6 switch tabs
        </p>
      </div>
    </Sheet>
  );
}

export function QuickAdd({ open, onClose, onRun, onAddShopping }) {
  const [shoppingName, setShoppingName] = useState('');
  const shoppingInput = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setShoppingName('');
    const timer = setTimeout(() => shoppingInput.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const submitShopping = (event) => {
    event.preventDefault();
    const name = shoppingName.trim();
    if (!name || !onAddShopping) return;
    onAddShopping(name);
  };

  const actions = [
    ['food', 'Food', 'Search, scan, photograph or speak', Utensils],
    ['shopping', 'Shopping item', 'Open your list and add an item', ShoppingCart],
    ['pantry', 'Pantry item', 'Put something into your kitchen', Package],
    ['plan', 'Meal plan', 'Choose a meal or generate a plan', BookOpen],
    ['water', 'Glass of water', 'Add 250 ml now', Waves],
    ['assistant', 'Ask Forq', 'Open Guidance and ask a question', Sparkles],
    ['undo', 'Undo last action', 'Revert your latest saved change', Undo2],
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <div className="px-5 pb-8 space-y-3">
        <form onSubmit={submitShopping} className="rounded-2xl border p-3" style={{ background: 'var(--card-2)', borderColor: 'var(--line)' }}>
          <label htmlFor="quick-shopping-item" className="block text-[0.75rem] font-extrabold">Add to shopping list</label>
          <div className="mt-2 flex gap-2">
            <input
              ref={shoppingInput}
              id="quick-shopping-item"
              value={shoppingName}
              onChange={(event) => setShoppingName(event.target.value)}
              aria-label="Quick shopping item"
              placeholder="Milk, bananas…"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[0.8125rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              disabled={!shoppingName.trim() || !onAddShopping}
              className="press rounded-xl px-3 py-2.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}
            >
              Add
            </button>
          </div>
          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Press Enter to add it without opening another form.</p>
        </form>
        <div className="grid grid-cols-2 gap-2.5">
        {actions.map(([id, title, subtitle, Icon]) => (
          <button
            key={id}
            onClick={() => onRun(id)}
            className="press rounded-2xl border p-3 text-left"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <Icon size={17} style={{ color: 'var(--muted)' }} />
            <span className="mt-2 block text-[0.84375rem] font-extrabold">{title}</span>
            <span className="mt-0.5 block text-[0.71875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>{subtitle}</span>
          </button>
        ))}
        </div>
      </div>
    </Sheet>
  );
}

export function LauncherButtons({ onSearch, onQuickAdd }) {
  return (
    <div
        className="launcher-buttons fixed z-40 flex gap-2"
      // Clear of the screen's primary action, which sits in the thumb zone
      // just above the tab bar.
      style={{
        left: 'max(1.25rem, calc(50vw - 16rem + 1.25rem))',
        bottom: 'calc(9rem + env(safe-area-inset-bottom))',
      }}
    >
      <button
        onClick={onSearch}
        aria-label="Global search"
        className="press flex h-11 w-11 items-center justify-center rounded-full border"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', boxShadow: 'var(--shadow)' }}
      >
        <Search size={18} />
      </button>
      <button
        onClick={onQuickAdd}
        aria-label="Quick add"
        className="press flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: 'var(--shadow)' }}
      >
        <Plus size={19} />
      </button>
    </div>
  );
}
