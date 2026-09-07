import { dayStamp } from '../domain/scheduling';

/**
 * The week ahead on the Learn tab: one bar per day for the next seven days,
 * so a user can see the review workload coming instead of meeting it one
 * morning at a time. The bar scales against the week's busiest day, today is
 * named instead of dated, and quiet days shrink to a hairline rather than
 * reading as a hole.
 */
export default function WeekAheadForecast({ forecast = [], now }) {
  const peak = Math.max(...forecast.map((day) => day.count), 1);
  return (
    <div className="mb-3" aria-label="Week-ahead forecast">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        Coming up
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-1">
        {forecast.map((day) => {
          const isToday = day.date === dayStamp(now);
          return (
            <div
              key={day.date}
              aria-label={`${day.count} cards due on ${day.date}`}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div
                className="w-full rounded-md"
                style={{
                  height: day.count > 0 ? `${6 + (day.count / peak) * 18}px` : '2px',
                  background: day.count > 0 ? 'var(--accent)' : 'var(--line)',
                  opacity: isToday || day.count > 0 ? 1 : 0.45,
                }}
              />
              <span
                className="text-[0.5625rem] font-bold"
                style={{ color: isToday ? 'var(--accent)' : 'var(--faint)' }}
              >
                {isToday ? 'Today' : day.date.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
