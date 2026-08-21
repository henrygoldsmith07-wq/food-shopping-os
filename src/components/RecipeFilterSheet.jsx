import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { DIET_PATTERNS } from '../data/goals.js';
import { Chip, Pill } from './ui.jsx';

const TIME_STEPS = [
  { label: 'Any time', value: null },
  { label: '≤ 15 min', value: 15 },
  { label: '≤ 25 min', value: 25 },
  { label: '≤ 45 min', value: 45 },
];

const SHOPPING = [
  { label: 'Anything', value: null },
  { label: 'Missing ≤ 2', value: 2 },
  { label: 'Can make now', value: 0 },
];

const DIET_IDS = DIET_PATTERNS.filter((d) => d.kind !== 'macro').map((d) => d.id);

/** Filters that read as sentences: what's in it, what isn't, how long, whose diet. */
function FilterSheet({ filters, setFilters, onClose, results }) {
  const app = useApp();
  const [term, setTerm] = useState('');
  const [field, setField] = useState('include');

  const addTerm = () => {
    const value = term.trim();
    if (!value) return;
    setFilters((f) => ({ ...f, [field]: [...new Set([...f[field], value])] }));
    setTerm('');
  };

  const drop = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].filter((v) => v !== value) }));

  return (
    <div className="px-5 pb-10 space-y-5">
      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Ingredients</p>
        <div className="flex gap-2">
          <Chip active={field === 'include'} onClick={() => setField('include')}>With</Chip>
          <Chip active={field === 'exclude'} onClick={() => setField('exclude')}>Without</Chip>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTerm()}
            placeholder={field === 'include' ? 'chicken, spinach…' : 'mushrooms, coriander…'}
            aria-label={field === 'include' ? 'Ingredient to include' : 'Ingredient to exclude'}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <button
            onClick={addTerm}
            className="press rounded-xl px-4 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <Plus size={15} />
          </button>
        </div>
        {(filters.include.length > 0 || filters.exclude.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {filters.include.map((t) => (
              <button key={`in-${t}`} onClick={() => drop('include', t)} className="press">
                <Pill tone="accent">with {t} <X size={11} /></Pill>
              </button>
            ))}
            {filters.exclude.map((t) => (
              <button key={`ex-${t}`} onClick={() => drop('exclude', t)} className="press">
                <Pill tone="warn">without {t} <X size={11} /></Pill>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Cooking time</p>
        <div className="flex flex-wrap gap-2">
          {TIME_STEPS.map((t) => (
            <Chip key={t.label} active={filters.maxTime === t.value} onClick={() => setFilters((f) => ({ ...f, maxTime: t.value }))}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Diet</p>
        <div className="flex flex-wrap gap-2">
          {DIET_PATTERNS.filter((d) => d.kind !== 'macro').map((d) => (
            <Chip
              key={d.id}
              active={filters.diets.includes(d.id)}
              onClick={() => setFilters((f) => ({
                ...f,
                diets: f.diets.includes(d.id) ? f.diets.filter((x) => x !== d.id) : [...f.diets, d.id],
              }))}
            >
              {d.label}
            </Chip>
          ))}
        </div>
        {app.planDiets.length > 0 && (
          <button
            onClick={() => setFilters((f) => ({ ...f, diets: [...new Set([...f.diets, ...app.planDiets.filter((d) => DIET_IDS.includes(d))])] }))}
            className="press mt-2 text-[0.78125rem] font-extrabold"
            style={{ color: 'var(--accent)' }}
          >
            Use my patterns ({app.planDiets.join(', ')})
          </button>
        )}
      </div>

      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Shopping</p>
        <div className="flex flex-wrap gap-2">
          {SHOPPING.map((s) => (
            <Chip key={s.label} active={filters.maxMissing === s.value} onClick={() => setFilters((f) => ({ ...f, maxMissing: s.value }))}>
              {s.label}
            </Chip>
          ))}
        </div>
        {filters.maxMissing !== null && app.pantry.length === 0 && (
          <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your pantry is empty, so nothing counts as makeable yet.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="press flex-[2] rounded-2xl py-3 text-[0.875rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Show {results} recipe{results === 1 ? '' : 's'}
        </button>
        <button
          onClick={() => setFilters({ diets: [], maxTime: null, include: [], exclude: [], maxMissing: null })}
          className="press flex-1 rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default FilterSheet;
