import { CheckCircle2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Card } from './ui.jsx';

export default function HomeWelcomeCard({ openPantry, goTab, onOpenWeekLoop }) {
  const app = useApp();
  const starterDinnerCount = app.starterRecipeIds?.length ?? 0;
  const firstRunGoal = app.entryGoal || 'plan';
  const hasMeals = Object.keys(app.plan || {}).length > 0;
  const pantryStartPending = firstRunGoal === 'pantry'
    && !app.pantry?.length && !hasMeals && !app.shops?.length && !app.cooked?.length;
  const shoppingStartPending = firstRunGoal === 'shop'
    && (starterDinnerCount > 0 || !hasMeals);
  const showFirstRunCard = !app.welcomeDismissed
    && !(app.shops?.length || app.cooked?.length)
    && (starterDinnerCount > 0 || pantryStartPending || shoppingStartPending);
  return (
    <>
      {/* Goal-led first action: onboarding has already saved the real choices.
          Give each intent one next step from the Home hub; pantry-first stays
          empty until the user records stock, and shopping with no meals goes
          to planning so the list can be generated from a real choice. */}
      {showFirstRunCard && (
        <div className="px-5 rise rise-1">
          <Card className="flex items-start gap-3 !p-4">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <CheckCircle2 size={18} />
            </span>
            <div className="min-w-0 flex-1">
              {firstRunGoal === 'pantry' ? (
                <>
                  <p className="text-[0.9375rem] font-extrabold">Start with your kitchen</p>
                  <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    Add a few things you already have. Forq will count confirmed stock when you plan a meal.
                  </p>
                  <button onClick={openPantry} className="tap press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                    Add pantry items →
                  </button>
                </>
              ) : firstRunGoal === 'shop' ? (
                <>
                  <p className="text-[0.9375rem] font-extrabold">{starterDinnerCount ? 'Your shopping list is ready' : 'Build your first shopping list'}</p>
                  <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {starterDinnerCount
                      ? `${starterDinnerCount} dinner${starterDinnerCount === 1 ? '' : 's'} turned into one list. Review it before you shop.`
                      : 'Plan a few dinners and Forq will work out what you need to buy.'}
                  </p>
                  <button onClick={() => goTab(starterDinnerCount ? 'shop' : 'plan')} className="tap press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                    {starterDinnerCount ? 'Review shopping list →' : 'Plan dinners →'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] font-extrabold">Your first meals are ready</p>
                  <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {starterDinnerCount} dinner{starterDinnerCount === 1 ? '' : 's'} planned and one shopping list created.
                  </p>
                  <button onClick={() => onOpenWeekLoop?.()} className="tap press mt-2 text-[0.78125rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                    Run the week loop →
                  </button>
                </>
              )}
            </div>
            <button onClick={app.dismissWelcome} className="tap press text-[0.71875rem] font-bold" style={{ color: 'var(--muted)' }}>
              Dismiss
            </button>
          </Card>
        </div>
      )}

    </>
  );
}
