import { useMemo, useState } from 'react';
import {
  CalendarPlus, ChartColumn, Check, ChefHat, ChevronLeft, ExternalLink, Flame, Heart,
  FolderPlus, Package, ShoppingCart, Slice, Star, Timer as TimerIcon, Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { gbp, cx } from '../lib/utils.js';
import { itemsFromRecipes } from '../data/stores.js';
import { MEAL_SLOTS } from '../data/plan.js';
import { addDays, pantryAvailability } from '../lib/kitchen.js';
import { sameIngredient } from '../lib/aliases.js';
import { explainPantryShortfall, shortfallQuantity } from '../lib/pantry-intelligence.js';
import { mergeQtys } from '../lib/pantry.js';
import {
  applySwap, dislikeSwapsFor, makeItFit, nutritionConfidence, safeExternalUrl, scaleRecipe,
} from '../lib/recipe-tools.js';
import { explainRecommendation } from '../lib/recommend.js';
import { Card, Ring, Pill, FoodArt, Chip } from './ui.jsx';
import { Glyph } from './icons.jsx';
import RecommendationExplanation from './RecommendationExplanation.jsx';
import CookMode from './CookMode.jsx';
import {
  ConflictPills, NutritionBreakdown, ServingsControl, SharePanel, SwapPanel, VariantBanner,
} from './RecipeTools.jsx';

const fmtTime = (mins) => (mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`);

/** The next fortnight, so scheduling a dish never needs a date picker. */
const scheduleDays = (today) =>
  Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
      : new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    return { date, label };
  });

export default function RecipeDetail({ recipe: original, onClose, goTab, startCooking = false }) {
  const app = useApp();
  const [cooking, setCooking] = useState(startCooking);
  const [addedMissingKey, setAddedMissingKey] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState({ date: app.day, slot: original.meal || 'dinner' });
  const [scheduled, setScheduled] = useState(null);
  const [variant, setVariant] = useState(null); // the dish after your swaps
  const [servings, setServings] = useState(original.servings || 1);
  const [showNutrition, setShowNutrition] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collectionName, setCollectionName] = useState('');

  const base = variant || original;
  const recipe = useMemo(() => scaleRecipe(base, servings), [base, servings]);
  const videoUrl = safeExternalUrl(recipe.video);
  const sourceUrl = safeExternalUrl(recipe.source);
  const fav = app.favourites.includes(recipe.id);
  const isMine = app.myRecipes.some((r) => r.id === original.id);
  const rating = app.recipeRatings[original.id] || 0;
  const nutrition = nutritionConfidence(recipe);
  const dislikeSwaps = useMemo(() => dislikeSwapsFor(base, app.prefs?.dislikes || []), [base, app.prefs?.dislikes]);

  // What you have is read from actual pantry evidence, including aliases and
  // quantities. Several rows of the same ingredient are summed before a
  // recipe is called covered.
  const pantryRead = (ing) => {
    const matches = app.pantry.filter((item) => sameIngredient(item.name, ing.name, app.aliasMemory || {}));
    const availableQty = matches.reduce((total, item) => mergeQtys(total, item.qty || '', { ingredient: ing.name }), '');
    const confidence = matches.some((item) => ['confirmed_sufficient', 'probably_available'].includes(pantryAvailability(item, app.day)));
    const shortfallQty = shortfallQuantity(availableQty, ing.qty, { ingredient: ing.name });
    return { matches, availableQty, shortfallQty, sufficient: confidence && !shortfallQty };
  };
  const has = (ing) => pantryRead(ing).sufficient;
  const missing = recipe.ingredients.filter((i) => !has(i));
  const havePantry = recipe.ingredients.length - missing.length;
  const missingKey = missing.map(({ name, qty }) => `${name}:${qty}`).join('|');
  const addedMissing = Boolean(addedMissingKey && addedMissingKey === missingKey);
  const canShop = app.householdAccess.shopping;
  const detailExplanation = useMemo(() => {
    const month = Number(String(app.day).slice(5, 7)) || new Date().getMonth() + 1;
    const availability = {};
    for (const b of app.calendarBusy || []) availability[b.date] = { busy: true, date: b.date, dayName: new Date(`${b.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) };
    return explainRecommendation(recipe, {
      pantry: app.pantry,
      today: app.day,
      date: when.date,
      availability,
      people: recipe.servings,
      budget: 2.5,
      month,
      taste: app.tasteProfile,
    });
  }, [recipe, app.pantry, app.day, when.date, app.calendarBusy, app.tasteProfile]);

  const swap = ({ diet, ingredient, option }) => {
    setVariant((v) => (diet ? makeItFit(v || original, diet) : applySwap(v || original, ingredient, option)));
    setSaved(false);
  };

  const save = () => {
    app.saveRecipe({ ...base, servings: original.servings || 1 });
    setSaved(true);
  };

  const addMissing = () => {
    if (!canShop) return;
    if (addedMissing) {
      onClose?.();
      goTab?.('shop');
      return;
    }
    app.addToList(itemsFromRecipes([recipe], app.pantry.map((p) => p.name)));
    setAddedMissingKey(missingKey);
  };

  const reviewPlan = () => {
    onClose?.();
    goTab?.('plan', { date: when.date });
  };

  if (cooking) {
    return <CookMode recipe={recipe} onExit={() => setCooking(false)} onClose={onClose} />;
  }

  return (
    <div className="pb-8">
      <div className="relative">
        <FoodArt
          recipe={recipe}
          alt={`${recipe.name} recipe icon`}
          className="h-56 w-full"
        />
        <button
          onClick={onClose}
          aria-label="Close"
          className="press absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-full border"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => app.toggleFavourite(recipe.id)}
          aria-label={fav ? 'Unfavourite' : 'Favourite'}
          aria-pressed={fav}
          className={cx(
            'press favourite-button absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border',
            fav && 'is-favourite',
          )}
          style={{
            background: fav ? 'var(--danger-soft)' : 'var(--card)',
            borderColor: fav ? 'var(--danger)' : 'var(--line)',
            color: fav ? 'var(--danger)' : 'var(--faint)',
          }}
        >
          <Heart
            key={fav ? 'favourite' : 'not-favourite'}
            className={fav ? 'favourite-heart' : undefined}
            size={16}
            fill={fav ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      <div className="px-5 -mt-6 relative space-y-4">
        <Card className="rise">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-[1.25rem] font-extrabold leading-tight">{recipe.name}</h1>
            <Pill tone="accent">{recipe.kcal} kcal</Pill>
          </div>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {recipe.cuisine} · serves {recipe.servings} · {gbp(recipe.costPerServing, { always: true })}/serving
          </p>
          {recipe.sharedBy && (
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Shared with you by {recipe.sharedBy}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="muted"><ChefHat size={12} /> {recipe.difficulty}</Pill>
            <Pill tone="muted"><Slice size={12} /> Prep {fmtTime(recipe.prep)}</Pill>
            <Pill tone="muted"><Flame size={12} /> Cook {fmtTime(recipe.time)}</Pill>
            {recipe.tags.slice(0, 2).map((t) => <Pill key={t} tone="faint">{t}</Pill>)}
          </div>
          {app.householdAccess.recipes && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--line)' }}>
              <p className="text-[0.78125rem] font-bold">{rating ? `Your rating: ${rating}/5` : 'Not rated yet'}</p>
              <div className="flex gap-1" aria-label="Your recipe rating">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => app.rateRecipe(original.id, score)}
                    aria-label={`Rate ${score} star${score === 1 ? '' : 's'}`}
                    className="press p-0.5"
                    style={{ color: score <= rating ? 'var(--warn)' : 'var(--faint)' }}
                  >
                    <Star size={17} fill={score <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2"><ConflictPills recipe={recipe} diets={app.planDiets} /></div>
          <Card className="mt-3 !p-3" style={{ background: 'var(--card-2)' }}>
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Why this fits your kitchen tonight</p>
            <RecommendationExplanation explanation={detailExplanation} compact />
          </Card>
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="press mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-extrabold"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink size={14} /> Watch the original
            </a>
          )}
          {sourceUrl && !videoUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="press mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-extrabold"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink size={14} /> Open original recipe
            </a>
          )}
          {isMine && (recipe.imported || recipe.source) && (
            <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
              Imported {recipe.importedAt ? new Date(recipe.importedAt).toLocaleDateString('en-GB') : ''}
              {recipe.confidence === 'partial' ? ' · parsed partially — check ingredients and method' : ' · parsed from the source'}
              {recipe.provenance?.author ? ` · by ${recipe.provenance.author}` : ''}
              {recipe.provenance?.datePublished ? ` · published ${recipe.provenance.datePublished}` : ''}
              {recipe.unread?.length ? ` · ${recipe.unread.length} line${recipe.unread.length === 1 ? '' : 's'} unread` : ''}
            </p>
          )}
          {isMine && (
            <button
              onClick={() => { app.removeRecipe(original.id); onClose(); }}
              className="press mt-3 inline-flex items-center gap-1.5 text-[0.78125rem] font-extrabold"
              style={{ color: 'var(--muted)' }}
            >
              <Trash2 size={13} /> Remove from my recipes
            </button>
          )}
        </Card>

        {app.householdAccess.recipes && (
          <Card className="rise rise-1">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Collections</p>
            {app.recipeCollections.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {app.recipeCollections.map((collection) => {
                  const included = collection.recipeIds.includes(original.id);
                  return (
                    <button
                      key={collection.id}
                      onClick={() => app.toggleRecipeCollection(collection.id, original.id)}
                      aria-label={`${included ? 'Remove from' : 'Add to'} ${collection.name}`}
                      className="press"
                    >
                      <Pill tone={included ? 'good' : 'muted'}>
                        {included && <Check size={11} strokeWidth={3} />} {collection.name}
                      </Pill>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                aria-label="New collection name"
                placeholder="Weeknight favourites"
                maxLength={40}
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
                style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
              <button
                onClick={() => {
                  app.createRecipeCollection(collectionName, original.id);
                  setCollectionName('');
                }}
                disabled={collectionName.trim().length < 2}
                className="press shrink-0 rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                <span className="inline-flex items-center gap-1.5"><FolderPlus size={14} /> Create collection</span>
              </button>
            </div>
          </Card>
        )}

        {(variant || recipe.generated || recipe.shared) && (
          <VariantBanner
            recipe={variant || recipe}
            onReset={variant ? () => { setVariant(null); setSaved(false); } : null}
            onSave={save}
            saved={saved || (!variant && isMine)}
          />
        )}

        {/* Nutrition per serving, with the full breakdown a tap away */}
        <Card className="rise rise-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Per serving</p>
            <button
              onClick={() => setShowNutrition((v) => !v)}
              className="press text-[0.78125rem] font-extrabold inline-flex items-center gap-1.5"
              style={{ color: 'var(--accent)' }}
            >
              <ChartColumn size={13} /> {showNutrition ? 'Hide breakdown' : 'Full breakdown'}
            </button>
          </div>
          <div className="flex justify-between">
            <Ring value={recipe.kcal} max={800} size={68} color="var(--nutrition-kcal)" label={recipe.kcal} sub="kcal" />
            <Ring value={recipe.protein} max={50} size={68} color="var(--nutrition-protein)" label={`${recipe.protein}g`} sub="protein" />
            <Ring value={recipe.carbs} max={90} size={68} color="var(--nutrition-carbs)" label={`${recipe.carbs}g`} sub="carbs" />
            <Ring value={recipe.fat} max={40} size={68} color="var(--nutrition-fat)" label={`${recipe.fat}g`} sub="fat" />
          </div>
          <p className="mt-3 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            {nutrition.label}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Health', recipe.healthScore, '💚'],
              ['Protein', recipe.proteinScore, '💪'],
              ['Planet', recipe.envScore, '🌍'],
            ].map(([label, score, glyph]) => (
              <div key={label} className="rounded-xl py-2" style={{ background: 'var(--card-2)' }}>
                <p className="text-[0.9375rem] font-extrabold inline-flex items-center gap-1.5">
                  <Glyph e={glyph} size={14} style={{ color: 'var(--muted)' }} /> {score}
                </p>
                <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label} score</p>
              </div>
            ))}
          </div>
          {showNutrition && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
              <NutritionBreakdown recipe={recipe} />
            </div>
          )}
        </Card>

        {/* Ingredients: scaled to how many you're cooking for, checked against your pantry */}
        <Card className="rise rise-2">
          <ServingsControl
            servings={servings}
            base={original.servings || 1}
            onChange={setServings}
            costPerServing={recipe.costPerServing}
          />
          <div className="my-3 flex items-center justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Ingredients</p>
            <Pill tone={havePantry === recipe.ingredients.length ? 'good' : 'accent'}>
              <Package size={12} /> You have {havePantry} of {recipe.ingredients.length}
            </Pill>
          </div>
          <ul className="space-y-2">
            {recipe.ingredients.map((ing) => (
              <li key={ing.name} className="flex items-center justify-between text-[0.875rem]">
                <span className={cx('font-semibold inline-flex items-center gap-2', has(ing) && 'opacity-60')}>
                  {has(ing)
                    ? <Check size={14} strokeWidth={3} style={{ color: 'var(--good)' }} />
                    : <ShoppingCart size={14} style={{ color: 'var(--muted)' }} />}
                  {ing.name}
                </span>
                <span className="font-bold text-[0.8125rem]" style={{ color: 'var(--muted)' }}>{ing.qty}</span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <button
              onClick={addMissing}
              disabled={!canShop}
              className="press mt-3 w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold border disabled:opacity-60"
              style={!canShop
                ? { borderColor: 'var(--line)', color: 'var(--muted)' }
                : addedMissing
                ? { borderColor: 'var(--good)', color: 'var(--good)' }
                : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                {!canShop
                  ? <>Shopping access required</>
                  : addedMissing
                  ? <><Check size={14} strokeWidth={3} /> Review shopping list</>
                  : <>Add {missing.length} missing to shopping list</>}
              </span>
            </button>
          )}
          {missing.length > 0 && (
            <div className="mt-3 space-y-1.5" aria-label="Pantry shortfall explanations">
              {missing.map((ingredient) => {
                const read = pantryRead(ingredient);
                return (
                  <p key={ingredient.name} className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {explainPantryShortfall({
                      name: ingredient.name,
                      needQty: ingredient.qty,
                      availableQty: read.availableQty,
                      shortfallQty: read.shortfallQty,
                      sourceRecipes: [recipe.name],
                    })}
                  </p>
                );
              })}
            </div>
          )}
        </Card>

        {dislikeSwaps.length > 0 && app.prefs?.dislikes?.length > 0 && (
          <Card className="rise rise-2" style={{ borderColor: 'var(--warn)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>
              Someone in the house won't eat
            </p>
            <div className="mt-2 space-y-2">
              {dislikeSwaps.map(({ ingredient, options }) => (
                <div key={ingredient} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.8125rem] font-bold">{ingredient}</span>
                  <button
                    type="button"
                    onClick={() => setVariant((v) => applySwap(v || original, ingredient, options[0]))}
                    className="press rounded-full border px-3 py-1.5 text-[0.71875rem] font-extrabold"
                    style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
                  >
                    Swap for {options[0].name}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <SwapPanel recipe={base} onSwap={swap} />

        {/* Put it in the plan on a chosen day */}
        <Card className="rise rise-2">
          <button
            onClick={() => setScheduling((v) => !v)}
            className="press flex w-full items-center justify-between"
          >
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Schedule</p>
            <span className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
              <CalendarPlus size={14} /> {scheduling ? 'Close' : 'Add to my plan'}
            </span>
          </button>
          {scheduled && !scheduling && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--good)' }}>Planned for {scheduled}.</p>
              <button
                onClick={reviewPlan}
                className="press shrink-0 rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
              >
                Review meal plan
              </button>
            </div>
          )}
          {scheduling && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                {scheduleDays(app.day).map(({ date, label }) => (
                  <Chip key={date} active={when.date === date} onClick={() => setWhen((w) => ({ ...w, date }))}>
                    {label}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-2">
                {MEAL_SLOTS.map(({ key, label }) => (
                  <Chip key={key} active={when.slot === key} onClick={() => setWhen((w) => ({ ...w, slot: key }))}>
                    {label}
                  </Chip>
                ))}
              </div>
              <button
                onClick={() => {
                  // A variant has to exist in your recipes before a plan can point at it.
                  if (variant && !saved) { app.saveRecipe({ ...base, servings: original.servings || 1 }); setSaved(true); }
                  app.setPlanSlot(when.date, when.slot, base.id);
                  setScheduled(`${when.slot} on ${new Date(`${when.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`);
                  setScheduling(false);
                }}
                className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Put it in the plan
              </button>
            </div>
          )}
        </Card>

        {/* Steps preview */}
        <Card className="rise rise-3">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>
            Method · {recipe.steps.length} steps
          </p>
          <ol className="space-y-2.5">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[0.84375rem]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}>
                  {i + 1}
                </span>
                <span className="font-medium leading-snug" style={{ color: 'var(--muted)' }}>
                  {s.text}{' '}
                  {s.timerMins ? (
                    <b className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <TimerIcon size={12} /> {fmtTime(s.timerMins)}
                    </b>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <SharePanel recipe={recipe} />

        <button
          onClick={() => setCooking(true)}
          className="press w-full rounded-2xl py-4 text-[1rem] font-extrabold rise rise-3"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-lg)' }}
        >
          <span className="inline-flex items-center gap-2"><ChefHat size={18} /> Start cooking mode</span>
        </button>
      </div>
    </div>
  );
}
