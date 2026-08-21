import { useState } from 'react';
import { BookmarkPlus, Check, ClipboardPaste, Link2, ShoppingCart, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { importRecipeText, recipeTextFromMarkup } from '../lib/foodlog.js';
import { isVideoLink, recipeFromImport } from '../lib/recipe-tools.js';
import { buildEntry, mealForTime, timeStamp } from '../lib/nutrition.js';
import { itemsFromRecipes } from '../data/stores.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { Card, Chip, Pill, Stepper } from './ui.jsx';
import { MacroSummary, MealPicker } from './FoodDetail.jsx';

const SAMPLE = `Peanut butter overnight oats
Serves 2
80g porridge oats
250ml semi-skimmed milk
2 tbsp peanut butter
1 banana
40g blueberries
1 tsp honey`;

/**
 * Recipe importer. Copied recipe text is parsed for real — quantities, units
 * and ingredient matches drive the per-serving estimate. A source URL is kept
 * with it, but this importer does not pretend it fetched another site.
 */
export default function RecipeImport({ defaultMeal, onDone }) {
  const app = useApp();
  const [mode, setMode] = useState('paste');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState(defaultMeal || mealForTime());
  const [saved, setSaved] = useState(false);
  const [listed, setListed] = useState(false);
  const [kept, setKept] = useState(false);
  const [link, setLink] = useState('');
  const [importFormat, setImportFormat] = useState('');

  const run = () => {
    setError('');
    setSaved(false);
    setListed(false);
    setKept(false);
    setImportFormat('');
    const structured = recipeTextFromMarkup(text);
    const importText = structured?.text || text;
    let out = importRecipeText(importText, app.catalogue);
    const provenance = structured?.provenance || null;
    if (mode === 'url' && !/^https?:\/\/.+\..+/.test(url.trim())) {
      setError('That doesn’t look like a recipe link.');
      setResult(null);
      return;
    }
    if (!out) {
      setError('Paste a title and a few ingredient lines.');
      setResult(null);
      return;
    }
    if (mode === 'url') {
      const domain = url.trim().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      out = { ...out, domain, url: url.trim() };
    }
    if (structured) {
      setText(importText);
      setImportFormat(structured.format);
    }
    setResult({ ...out, provenance: provenance || {} });
    setServings(1);
  };

  const log = () => {
    if (!result?.matchedCount) return;
    const food = result.food;
    const grams = food.servings[0].grams * servings;
    app.logEntry(buildEntry(food, {
      grams,
      meal,
      time: timeStamp(),
      source: 'recipe',
      servingLabel: servings === 1 ? '1 serving' : `${servings} servings`,
    }));
    onDone();
  };

  const macros = result
    ? Object.fromEntries(Object.entries(result.perServing).map(([k, v]) => [k, Math.round(v * servings * 10) / 10]))
    : null;
  const canLog = Boolean(result?.matchedCount);

  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2">
        <Chip active={mode === 'paste'} onClick={() => { setMode('paste'); setResult(null); setImportFormat(''); }}>Paste recipe</Chip>
        <Chip active={mode === 'url'} onClick={() => { setMode('url'); setResult(null); setImportFormat(''); }}>From a link</Chip>
      </div>

      {mode === 'url' && (
        <>
          <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Recipe URL</span>
          <div className="mt-1 flex items-center gap-2 rounded-2xl border px-4 py-3" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
            <Link2 size={15} style={{ color: 'var(--faint)' }} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://bbcgoodfood.com/recipes/…"
              aria-label="Recipe URL"
              className="w-full bg-transparent text-[0.875rem] font-semibold outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          </label>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Copy the recipe text below, or paste page source/Recipe JSON-LD when available. Forq parses it locally because browser cross-origin rules stop reliable direct fetching. {PRIVACY_COPY.recipeImport}
          </p>
        </>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={'Recipe title\nServes 4\n400g chicken breast\n200g rice\nMethod steps…'}
        aria-label="Recipe text"
        className="w-full rounded-2xl border px-4 py-3 text-[0.84375rem] font-semibold outline-none resize-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <button
        onClick={() => setText(SAMPLE)}
        className="press inline-flex items-center gap-1.5 text-[0.78125rem] font-bold"
        style={{ color: 'var(--accent)' }}
      >
        <ClipboardPaste size={13} /> Use an example
      </button>

      <button
        onClick={run}
        disabled={!text.trim() || (mode === 'url' && !url.trim())}
        className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-2"><Sparkles size={16} /> Import recipe</span>
      </button>

      {error && <Pill tone="danger">{error}</Pill>}

      {result && (
        <div className="space-y-4 rise">
          <Card>
            <p className="font-extrabold text-[1rem] leading-tight">{result.title}</p>
            <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {result.domain ? `From ${result.domain} · ` : ''}makes {result.servings} servings
              {result.matchedCount !== undefined && ` · ${result.matchedCount}/${result.ingredients.length} ingredients matched`}
            </p>
            {(mode === 'url' || importFormat) && (
              <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--good)' }}>
                {importFormat === 'schema.org'
                  ? 'Structured recipe data parsed locally · source link kept'
                  : 'Parsed from copied text · source link kept'}
              </p>
            )}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
              <MacroSummary macros={macros} size="sm" />
            </div>
            {result.matchedCount === 0 && (
              <Pill tone="warn">Nothing matched the local food catalogue, so logging is paused. You can still save the recipe or shop its ingredients.</Pill>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[0.78125rem] font-bold">Servings eaten</span>
              <Stepper value={servings} onChange={setServings} min={1} max={6} />
            </div>
          </Card>

          <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
            {result.ingredients.slice(0, 14).map((ing, i) => (
              <div key={`${ing.name}-${i}`} className="flex items-center gap-3 p-3 text-[0.84375rem]">
                <span className="flex-1 font-semibold truncate">{ing.line}</span>
                {ing.food
                  ? <Pill tone="good">{ing.grams} g · {ing.food.name}</Pill>
                  : <Pill tone="faint">not matched</Pill>}
              </div>
            ))}
          </Card>

          {/* Keep it as a recipe you can cook and plan, not just a food to log */}
          <Card className="space-y-2.5">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Keep it as a recipe</p>
            <input
              value={mode === 'url' ? url : link}
              onChange={(e) => (mode === 'url' ? setUrl(e.target.value) : setLink(e.target.value))}
              placeholder="Link to the original (optional)"
              aria-label="Link to the original"
              className="w-full rounded-xl border px-3 py-2.5 text-[0.8125rem] font-semibold outline-none"
              style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {isVideoLink(mode === 'url' ? url : link)
                ? 'Recognised as a video — the recipe page will offer to open it.'
                : 'Only the method you pasted is kept; nothing is written for you.'}
            </p>
            <button
              onClick={() => {
                app.saveRecipe(recipeFromImport(result, { text, url: mode === 'url' ? url : link, provenance: result.provenance }));
                setKept(true);
              }}
              disabled={kept}
              className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-60"
              style={kept
                ? { borderColor: 'var(--good)', color: 'var(--good)' }
                : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                {kept ? <><Check size={14} strokeWidth={3} /> In My recipes</> : <><BookmarkPlus size={14} /> Save to My recipes</>}
              </span>
            </button>
          </Card>

          <MealPicker value={meal} onChange={setMeal} />

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => { app.addCustomFood(result.food); setSaved(true); }}
              disabled={saved || !canLog}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold disabled:opacity-60"
              style={{ borderColor: saved ? 'var(--good)' : 'var(--line)', color: saved ? 'var(--good)' : 'var(--ink)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                {saved ? <><Check size={14} strokeWidth={3} /> In My foods</> : 'Save to My foods'}
              </span>
            </button>
              <button
                onClick={() => {
                  const imported = recipeFromImport(result, { text, url: mode === 'url' ? url : link, provenance: result.provenance });
                  app.addToList(itemsFromRecipes([imported]));
                  setListed(true);
                }}
                disabled={listed}
                className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold disabled:opacity-60"
                style={{ borderColor: listed ? 'var(--good)' : 'var(--line)', color: listed ? 'var(--good)' : 'var(--ink)' }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingCart size={14} /> {listed ? 'On your list' : 'Shop missing'}
                </span>
              </button>
          </div>

          <button
            onClick={log}
            disabled={!canLog}
            className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {canLog ? `Log ${servings} serving${servings === 1 ? '' : 's'} · ${macros.kcal} kcal` : 'Add a matched ingredient to log'}
          </button>
        </div>
      )}
    </div>
  );
}
