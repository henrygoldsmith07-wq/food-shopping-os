import {
  Check, Package, ShoppingCart,
} from 'lucide-react';
import { cx } from '../lib/utils.js';
import { explainPantryShortfall } from '../lib/pantry-intelligence.js';
import { Card, Pill } from './ui.jsx';
import { ServingsControl } from './RecipeTools.jsx';
import { useIngredientTicks } from '../lib/ingredient-ticks.js';

/**
 * The ingredient list, scaled to how many you are cooking for and checked
 * against what is actually in the pantry.
 *
 * "Missing" here means the pantry cannot cover it — either it is not there at
 * all or there is not enough of it — and the shortfall explains which, because
 * "you have some tomatoes but not 400 g" is a different shopping trip from
 * "you have no tomatoes".
 */
export default function RecipeIngredients({
  app, recipe, original, servings, setServings, missing, havePantry, has,
  addedMissingKey, missingKey, addMissing, dislikeSwaps, onSwapDislike, pantryRead,
}) {
  // Shopping is a household permission: a member without it still sees what is
  // missing, they just cannot add it to the shared list.
  const canShop = app.householdAccess.shopping;
  // The button reads "added" only for the list it was pressed for: change the
  // servings, and what is missing changes, so the confirmation is stale.
  const addedMissing = Boolean(addedMissingKey && addedMissingKey === missingKey);
  // Tap an ingredient once it's out on the counter (kept for this tab only).
  const [gathered, toggleGathered, clearGathered] = useIngredientTicks(original.id);
  const gatheredCount = recipe.ingredients.filter((ing) => gathered.has(ing.name)).length;

  return (
    <>
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
        <p className="mb-1.5 flex items-center justify-between gap-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          <span>{gatheredCount ? `${gatheredCount} of ${recipe.ingredients.length} out on the counter` : 'Tap an ingredient once it’s out on the counter.'}</span>
          {gatheredCount > 0 && (
            <button type="button" onClick={clearGathered} className="press min-h-[44px] px-2 font-extrabold" style={{ color: 'var(--accent)' }}>Clear ticks</button>
          )}
        </p>
        <ul className="space-y-1" aria-label="Ingredients">
          {recipe.ingredients.map((ing) => {
            const out = gathered.has(ing.name);
            return (
              <li key={ing.name}>
                <button
                  type="button"
                  onClick={() => toggleGathered(ing.name)}
                  aria-pressed={out}
                  aria-label={`${ing.qty ? `${ing.qty} ` : ''}${ing.name}${has(ing) ? ', in your pantry' : ', not in your pantry'}${out ? ', out on the counter' : ''}`}
                  className="press flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-[0.875rem]"
                >
                  <span className={cx('font-semibold inline-flex items-center gap-2', (out || has(ing)) && 'opacity-60', out && 'line-through')}>
                    {has(ing)
                      ? <Check size={14} strokeWidth={3} style={{ color: 'var(--good)' }} aria-hidden="true" />
                      : <ShoppingCart size={14} style={{ color: 'var(--muted)' }} aria-hidden="true" />}
                    {ing.name}
                  </span>
                  <span className={cx('font-bold text-[0.8125rem]', out && 'line-through')} style={{ color: 'var(--muted)' }}>{ing.qty}</span>
                </button>
              </li>
            );
          })}
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
                  onClick={() => onSwapDislike(ingredient, options[0])}
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
    </>
  );
}
