import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Heart, Scale, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { cx } from '../lib/utils.js';
import { NUTRIENTS, formatAmount } from '../data/nutrients.js';
import { MEALS, entryNumbers, mealForTime, nutrientNumber, scale, servingOptions, timeStamp } from '../lib/nutrition.js';
import { healthierSwaps } from '../lib/advice.js';
import { Card, Chip, Pill, Stepper } from './ui.jsx';
import { Glyph } from './icons.jsx';

/* ---------- Shared bits reused by the other logging surfaces ---------- */

export const MealPicker = ({ value, onChange }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar">
    {MEALS.map((m) => (
      <Chip key={m.key} active={value === m.key} onClick={() => onChange(m.key)}>{m.label}</Chip>
    ))}
  </div>
);

/** macros may contain null for unmeasured nutrients — never show those as 0. */
export const MacroSummary = ({ macros, size = 'lg' }) => {
  const kcal = nutrientNumber(macros?.kcal);
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className={cx('font-extrabold leading-none', size === 'lg' ? 'text-[2.125rem]' : 'text-[1.375rem]')}>
          {kcal === null || kcal === undefined ? '—' : kcal.toLocaleString()}
        </p>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>kcal</p>
      </div>
      <div className="flex gap-4 text-right">
        {[['Protein', 'protein'], ['Carbs', 'carbs'], ['Fat', 'fat']].map(([label, key]) => (
          <div key={label}>
            <p className="text-[0.9375rem] font-extrabold leading-none">{formatAmount(key, nutrientNumber(macros?.[key]))}</p>
            <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const NumberField = ({ label, value, onChange, suffix, step = 1, min = 0 }) => (
  <label className="block">
    <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</span>
    <div className="mt-1 flex items-center gap-1 rounded-2xl border px-3 py-2.5" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-[0.9375rem] font-bold outline-none"
        style={{ color: 'var(--ink)' }}
      />
      {suffix && <span className="text-[0.75rem] font-bold shrink-0" style={{ color: 'var(--faint)' }}>{suffix}</span>}
    </div>
  </label>
);

function HealthierSwaps({ food }) {
  const app = useApp();
  const swaps = useMemo(
    () => healthierSwaps(food, { catalogue: app.catalogue, diets: app.planDiets }),
    [food, app.catalogue, app.planDiets],
  );
  if (!swaps.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Similar, but better on paper
      </p>
      <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
        {swaps.map(({ food: alt, why, kcalDiff }) => (
          <div key={alt.id} className="flex items-center gap-3 p-2.5">
            <Glyph e={alt.emoji} size={18} style={{ color: 'var(--muted)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.84375rem] font-bold truncate">{alt.name}</p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {why}{kcalDiff ? ` · ${kcalDiff > 0 ? '+' : ''}${kcalDiff} kcal per 100 g` : ''}
              </p>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function FoodDetail({ food, entry, defaultMeal, onSave, onDelete }) {
  const app = useApp();
  const source = food || (entry && { ...entry, id: entry.foodId, servings: [] });
  const isQuick = !source?.per100;

  const options = useMemo(
    () => (isQuick ? [] : servingOptions(source, entry?.grams)),
    [source, entry, isQuick],
  );

  const startGrams = entry?.grams ?? options[0]?.grams ?? 100;
  const [grams, setGrams] = useState(startGrams);
  const [qty, setQty] = useState(1);
  const [servingIdx, setServingIdx] = useState(() => {
    const i = options.findIndex((o) => Math.abs(o.grams - startGrams) < 0.01);
    return i >= 0 ? i : 0;
  });
  const [meal, setMeal] = useState(entry?.meal || defaultMeal || mealForTime());
  const [time, setTime] = useState(entry?.time || timeStamp());
  const [quick, setQuick] = useState(() => {
    const n = entry?.nutrients || {};
    return {
      kcal: nutrientNumber(n.kcal) ?? '',
      protein: nutrientNumber(n.protein) ?? '',
      carbs: nutrientNumber(n.carbs) ?? '',
      fat: nutrientNumber(n.fat) ?? '',
    };
  });
  const [showAll, setShowAll] = useState(false);

  const unit = source?.unit || 'g';
  const fav = app.favouriteFoods.includes(source?.id);

  const macros = isQuick
    ? entryNumbers({ nutrients: {
      kcal: quick.kcal === '' ? null : Number(quick.kcal),
      protein: quick.protein === '' ? null : Number(quick.protein),
      carbs: quick.carbs === '' ? null : Number(quick.carbs),
      fat: quick.fat === '' ? null : Number(quick.fat),
    }, source: 'quick' })
    : scale(source.per100, grams, source.source);

  const pickServing = (i) => {
    setServingIdx(i);
    setQty(1);
    setGrams(options[i].grams);
  };
  const changeQty = (next) => {
    setQty(next);
    setGrams(+(options[servingIdx].grams * next).toFixed(1));
  };
  const typeWeight = (v) => {
    const g = Math.max(0, Number(v) || 0);
    setGrams(g);
    setQty(1);
    const i = options.findIndex((o) => Math.abs(o.grams - g) < 0.01);
    setServingIdx(i >= 0 ? i : -1);
  };

  const save = () => {
    const servingLabel = servingIdx >= 0
      ? (qty === 1 ? options[servingIdx].label : `${qty} × ${options[servingIdx].label}`)
      : `${grams} ${unit}`;
    onSave(isQuick
      ? {
        meal,
        time,
        nutrients: {
          kcal: quick.kcal === '' ? null : Number(quick.kcal),
          protein: quick.protein === '' ? null : Number(quick.protein),
          carbs: quick.carbs === '' ? null : Number(quick.carbs),
          fat: quick.fat === '' ? null : Number(quick.fat),
        },
      }
      : { grams, meal, time, servingLabel });
  };

  if (!source) return null;

  const displayKcal = nutrientNumber(macros.kcal);

  return (
    <div className="px-5 pb-8 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--card-2)', color: 'var(--muted)' }}>
          <Glyph e={source.emoji} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[1.0625rem] leading-tight">{source.name}</p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {source.brand || 'Generic'}{!isQuick && source.per100?.kcal != null && ` · ${source.per100.kcal} kcal / 100 ${unit}`}
          </p>
        </div>
        {source.id && !isQuick && (
          <button
            onClick={() => app.toggleFavouriteFood(source.id)}
            aria-label="Favourite food"
            className="press flex h-9 w-9 items-center justify-center rounded-full border shrink-0"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: fav ? 'var(--ink)' : 'var(--faint)' }}
          >
            <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <Card>
        <MacroSummary macros={macros} />
        {!isQuick && (
          <>
            <p className="mt-3 pt-3 border-t text-[0.75rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
              {grams} {unit} · fibre {formatAmount('fibre', macros.fibre)} · sugar {formatAmount('sugar', macros.sugar)}
              {' '}· sodium {formatAmount('sodium', macros.sodium)}
            </p>
            <button
              onClick={() => setShowAll((v) => !v)}
              className="press mt-2 inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
              style={{ color: 'var(--accent)' }}
            >
              {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAll ? 'Hide' : 'All'} nutrients in this portion
            </button>
            {showAll && (
              <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderColor: 'var(--line)' }}>
                {NUTRIENTS.filter((n) => n.key !== 'kcal').map((n) => (
                  <div key={n.key} className="flex justify-between text-[0.71875rem]">
                    <span className="font-semibold truncate" style={{ color: 'var(--muted)' }}>{n.label}</span>
                    <span className="font-bold tabular-nums shrink-0">{formatAmount(n.key, macros[n.key])}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {isQuick ? (
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="Calories" value={quick.kcal} onChange={(v) => setQuick((q) => ({ ...q, kcal: v }))} suffix="kcal" step={10} />
          <NumberField label="Protein" value={quick.protein} onChange={(v) => setQuick((q) => ({ ...q, protein: v }))} suffix="g" />
          <NumberField label="Carbs" value={quick.carbs} onChange={(v) => setQuick((q) => ({ ...q, carbs: v }))} suffix="g" />
          <NumberField label="Fat" value={quick.fat} onChange={(v) => setQuick((q) => ({ ...q, fat: v }))} suffix="g" />
        </div>
      ) : (
        <>
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Serving size</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
              {options.map((o, i) => (
                <Chip key={o.label} active={i === servingIdx} onClick={() => pickServing(i)}>{o.label}</Chip>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--faint)' }}>How many</p>
              <Stepper value={qty} onChange={changeQty} min={1} max={10} />
            </div>
            <div className="w-[46%]">
              <NumberField
                label={<span>Weigh it</span>}
                value={grams}
                onChange={typeWeight}
                suffix={unit}
                step={5}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Scale size={13} style={{ color: 'var(--faint)' }} />
            <input
              type="range"
              min="5"
              max={Math.max(600, Math.round(startGrams * 3))}
              step="5"
              value={grams}
              onChange={(e) => typeWeight(e.target.value)}
              aria-label="Portion weight"
              className="w-full accent-current"
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>
        </>
      )}

      <HealthierSwaps food={food} />

      <div className="space-y-2.5">
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Meal</p>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[0.8125rem] font-bold">Time eaten</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time eaten"
            className="rounded-2xl border px-3 py-2 text-[0.875rem] font-bold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </div>
      </div>

      <div className="flex gap-2.5 pt-1">
        {onDelete && (
          <button
            onClick={onDelete}
            className="press rounded-2xl border px-4 py-3.5 font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--danger)' }}
            aria-label="Delete entry"
          >
            <Trash2 size={17} />
          </button>
        )}
        <button
          onClick={save}
          className="press flex-1 rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-2">
            <Check size={16} strokeWidth={3} />
            {entry
              ? 'Save changes'
              : `Add ${displayKcal === null ? 'entry' : `${displayKcal} kcal`} to ${MEALS.find((m) => m.key === meal).label}`}
          </span>
        </button>
      </div>

      {!entry && (
        <p className="text-center">
          <Pill tone="faint">Logged foods appear in Recent for one-tap re-logging</Pill>
        </p>
      )}
    </div>
  );
}
