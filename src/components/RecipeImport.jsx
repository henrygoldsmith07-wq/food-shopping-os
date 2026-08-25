import { useState } from 'react';
import { BookmarkPlus, Check, ClipboardPaste, ShoppingCart, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { importRecipeText, recipeTextFromMarkup } from '../lib/foodlog.js';
import { isVideoLink, recipeFromImport } from '../lib/recipe-tools.js';
import { provenanceFrom } from '../lib/recipe-import.js';
import { buildEntry, mealForTime, timeStamp } from '../lib/nutrition.js';
import { itemsFromRecipes } from '../data/stores.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { Card, Chip, Pill, Stepper } from './ui.jsx';
import RecipeImportSource from './RecipeImportSource.jsx';
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
 * Recipe importer, with four doors into one pipeline.
 *
 * Paste the text, give it a link, photograph the page, or type it in by hand —
 * whichever it is, what comes out is recipe text, and that text goes through
 * one parser. Quantities, units and ingredient matches drive the per-serving
 * estimate; nothing is filled in that the source did not say.
 *
 * A link is fetched by the app's own backend, because the browser cannot fetch
 * another site. What the backend read — the page's own recipe data, a video
 * caption, a photo — is kept with the recipe, so the two are never confused.
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
  // Where a fetched or photographed recipe came from, kept until it is saved.
  const [fetched, setFetched] = useState(null);

  /**
   * Parse recipe text into a reviewable draft. Takes its input rather than
   * reading state, so a link or photo can be parsed the moment it arrives
   * without waiting for a render.
   */
  const parse = (inputText, from = null) => {
    setError('');
    setSaved(false);
    setListed(false);
    setKept(false);
    const structured = recipeTextFromMarkup(inputText);
    const importText = structured?.text || inputText;
    let out = importRecipeText(importText, app.catalogue);
    if (!out) {
      setError(from
        ? 'That source had no ingredient lines in it. Edit the text below and import again.'
        : 'Paste a title and a few ingredient lines.');
      setResult(null);
      return;
    }
    const sourceUrl = from?.source?.url || (mode === 'paste' ? '' : url.trim());
    if (sourceUrl) {
      const domain = sourceUrl.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      out = { ...out, domain, url: sourceUrl };
    }
    if (structured) setText(importText);
    setImportFormat(from?.source?.read || (structured ? 'schema.org' : ''));
    setResult({
      ...out,
      provenance: from ? provenanceFrom(from.source) : (structured?.provenance || {}),
    });
    setServings(1);
  };

  const run = () => parse(text, fetched);

  /** A link or photo came back: keep what it said, and read it straight away. */
  const onRead = ({ text: readText, source, attribution }) => {
    setFetched({ source, attribution });
    setUrl(source.url || '');
    setText(readText);
    parse(readText, { source, attribution });
  };

  const switchMode = (next) => {
    setMode(next);
    setResult(null);
    setImportFormat('');
    setFetched(null);
    setError('');
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
        <Chip active={mode === 'paste'} onClick={() => switchMode('paste')}>Paste recipe</Chip>
        <Chip active={mode === 'link'} onClick={() => switchMode('link')}>From a link</Chip>
        <Chip active={mode === 'photo'} onClick={() => switchMode('photo')}>From a photo</Chip>
      </div>

      {mode !== 'paste' && <RecipeImportSource mode={mode} onRead={onRead} />}

      <label className="block">
        <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          {fetched ? 'What was read — check it before importing' : 'Recipe text'}
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={'Recipe title\nServes 4\n400g chicken breast\n200g rice\nMethod steps…'}
          aria-label="Recipe text"
          className="mt-1 w-full rounded-2xl border px-4 py-3 text-[0.84375rem] font-semibold outline-none resize-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
      </label>
      {mode === 'paste' && (
        <button
          onClick={() => setText(SAMPLE)}
          className="press inline-flex items-center gap-1.5 text-[0.78125rem] font-bold"
          style={{ color: 'var(--accent)' }}
        >
          <ClipboardPaste size={13} /> Use an example
        </button>
      )}
      {mode === 'paste' && (
        <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Page source or Recipe JSON-LD works here too — it is parsed on your device. {PRIVACY_COPY.recipeImport}
        </p>
      )}

      <button
        onClick={run}
        disabled={!text.trim()}
        className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles size={16} /> {fetched ? 'Import what was read' : 'Import recipe'}
        </span>
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
            {fetched ? (
              <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: fetched.attribution.exact ? 'var(--good)' : 'var(--warn)' }}>
                {fetched.attribution.line}
                {fetched.attribution.exact ? '' : ' · check the amounts against the original'}
              </p>
            ) : importFormat === 'schema.org' ? (
              <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--good)' }}>
                Structured recipe data parsed on your device · source link kept
              </p>
            ) : null}
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
              value={fetched ? url : link}
              onChange={(e) => (fetched ? setUrl(e.target.value) : setLink(e.target.value))}
              placeholder="Link to the original (optional)"
              aria-label="Link to the original"
              className="w-full rounded-xl border px-3 py-2.5 text-[0.8125rem] font-semibold outline-none"
              style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {isVideoLink(fetched ? url : link)
                ? 'Recognised as a video — the recipe page will offer to open it.'
                : 'Only the method that was read is kept; nothing is written for you.'}
            </p>
            <button
              onClick={() => {
                app.saveRecipe(recipeFromImport(result, {
                  text,
                  url: fetched ? url : link,
                  provenance: result.provenance,
                }));
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
                  const imported = recipeFromImport(result, {
                    text,
                    url: fetched ? url : link,
                    provenance: result.provenance,
                  });
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
