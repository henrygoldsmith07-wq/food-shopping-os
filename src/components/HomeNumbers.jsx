import { Card, Meter, Ring, Section } from './ui.jsx';
import { gbp } from '../lib/utils.js';

/**
 * The numbers that matter but do not need the first screenful: what the week's
 * budget is doing, and what the diary adds up to.
 *
 * Folded into a `details` on purpose. Home leads with what to do next; a
 * running total is something you go and look at, not something that should
 * greet you on opening the app.
 */
export default function HomeNumbers({ app, goTab, goLog }) {
  // Nothing recorded yet means there is nothing to total up.
  if (!(app.weeklyBudget > 0 || app.entries.length > 0)) return null;

  const left = app.weeklyBudget - app.spentThisWeek;

  return (
    <details className="mx-5 rise rise-1">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-3 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <span>Your numbers</span>
        <span className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>Budget and diary</span>
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => goTab('shop')}>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Weekly budget</p>
          {app.weeklyBudget > 0 ? (
            <div className="mt-2 flex items-center gap-3">
              <Ring
                value={app.spentThisWeek}
                max={app.weeklyBudget}
                size={64}
                label={`${Math.round((app.spentThisWeek / app.weeklyBudget) * 100)}%`}
              />
              <div>
                <p className="text-[1.0625rem] font-extrabold leading-tight">{gbp(app.spentThisWeek, { always: true })}</p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>of {gbp(app.weeklyBudget)}</p>
                <p className="text-[0.6875rem] font-bold mt-0.5" style={{ color: left >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                  {left >= 0 ? `${gbp(left, { always: true })} left` : `${gbp(-left, { always: true })} over`}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              No budget set — add one in your profile to track spending.
            </p>
          )}
        </Card>

        <Card onClick={() => goLog()}>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Calories today</p>
          <div className="mt-2 flex items-center gap-3">
            <Ring
              value={app.kcalToday}
              max={app.kcalGoal}
              size={64}
              color="var(--series-2)"
              label={`${Math.round((app.kcalToday / app.kcalGoal) * 100)}%`}
            />
            <div>
              <p className="text-[1.0625rem] font-extrabold leading-tight">{app.kcalToday.toLocaleString()}</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>of {app.kcalGoal.toLocaleString()} kcal</p>
              <p className="text-[0.6875rem] font-bold mt-0.5" style={{ color: 'var(--muted)' }}>
                P {Math.round(app.proteinToday)}g · C {Math.round(app.carbsToday)}g · F {Math.round(app.fatToday)}g
              </p>
            </div>
          </div>
        </Card>
      </div>
    </details>
  );
}
