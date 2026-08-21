import { notFound } from 'next/navigation';
import { readCoachShare } from '../../../server/coach-shares.js';
import { coachFocus, coachPulse } from '../../../lib/coach-dashboard.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Shared coaching dashboard · Forq',
  robots: { index: false, follow: false },
};

const countEntries = (log = {}) => Object.values(log).reduce(
  (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
  0,
);
const countPlanned = (plan = {}) =>
  Object.values(plan).reduce((sum, day) => sum + Object.values(day || {}).filter(Boolean).length, 0);

const Stat = ({ label, value }) => (
  <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
    <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
    <p className="mt-1 text-[1.5rem] font-extrabold">{value}</p>
  </div>
);

const PulseBar = ({ row, maxKcal }) => {
  const width = row.kcal && maxKcal ? Math.max(4, Math.round((row.kcal / maxKcal) * 100)) : 0;
  const label = `${row.date}: ${row.entries ? `${row.kcal} kcal, ${row.protein} g protein` : 'not logged'}`;
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <span className="w-14 shrink-0 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
        {new Date(`${row.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--card-2)' }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: row.entries ? 'var(--accent)' : 'var(--line)' }} />
      </div>
      <span className="w-14 shrink-0 text-right text-[0.6875rem] font-bold tabular-nums" style={{ color: 'var(--muted)' }}>
        {row.entries ? `${row.kcal} kcal` : '—'}
      </span>
    </div>
  );
};

export default async function CoachDashboard({ params }) {
  let share;
  try {
    share = await readCoachShare((await params).token);
  } catch {
    notFound();
  }
  const diary = share.data.diary || {};
  const nutrition = share.data.nutrition || {};
  const plan = share.data.plan || {};
  const health = share.data.health || {};
  const diaryLog = diary.log && typeof diary.log === 'object' && !Array.isArray(diary.log) ? diary.log : {};
  const pulse = coachPulse(diaryLog, nutrition.targets);
  const focus = coachFocus(pulse);
  const maxKcal = Math.max(...pulse.rows.map((row) => row.kcal), pulse.kcalTarget, 1);
  const updated = share.updatedAt
    ? new Date(share.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not yet synced';

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <header className="mb-6 border-b pb-5" style={{ borderColor: 'var(--line)' }}>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Forq · read-only coach view</p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold">{share.household.name}</h1>
        <p className="mt-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Shared as “{share.label}”. Updated {updated}. This link cannot edit, message or export household data.
        </p>
      </header>

      <div className="space-y-6">
        {share.scopes.includes('diary') && (
          <section aria-labelledby="coach-diary">
            <h2 id="coach-diary" className="mb-3 text-[1.125rem] font-extrabold">Food diary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Logged days" value={pulse.loggedDays} />
              <Stat label="Food entries" value={countEntries(diaryLog)} />
              <Stat label="Meals cooked" value={Array.isArray(diary.cooked) ? diary.cooked.length : 0} />
            </div>
            <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-extrabold">Recent coaching pulse</p>
                <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>Last {pulse.rows.length || 0} recorded days</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Avg calories" value={pulse.loggedDays ? `${pulse.avgKcal} kcal` : '—'} />
                <Stat label="Avg protein" value={pulse.loggedDays ? `${pulse.avgProtein} g` : '—'} />
                <Stat label="Calories near target" value={pulse.kcalTarget ? `${pulse.kcalHitPct}%` : '—'} />
                <Stat label="Protein target days" value={pulse.proteinTarget ? `${pulse.proteinHitPct}%` : '—'} />
              </div>
              {pulse.rows.length > 0 && (
                <div className="mt-4 space-y-2" aria-label="Recent calorie pattern">
                  {pulse.rows.map((row) => <PulseBar key={row.date} row={row} maxKcal={maxKcal} />)}
                </div>
              )}
              <p className="mt-3 rounded-xl border p-3 text-[0.75rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)', background: 'var(--card-2)' }}>
                <span className="font-extrabold" style={{ color: 'var(--ink)' }}>Suggested focus: </span>{focus}
              </p>
            </div>
          </section>
        )}

        {share.scopes.includes('nutrition') && (
          <section aria-labelledby="coach-nutrition">
            <h2 id="coach-nutrition" className="mb-3 text-[1.125rem] font-extrabold">Nutrition settings</h2>
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
              <p className="font-bold capitalize">Goal: {nutrition.goal || 'Not set'}</p>
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Dietary patterns: {(nutrition.diets || []).join(', ') || 'none recorded'}
              </p>
              <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Allergies: {(nutrition.allergies || []).join(', ') || 'none recorded'}
              </p>
            </div>
          </section>
        )}

        {share.scopes.includes('plan') && (
          <section aria-labelledby="coach-plan">
            <h2 id="coach-plan" className="mb-3 text-[1.125rem] font-extrabold">Meal plan</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Planned days" value={Object.keys(plan.plan || {}).length} />
              <Stat label="Planned meals" value={countPlanned(plan.plan)} />
            </div>
          </section>
        )}

        {share.scopes.includes('health') && (
          <section aria-labelledby="coach-health">
            <h2 id="coach-health" className="mb-3 text-[1.125rem] font-extrabold">Health records</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Measurements" value={(health.measurements || []).length} />
              <Stat label="Vitals" value={(health.vitals || []).length} />
              <Stat label="Sleep records" value={(health.sleep || []).length} />
              <Stat label="Blood results" value={(health.bloods || []).length} />
            </div>
          </section>
        )}
      </div>

      <footer className="mt-8 border-t pt-4 text-[0.75rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
        Access expires {new Date(share.expiresAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}.
        The household owner can revoke it immediately.
      </footer>
    </main>
  );
}

