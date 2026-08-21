import { AlarmClock, Clock, Coins, Package, Snowflake, Leaf, Star } from 'lucide-react';

/**
 * Every recommendation explains itself in the same five checkable lines the
 * brief asks for:
 *
 * Chicken fajitas
 * 83% already in your kitchen
 * Uses peppers expiring tomorrow
 * 24 minutes — fits Tuesday's schedule
 * £2.17/person
 * Creates two lunch portions
 *
 * The numbers are not invented — they come straight from the engine's
 * `explainRecommendation` result so a user can verify each line against
 * their actual kitchen.
 */
export default function RecommendationExplanation({ explanation, compact = false }) {
  if (!explanation) return null;
  const { coverage, expiring, timeMins, schedule, cost, leftover, seasonal, taste } = explanation;

  const pantryLine = `${coverage.pct}% already in your kitchen`;
  const pantrySub = coverage.total ? ` · ${coverage.have}/${coverage.total} ingredients` : '';
  const expiringLine = expiring.length
    ? `Uses ${expiring.map((e) => {
        const name = e.pantryItem.name;
        if (e.daysLeft <= 0) return `${name.toLowerCase()} expiring today`;
        if (e.daysLeft === 1) return `${name.toLowerCase()} expiring tomorrow`;
        return `${name.toLowerCase()} expiring in ${e.daysLeft}d`;
      }).join(', ')}`
    : null;
  const timeLine = `${timeMins} minutes — ${schedule.fits ? `fits ${schedule.reason || "today's schedule"}` : schedule.reason || "too long for this day"}`;
  const costLine = `£${cost.toFixed(2)}/person`;
  const leftoverLine = leftover.note;
  const seasonalLine = seasonal ? `In season: ${seasonal} ingredient${seasonal === 1 ? '' : 's'} at its best` : null;

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold" style={{ background: coverage.pct >= 60 ? 'color-mix(in srgb, var(--good) 14%, transparent)' : 'var(--card-2)', color: coverage.pct >= 60 ? 'var(--good-deep)' : 'var(--muted)' }}>
            <Package size={11} /> {pantryLine}
          </span>
          {expiringLine && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold" style={{ background: 'color-mix(in srgb, var(--warn) 14%, transparent)', color: 'var(--warn-deep)' }}>
              <AlarmClock size={11} /> {expiringLine}
            </span>
          )}
          {leftoverLine && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold" style={{ background: 'var(--card-2)', color: 'var(--muted)' }}>
              <Snowflake size={11} /> {leftoverLine}
            </span>
          )}
        </div>
        <p className="text-[0.75rem] font-semibold flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--muted)' }}>
          <span className="inline-flex items-center gap-1"><Clock size={11} /> {timeLine}</span>
          <span className="inline-flex items-center gap-1"><Coins size={11} /> {costLine}</span>
          {seasonalLine && <span className="inline-flex items-center gap-1"><Leaf size={11} /> {seasonalLine}</span>}
          {taste > 6 && <span className="inline-flex items-center gap-1"><Star size={11} /> matches your taste</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1.5">
        <Package size={13} style={{ color: coverage.pct >= 60 ? 'var(--good)' : 'var(--muted)' }} />
        {pantryLine}<span className="font-semibold" style={{ color: 'var(--muted)' }}>{pantrySub}</span>
      </p>
      {expiringLine && (
        <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--warn-deep)' }}>
          <AlarmClock size={13} /> {expiringLine}
        </p>
      )}
      <p className="text-[0.8125rem] font-semibold inline-flex items-center gap-1.5" style={{ color: schedule.fits ? 'var(--muted)' : 'var(--danger)' }}>
        <Clock size={13} /> {timeLine}
      </p>
      <p className="text-[0.8125rem] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
        <Coins size={13} /> {costLine}
      </p>
      {leftoverLine && (
        <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
          <Snowflake size={13} /> {leftoverLine}
        </p>
      )}
      {seasonalLine && <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{seasonalLine}</p>}
    </div>
  );
}

/** Tiny inline pantry chip used in plan cards before full explanation loads. */
export function PantryCoveragePill({ coverage }) {
  if (!coverage || coverage.total === 0) return null;
  const tone = coverage.pct >= 75 ? 'good' : coverage.pct >= 40 ? 'accent' : 'muted';
  return null; // kept for backwards compat, use RecommendationExplanation compact instead
}
