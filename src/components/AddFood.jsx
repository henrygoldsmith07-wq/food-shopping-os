import { useMemo, useState } from 'react';
import {
  Camera, ChevronDown, ChevronRight, ChevronUp, Clock, Heart, Link2, Mic, Plus,
  ScanBarcode, Search, SlidersHorizontal, Trash2, Zap,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { searchFoods, makeCustomFood } from '../lib/foodlog.js';
import { buildQuickEntry, defaultServing, scale } from '../lib/nutrition.js';
import { QUICK_ADD_PRESETS, RESTAURANTS } from '../data/foods.js';
import { NUTRIENTS } from '../data/nutrients.js';
import { dietConflicts } from '../lib/goals.js';
import { Card, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';
import { MealPicker, NumberField } from './FoodDetail.jsx';

const TABS = [
  { id: 'search', label: 'Search' },
  { id: 'recent', label: 'Recent' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'restaurant', label: 'Eating out' },
  { id: 'mine', label: 'My foods' },
];

const CAPTURE = [
  { id: 'barcode', label: 'Scan barcode', Icon: ScanBarcode },
  { id: 'photo', label: 'Photo', Icon: Camera },
  { id: 'voice', label: 'Voice', Icon: Mic },
  { id: 'import', label: 'Import recipe', Icon: Link2 },
  { id: 'copy', label: 'Copy meal', Icon: Clock },
];

const EMPTY_FILTERS = {
  fitsDiet: false,
  highProtein: false,
  highFibre: false,
  under300: false,
  category: 'all',
};

const CATEGORY_FILTERS = [
  { id: 'all', label: 'Any type' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snacks' },
  { id: 'drink', label: 'Drinks' },
];

export const filterFoodList = (foods, filters = EMPTY_FILTERS, diets = []) =>
  foods.filter((food) => {
    const macros = scale(food.per100, defaultServing(food).grams);
    if (filters.fitsDiet && dietConflicts(food, diets).length > 0) return false;
    if (filters.highProtein && macros.protein < 15) return false;
    if (filters.highFibre && (macros.fibre || 0) < 5) return false;
    if (filters.under300 && macros.kcal > 300) return false;
    if (filters.category !== 'all' && !(food.tags || []).includes(filters.category)) return false;
    return true;
  });

/** One tappable catalogue row: what it is, and what a serving of it costs you. */
export const FoodRow = ({ food, onPick, right }) => {
  const app = useApp();
  const serving = defaultServing(food);
  const macros = scale(food.per100, serving.grams);
  const fav = app.favouriteFoods.includes(food.id);
  const clashes = dietConflicts(food, app.diets);
  return (
    <div className="flex items-center gap-3 p-3" style={{ borderColor: 'var(--line)' }}>
      <button onClick={() => onPick(food)} className="press flex flex-1 items-center gap-3 min-w-0 text-left">
        <Glyph e={food.emoji} size={20} style={{ color: 'var(--muted)' }} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-[0.875rem] truncate">{food.name}</span>
          <span className="block text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
            {food.brand ? `${food.brand} · ` : ''}{serving.label} · {macros.protein}g protein
          </span>
          {clashes.length > 0 && (
            <span className="mt-1 inline-flex"><Pill tone="warn">not {clashes.join(' / ').toLowerCase()}</Pill></span>
          )}
        </span>
        <span className="text-right shrink-0">
          <span className="block font-extrabold text-[0.875rem]">{macros.kcal}</span>
          <span className="block text-[0.625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>kcal</span>
        </span>
      </button>
      {right || (
        <button
          onClick={() => app.toggleFavouriteFood(food.id)}
          aria-label={`Favourite ${food.name}`}
          className="press shrink-0 p-1"
          style={{ color: fav ? 'var(--ink)' : 'var(--faint)' }}
        >
          <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
};

const EmptyRow = ({ children }) => (
  <p className="p-6 text-center text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{children}</p>
);

/* ---------- Quick add ---------- */

function QuickAddPanel({ defaultMeal, onDone }) {
  const app = useApp();
  const [meal, setMeal] = useState(defaultMeal);
  const [v, setV] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const kcal = Number(v.kcal) || 0;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.9375rem]">Quick add calories</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          No food, no searching — just the number. Macros are optional.
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {QUICK_ADD_PRESETS.map((p) => (
          <Chip key={p.label} onClick={() => setV({ kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat })}>
            {p.label} · {p.kcal}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Calories" value={v.kcal} onChange={(x) => setV({ ...v, kcal: x })} suffix="kcal" step={10} />
        <NumberField label="Protein" value={v.protein} onChange={(x) => setV({ ...v, protein: x })} suffix="g" />
        <NumberField label="Carbs" value={v.carbs} onChange={(x) => setV({ ...v, carbs: x })} suffix="g" />
        <NumberField label="Fat" value={v.fat} onChange={(x) => setV({ ...v, fat: x })} suffix="g" />
      </div>
      <MealPicker value={meal} onChange={setMeal} />
      <button
        disabled={kcal <= 0}
        onClick={() => { app.logEntry(buildQuickEntry({ ...v, meal })); onDone(); }}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Add {kcal || 0} kcal
      </button>
    </Card>
  );
}

/* ---------- Custom food ---------- */

const BLANK_FOOD = { name: '', brand: '', servingGrams: 100, unit: 'g', kcal: '', protein: '', carbs: '', fat: '', fibre: '' };

function CustomFoodForm({ onCreated }) {
  const app = useApp();
  const [draft, setDraft] = useState(BLANK_FOOD);
  const [errors, setErrors] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const field = (k) => (val) => setDraft((d) => ({ ...d, [k]: val }));

  // Everything past the headline macros — filled in from the packet if you have it.
  const extraNutrients = NUTRIENTS.filter((n) => !['kcal', 'protein', 'carbs', 'fat'].includes(n.key));

  const submit = () => {
    const { errors: errs, food } = makeCustomFood(draft);
    setErrors(errs);
    if (food) {
      app.addCustomFood(food);
      setDraft(BLANK_FOOD);
      setShowAll(false);
      onCreated(food);
    }
  };

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.9375rem]">Create a custom food</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Nutrition per serving, straight off the packet.
        </p>
      </div>
      <input
        value={draft.name}
        onChange={(e) => field('name')(e.target.value)}
        placeholder="Name (e.g. Mum’s lasagne)"
        className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <input
        value={draft.brand}
        onChange={(e) => field('brand')(e.target.value)}
        placeholder="Brand (optional)"
        className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Serving size" value={draft.servingGrams} onChange={field('servingGrams')} suffix={draft.unit} step={5} />
        <div className="flex items-end gap-2 pb-1">
          {['g', 'ml'].map((u) => (
            <Chip key={u} active={draft.unit === u} onClick={() => field('unit')(u)}>{u}</Chip>
          ))}
        </div>
        <NumberField label="Calories" value={draft.kcal} onChange={field('kcal')} suffix="kcal" step={10} />
        <NumberField label="Protein" value={draft.protein} onChange={field('protein')} suffix="g" />
        <NumberField label="Carbs" value={draft.carbs} onChange={field('carbs')} suffix="g" />
        <NumberField label="Fat" value={draft.fat} onChange={field('fat')} suffix="g" />
      </div>

      <button
        onClick={() => setShowAll((v) => !v)}
        className="press inline-flex items-center gap-1.5 text-[0.78125rem] font-bold"
        style={{ color: 'var(--accent)' }}
      >
        {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showAll ? 'Hide' : 'Add'} fibre, vitamins, minerals & more
      </button>
      {showAll && (
        <div className="grid grid-cols-2 gap-2.5">
          {extraNutrients.map((n) => (
            <NumberField
              key={n.key}
              label={n.label}
              value={draft[n.key] ?? ''}
              onChange={field(n.key)}
              suffix={n.unit}
              step={n.dp ? 0.1 : 1}
            />
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {errors.map((e) => <Pill key={e} tone="danger">{e}</Pill>)}
        </div>
      )}
      <button
        onClick={submit}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Save food
      </button>
    </Card>
  );
}

/* ---------- Hub ---------- */

/**
 * The one place every logging route starts: search, the lists that make
 * repeat-logging fast (recent, favourites, my foods, eating out), the capture
 * shortcuts, quick-add and custom foods.
 */
export default function AddFood({
  defaultMeal = 'snack', initialQuery = '', onPick, onCapture,
}) {
  const app = useApp();
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState(initialQuery);
  const [chain, setChain] = useState(RESTAURANTS[0].chain);
  const [panel, setPanel] = useState(null); // 'quick' | 'custom'
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const results = useMemo(
    () => searchFoods(query, app.catalogue, app.catalogue.length),
    [query, app.catalogue],
  );
  const favourites = app.favouriteFoods.map((id) => app.catalogue.find((f) => f.id === id)).filter(Boolean);
  const restaurantFoods = app.catalogue.filter((f) => f.source === 'restaurant' && f.chain === chain);

  const unfilteredList = {
    search: results,
    recent: app.recentFoods,
    favourites,
    restaurant: restaurantFoods,
    mine: app.customFoods,
  }[tab];
  const list = filterFoodList(unfilteredList, filters, app.diets).slice(0, 40);
  const activeFilterCount = [
    filters.fitsDiet, filters.highProtein, filters.highFibre, filters.under300,
    filters.category !== 'all',
  ].filter(Boolean).length;
  const toggleFilter = (key) => setFilters((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="px-5 pb-10 space-y-4">
      {/* Capture routes */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        {CAPTURE.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onCapture(id)}
            className="press shrink-0 inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-3 text-[0.78125rem] font-bold"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <button
          onClick={() => setPanel(panel === 'quick' ? null : 'quick')}
          className="press shrink-0 inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-3 text-[0.78125rem] font-bold"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          <Zap size={14} /> Quick add
        </button>
      </div>

      {panel === 'quick' && <QuickAddPanel defaultMeal={defaultMeal} onDone={() => setPanel(null)} />}
      {panel === 'custom' && <CustomFoodForm onCreated={() => { setPanel(null); setTab('mine'); }} />}

      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border px-4 py-3" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
          <Search size={16} style={{ color: 'var(--faint)' }} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTab('search'); }}
            placeholder="Search foods, brands and menus…"
            aria-label="Search foods"
            className="w-full bg-transparent text-[0.875rem] font-semibold outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-label={`Food filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
          aria-expanded={filtersOpen}
          className="press relative grid w-[46px] shrink-0 place-items-center rounded-2xl border"
          style={{
            background: activeFilterCount ? 'var(--accent-soft)' : 'var(--card)',
            borderColor: activeFilterCount ? 'var(--accent)' : 'var(--line)',
            color: activeFilterCount ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          <SlidersHorizontal size={17} />
          {activeFilterCount > 0 && (
            <span
              className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.625rem] font-black text-white"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div
          role="group"
          aria-labelledby="food-filter-heading"
          className="rounded-2xl border p-3.5"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id="food-filter-heading" className="text-[0.8125rem] font-extrabold" style={{ color: 'var(--ink)' }}>Filter foods</h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="press text-[0.75rem] font-extrabold"
                style={{ color: 'var(--accent)' }}
              >
                Clear all
              </button>
            )}
          </div>

          <p className="mt-3 text-[0.625rem] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Nutrition</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['highProtein', '15g+ protein'],
              ['highFibre', '5g+ fibre'],
              ['under300', 'Under 300 kcal'],
              ['fitsDiet', 'Fits my diet'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleFilter(id)}
                aria-pressed={filters[id]}
                className="press rounded-full border px-3 py-2 text-[0.75rem] font-extrabold"
                style={{
                  background: filters[id] ? 'var(--accent-soft)' : 'transparent',
                  borderColor: filters[id] ? 'var(--accent)' : 'var(--line)',
                  color: filters[id] ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-[0.625rem] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Food type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((option) => {
              const active = filters.category === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, category: option.id }))}
                  aria-pressed={active}
                  className="press rounded-full border px-3 py-2 text-[0.75rem] font-extrabold"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    borderColor: active ? 'var(--accent)' : 'var(--line)',
                    color: active ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
            {list.length} {list.length === 1 ? 'food' : 'foods'} shown
          </p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
        ))}
      </div>

      {tab === 'restaurant' && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
          {RESTAURANTS.map((r) => (
            <Chip key={r.chain} active={chain === r.chain} onClick={() => setChain(r.chain)}>{r.chain}</Chip>
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <button
          onClick={() => setPanel(panel === 'custom' ? null : 'custom')}
          className="press w-full rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Plus size={15} /> New custom food</span>
        </button>
      )}

      <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
        {list.length === 0 && (
          <EmptyRow>
            {activeFilterCount > 0 ? 'No foods match these filters. Clear filters or try another search.'
              : tab === 'search' ? 'Nothing matched — try fewer words, scan a barcode, or create a custom food.'
              : tab === 'mine' ? 'No custom foods yet. Make one and it stays in your catalogue, weights and all.'
                : tab === 'favourites' ? 'Star a food and it lands here, ready to log in a tap.'
                  : 'Nothing logged yet. Once you have, your usual foods appear here first.'}
          </EmptyRow>
        )}
        {list.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onPick={onPick}
            right={tab === 'mine' ? (
              <button
                onClick={() => app.removeCustomFood(food.id)}
                aria-label={`Delete ${food.name}`}
                className="press shrink-0 p-1"
                style={{ color: 'var(--faint)' }}
              >
                <Trash2 size={15} />
              </button>
            ) : undefined}
          />
        ))}
      </Card>

      {tab === 'search' && !query && (
        <button
          onClick={() => onCapture('barcode')}
          className="press w-full flex items-center justify-between rounded-2xl border p-4"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          <span className="text-left">
            <span className="block font-bold text-[0.875rem]">Got the packet in your hand?</span>
            <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>Scanning the barcode is two taps.</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
        </button>
      )}
    </div>
  );
}
