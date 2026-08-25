import { ClipboardList } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { Card, FoodArt, Pill, Stepper } from './ui.jsx';

/**
 * The plan step of the week loop: the dinners already in the plan, the gaps
 * still open, and what to do about them.
 *
 * Everything it needs is passed in rather than reached for, so the step can be
 * read on its own — which is the point of pulling it out of a six-hundred-line
 * flow that also does shopping and cooking.
 */
export default function WeekLoopPlan({
  app, byId, dates, dayShort, dinnerRecipes, expiringNames, generateList, pantry,
  pickerDate, setDinner, setPickerDate, snap, stepId, usesExpiring, variety, weekList,
}) {
  return (
    <>
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              This week’s dinners
            </p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {snap.stats.meals
                ? `${snap.stats.meals} meal${snap.stats.meals === 1 ? '' : 's'} planned`
                : 'Tap a day to choose a dinner'}
              {snap.leftovers?.length
                ? ` · ${snap.leftovers.length} leftover dish${snap.leftovers.length === 1 ? '' : 'es'} in the fridge`
                : ''}
              {expiringNames.length
                ? ` · ${expiringNames.length} item${expiringNames.length === 1 ? '' : 's'} going off soon`
                : ''}
            </p>
            {variety.repeatedDishes.length > 0 && (
              <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--warn, #a55a12)' }}>
                {variety.repeatedDishes[0].name} is on {variety.repeatedDishes[0].times} nights — vary it if you're tired of repeats.
              </p>
            )}
          </Card>
          <div className="space-y-2">
            {dates.map((date) => {
              const dinnerId = app.plan?.[date]?.dinner;
              const recipe = dinnerId ? byId(dinnerId) : null;
              const leftoverHit = recipe && (app.leftoverPortions?.get?.(recipe.id) || 0) > 0;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setPickerDate(pickerDate === date ? null : date)}
                  className="press flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
                  style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
                >
                  <span className="w-14 shrink-0 text-[0.75rem] font-extrabold" style={{ color: 'var(--muted)' }}>
                    {dayShort(date)}
                  </span>
                  {recipe ? (
                    <>
                      <FoodArt recipe={recipe} className="h-10 w-10 shrink-0 rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.875rem] font-extrabold truncate">{recipe.name}</span>
                        {leftoverHit && <Pill tone="good">Uses fridge leftover</Pill>}
                        {usesExpiring(recipe) && <Pill tone="warn">Uses something going off</Pill>}
                      </span>
                    </>
                  ) : (
                    <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--faint)' }}>
                      Choose dinner →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {pickerDate && (
            <Card className="!p-0 max-h-64 overflow-y-auto divide-y" style={{ borderColor: 'var(--line)' }}>
              {dinnerRecipes.map((r) => {
                const portions = app.leftoverPortions?.get?.(r.id) || 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDinner(pickerDate, r.id)}
                    className="press flex w-full items-center gap-3 p-3 text-left"
                  >
                    <FoodArt recipe={r} className="h-9 w-9 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-bold truncate">{r.name}</span>
                      <span className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                        {r.time} min · {gbp(r.costPerServing, { always: true })}/serving
                      </span>
                    </span>
                    {usesExpiring(r) && <Pill tone="warn">Going off soon</Pill>}
                    {portions > 0 && <Pill tone="good">{portions} left</Pill>}
                  </button>
                );
              })}
            </Card>
          )}
        </>
      )}

      {stepId === 'portions' && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-extrabold text-[0.9375rem]">People you cook for</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Scales shopping quantities for this week’s list
              </p>
            </div>
            <Stepper
              value={app.household || 1}
              min={1}
              max={12}
              onChange={(n) => app.set({ household: n })}
            />
          </div>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Currently cooking for <strong>{app.portions || app.household || 1}</strong> portion
            {(app.portions || app.household || 1) === 1 ? '' : 's'} a meal
            {app.members?.length
              ? ` (${app.members.length} household profile${app.members.length === 1 ? '' : 's'})`
              : ''}
            .
          </p>
        </Card>
      )}

      {stepId === 'pantry' && (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[1.25rem] font-extrabold">{pantry.plannedMeals}</p>
                <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Meals</p>
              </div>
              <div>
                <p className="text-[1.25rem] font-extrabold">{pantry.leftoverMeals}</p>
                <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Covered</p>
              </div>
              <div>
                <p className="text-[1.25rem] font-extrabold">{pantry.missing}</p>
                <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>To buy</p>
              </div>
            </div>
            <p className="mt-3 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {pantry.missing === 0
                ? 'Pantry and leftovers cover everything planned. You can skip the shop.'
                : `${pantry.missing} ingredient${pantry.missing === 1 ? '' : 's'} still needed after checking the pantry.`}
            </p>
          </Card>
          {pantry.missingItems.slice(0, 12).map((item) => (
            <Card key={item.name} className="!p-3 flex items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-bold truncate">{item.name}</span>
              <span className="text-[0.75rem] font-semibold shrink-0" style={{ color: 'var(--muted)' }}>
                {item.qty || '—'}
              </span>
            </Card>
          ))}
        </>
      )}

      {stepId === 'list' && (
        <>
          <Card>
            <p className="font-extrabold text-[0.9375rem] inline-flex items-center gap-1.5">
              <ClipboardList size={16} /> Deduplicated list
            </p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {weekList.length
                ? `${weekList.length} unique item${weekList.length === 1 ? '' : 's'} after pantry + leftovers`
                : 'Nothing missing — generate still works if you restock later'}
            </p>
            <button
              type="button"
              onClick={generateList}
              className="press mt-3 w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {weekList.length ? `Add ${weekList.length} items to shopping` : 'Confirm — nothing to buy'}
            </button>
          </Card>
          <div className="space-y-1.5">
            {weekList.slice(0, 20).map((item) => (
              <div key={item.name} className="flex justify-between gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--card-2)' }}>
                <span className="text-[0.8125rem] font-bold truncate">{item.name}</span>
                <span className="text-[0.75rem] font-semibold shrink-0" style={{ color: 'var(--muted)' }}>{item.qty}</span>
              </div>
            ))}
          </div>
          {(app.shoppingList || []).length > 0 && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Shopping list now has {(app.shoppingList || []).length} item{(app.shoppingList || []).length === 1 ? '' : 's'}.
            </p>
          )}
        </>
      )}

      {stepId === 'prices' && (
        <>
          {snap.stores.length === 0 ? (
            <Card className="text-center py-8">
              <p className="font-bold">No price history yet</p>
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                After you record a shop with prices, this step compares the same list across stores you’ve used. Skip for now.
              </p>
            </Card>
          ) : (
            snap.stores.map((row) => (
              <Card key={row.store} className="flex items-center justify-between !p-3.5">
                <div>
                  <p className="font-bold">{row.store}</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {row.covered} of {row.of} items priced
                  </p>
                </div>
                <p className="font-extrabold">{gbp(row.total, { always: true })}</p>
              </Card>
            ))
          )}
          {snap.savings.slice(0, 5).map((s) => (
            <Card key={s.name} className="!p-3 flex justify-between gap-2">
              <span className="text-[0.8125rem] font-bold truncate">{s.name}</span>
              <Pill tone="good">save {gbp(s.saving, { always: true })} at {s.store}</Pill>
            </Card>
          ))}
    </>
  );
}
