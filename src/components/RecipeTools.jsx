import { useMemo, useState } from 'react';
import {
  ArrowLeftRight, Check, Copy, Info, Repeat, Share2, Sparkles,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { nutrientRows } from '../lib/nutrition.js';
import { formatAmount } from '../data/nutrients.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { recipeConflicts } from '../lib/goals.js';
import { swapsFor, swapsForDiet, recipeNutrition, shareCode } from '../lib/recipe-tools.js';
import { Card, Chip, Pill, Meter, Stepper } from './ui.jsx';

const SWAP_DIETS = [
  ['vegan', 'Make it vegan'],
  ['vegetarian', 'Make it vegetarian'],
  ['dairy-free', 'Make it dairy-free'],
  ['gluten-free', 'Make it gluten-free'],
  ['nut-free', 'Make it nut-free'],
];

/**
 * Ingredient substitutions.
 *
 * Every swap on offer names a real replacement, and applying one recomputes the
 * dish rather than relabelling it — so the calories, cost and diet tags you see
 * afterwards are the swapped dish's own.
 */
export function SwapPanel({ recipe, onSwap }) {
  const rows = useMemo(() => swapsFor(recipe), [recipe]);
  const [open, setOpen] = useState(null);

  const fits = SWAP_DIETS
    .filter(([diet]) => recipeConflicts(recipe, [diet]).length > 0 && swapsForDiet(recipe, diet).length > 0);

  if (!rows.length && !fits.length) return null;

  return (
    <Card className="rise rise-2">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Substitutions</p>

      {fits.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {fits.map(([diet, label]) => (
            <Chip key={diet} onClick={() => onSwap({ diet })}>
              <span className="inline-flex items-center gap-1.5"><Repeat size={12} /> {label}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {rows.map(({ ingredient, options }) => (
          <div key={ingredient}>
            <button
              onClick={() => setOpen(open === ingredient ? null : ingredient)}
              className="press flex w-full items-center justify-between py-1.5 text-left"
            >
              <span className="text-[0.84375rem] font-bold">{ingredient}</span>
              <span className="text-[0.75rem] font-extrabold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                <ArrowLeftRight size={12} /> {options.length} swap{options.length === 1 ? '' : 's'}
              </span>
            </button>
            {open === ingredient && (
              <div className="mb-2 space-y-2">
                {options.map((option) => (
                  <button
                    key={option.name}
                    onClick={() => { onSwap({ ingredient, option }); setOpen(null); }}
                    className="press w-full rounded-xl p-2.5 text-left"
                    style={{ background: 'var(--card-2)' }}
                  >
                    <p className="text-[0.8125rem] font-extrabold">{option.name}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{option.why}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** How many you're cooking for: amounts scale, a serving doesn't. */
export function ServingsControl({ servings, base, onChange, costPerServing }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Cooking for</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {gbp(costPerServing * servings, { always: true })} in total
          {servings !== base && ` · written for ${base}`}
        </p>
      </div>
      <Stepper value={servings} onChange={onChange} min={1} max={12} />
    </div>
  );
}

/**
 * The full nutritional breakdown of one serving: the macros the dish computed
 * from its own ingredients, then every micronutrient the food catalogue could
 * match. It states how much of the dish that estimate actually saw.
 */
export function NutritionBreakdown({ recipe }) {
  const app = useApp();
  const { totals, split, estimated, matched } = useMemo(
    () => recipeNutrition(recipe, app.catalogue),
    [recipe, app.catalogue],
  );
  const rows = nutrientRows(totals, app.targets).filter((r) => r.key !== 'kcal');

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
          Where the calories come from
        </p>
        <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--card-2)' }}>
          {[['protein', 'var(--nutrition-protein)'], ['carbs', 'var(--nutrition-carbs)'], ['fat', 'var(--nutrition-fat)']].map(([key, colour]) => (
            <div key={key} style={{ width: `${split[key]}%`, background: colour }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[0.75rem] font-bold">
          <span style={{ color: 'var(--nutrition-protein)' }}>{split.protein}% protein</span>
          <span style={{ color: 'var(--nutrition-carbs)' }}>{split.carbs}% carbs</span>
          <span style={{ color: 'var(--nutrition-fat)' }}>{split.fat}% fat</span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between text-[0.78125rem]">
              <span className="font-bold">{row.label}</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                {formatAmount(row.key, row.value)}
                <span style={{ color: 'var(--faint)' }}> · {row.pct}% of a day</span>
              </span>
            </div>
            <div className="mt-1"><Meter value={row.value} max={row.target} height={4} /></div>
          </div>
        ))}
      </div>

      <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
        <Info size={13} className="mt-0.5 shrink-0" />
        {estimated
          ? `Macros are computed from the dish's own ingredients; micronutrients are estimated from the food catalogue, which recognised ${matched}% of the ingredient list.`
          : 'Micronutrients need ingredients the catalogue recognises — this dish’s list is too unusual to estimate from, so only the macros are shown.'}
      </p>
    </div>
  );
}

/**
 * Sharing is an explicitly local action: a recipe becomes a code the user
 * chooses to send, and the other app reads it back.
 */
export function SharePanel({ recipe }) {
  const app = useApp();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const make = () => {
    setCode(shareCode(recipe, app.name));
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="rise rise-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Share</p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {PRIVACY_COPY.recipeShare}
          </p>
        </div>
        <button
          onClick={make}
          className="press rounded-full border px-3 py-1.5 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Share2 size={13} /> {code ? 'Refresh' : 'Get a code'}</span>
        </button>
      </div>
      {code && (
        <div className="mt-3">
          <textarea
            readOnly
            value={code}
            aria-label="Recipe share code"
            rows={3}
            className="w-full rounded-xl border p-2 text-[0.6875rem] font-mono outline-none"
            style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--muted)' }}
          />
          <button
            onClick={copy}
            className="press mt-2 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
            style={copied ? { borderColor: 'var(--good)', color: 'var(--good)' } : { borderColor: 'var(--line)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              {copied ? <><Check size={14} strokeWidth={3} /> Copied</> : <><Copy size={14} /> Copy the code</>}
            </span>
          </button>
        </div>
      )}
    </Card>
  );
}

/** What a swapped or generated dish is, and the offer to keep it. */
export function VariantBanner({ recipe, onReset, onSave, saved }) {
  const swaps = recipe.swaps || [];
  return (
    <Card className="!p-3 rise" style={{ borderColor: 'var(--accent)' }}>
      <p className="text-[0.78125rem] font-bold inline-flex items-center gap-1.5">
        <Sparkles size={13} style={{ color: 'var(--accent)' }} />
        {recipe.generated ? 'Invented for what you have' : 'Your version of this dish'}
      </p>
      {swaps.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {swaps.map((s, i) => (
            <li key={i} className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {s.from} → {s.to}
              {recipe.recalculated === false && ' (figures unchanged — not in the ingredient table)'}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={onSave}
          disabled={saved}
          className="press flex-1 rounded-xl py-2 text-[0.78125rem] font-extrabold disabled:opacity-60"
          style={saved
            ? { background: 'var(--card-2)', color: 'var(--good)' }
            : { background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {saved ? 'Saved to your recipes' : 'Save to my recipes'}
        </button>
        {onReset && (
          <button
            onClick={onReset}
            className="press rounded-xl border px-3 py-2 text-[0.78125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Undo
          </button>
        )}
      </div>
    </Card>
  );
}

export const ConflictPills = ({ recipe, diets }) => {
  const clashes = recipeConflicts(recipe, diets);
  if (!clashes.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {clashes.map((c) => <Pill key={c} tone="warn">Not {c.toLowerCase()}</Pill>)}
    </div>
  );
};
