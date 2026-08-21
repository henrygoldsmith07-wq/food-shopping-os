import { useMemo, useState } from 'react';
import { ChevronRight, Package, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { generatorInputs, inventRecipe } from '../lib/recipe-ai.js';
import { monthOf } from '../data/seasons.js';
import { Card, Chip, Pill, Stepper, FoodArt } from './ui.jsx';

const TIMES = [{ label: 'Any', value: null }, { label: '20 min', value: 20 }, { label: '25 min', value: 25 }, { label: '35 min', value: 35 }];

/**
 * The recipe generator.
 *
 * It builds a dish out of your pantry using the same component tables the
 * recipe book is composed from, so its calories, macros and cost are computed
 * from real ingredients rather than written by a language model. Everything it
 * had to assume you'd buy is listed plainly.
 */
export default function RecipeGenerator({ openRecipe }) {
  const app = useApp();
  const [servings, setServings] = useState(Math.max(1, Math.round(app.portions)));
  const [maxTime, setMaxTime] = useState(null);
  const [seasonal, setSeasonal] = useState(true);
  const [seed, setSeed] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [saved, setSaved] = useState(false);

  const pantryNames = app.pantry.map((p) => p.name);
  const inputs = useMemo(() => generatorInputs(pantryNames), [app.pantry]);
  const usable = inputs.filter((a) => a.options.length);

  const recipe = useMemo(() => {
    if (!seed) return null;
    return inventRecipe({
      have: pantryNames,
      diets: app.planDiets,
      servings,
      maxTime,
      month: seasonal ? monthOf(app.day) : null,
      seed,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, servings, maxTime, seasonal, app.planDiets, app.day]);

  const invent = () => {
    setThinking(true);
    setSaved(false);
    setTimeout(() => {
      setSeed(Math.floor(Math.random() * 100000) + 1);
      setThinking(false);
    }, 450);
  };

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Your kitchen</p>
        {usable.length === 0 ? (
          <p className="mt-1 text-[0.84375rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your pantry is empty, so there is nothing to invent from yet. Add a few things and this
            will build a dish around them — until then it can only suggest a store-cupboard meal.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[0.84375rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {usable.length} of 4 parts of a dish are covered by what you have.
            </p>
            <div className="mt-2.5 space-y-1.5">
              {inputs.map((axis) => (
                <div key={axis.key} className="flex items-baseline justify-between gap-3 text-[0.78125rem]">
                  <span className="font-bold capitalize">{axis.key}</span>
                  <span className="font-semibold text-right truncate" style={{ color: axis.options.length ? 'var(--muted)' : 'var(--faint)' }}>
                    {axis.options.length
                      ? axis.options.slice(0, 3).map((o) => o.name).join(', ') + (axis.options.length > 3 ? `, +${axis.options.length - 3}` : '')
                      : `no ${axis.label} yet — one will be added to your list`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Serves</p>
          <Stepper value={servings} onChange={setServings} />
        </div>
        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Ready in</p>
          <div className="flex gap-2">
            {TIMES.map((t) => (
              <Chip key={t.label} active={maxTime === t.value} onClick={() => setMaxTime(t.value)}>{t.label}</Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-bold flex items-center gap-1.5"><Zap size={14} /> Favour what’s in season</p>
          <Chip active={seasonal} onClick={() => setSeasonal((v) => !v)}>{seasonal ? 'On' : 'Off'}</Chip>
        </div>
        {app.planDiets.length > 0 && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Built to fit {app.planDiets.join(' · ')}.
          </p>
        )}
        <button
          onClick={invent}
          disabled={thinking}
          className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', opacity: thinking ? 0.7 : 1 }}
        >
          <span className="inline-flex items-center gap-2">
            {thinking ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {thinking ? 'Working it out…' : seed ? 'Invent another' : 'Invent a recipe'}
          </span>
        </button>
      </Card>

      {thinking && <div className="skeleton h-[120px] rounded-2xl" />}

      {recipe && !thinking && (
        <Card className="!p-0 overflow-hidden rise">
          <FoodArt recipe={recipe} className="h-32 w-full" px={44} />
          <div className="p-4 space-y-3">
            <div>
              <p className="font-extrabold text-[1rem] leading-tight">{recipe.name}</p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {recipe.time} min · serves {recipe.servings} · {gbp(recipe.costPerServing, { always: true })}/serving · {recipe.kcal} kcal
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {recipe.fromPantry.length > 0 && (
                <Pill tone="good"><Package size={11} /> {recipe.fromPantry.length} from your pantry</Pill>
              )}
              {recipe.tags.slice(0, 3).map((t) => <Pill key={t} tone="faint">{t}</Pill>)}
            </div>

            {recipe.bought.length > 0 && (
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Assumes you’ll pick up: {recipe.bought.join(', ')}.
              </p>
            )}

            <ul className="space-y-1">
              {recipe.ingredients.map((i) => (
                <li key={i.name} className="flex justify-between text-[0.8125rem]">
                  <span className="font-semibold">{i.name}</span>
                  <span className="font-bold" style={{ color: 'var(--muted)' }}>{i.qty}</span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => { app.saveRecipe(recipe); setSaved(true); }}
                disabled={saved}
                className="press rounded-2xl py-3 text-[0.84375rem] font-extrabold disabled:opacity-60"
                style={saved
                  ? { background: 'var(--card-2)', color: 'var(--good)' }
                  : { background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {saved ? 'In my recipes' : 'Save it'}
              </button>
              <button
                onClick={() => openRecipe(recipe)}
                className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="inline-flex items-center gap-1.5">Open it <ChevronRight size={14} /></span>
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
