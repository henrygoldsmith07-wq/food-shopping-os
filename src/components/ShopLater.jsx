import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, Section } from './ui.jsx';
import { canWaitRows } from '../lib/needed-by.js';
import { weekDates } from '../lib/kitchen.js';
import { heldRows, tripRows } from '../lib/top-up.js';
import { haptic } from '../lib/haptics.js';

const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

/**
 * "Can wait until later": list rows whose first planned meal is three or
 * more days away, with the day and meal that needs them. Read-only advice so
 * a midweek top-up can replace carrying everything home today.
 */
export default function ShopLater({ app, shoppingMode = false }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => canWaitRows(tripRows(app.shoppingList, app.day), app.plan, weekDates(app.day, 14), app.day),
    [app.shoppingList, app.plan, app.day],
  );
  const held = useMemo(() => heldRows(app.shoppingList, app.day), [app.shoppingList, app.day]);
  const [announce, setAnnounce] = useState('');
  const canEdit = app.householdAccess?.shopping !== false && typeof app.holdForTopUp === 'function';
  const hold = (ids, text) => { haptic(); app.holdForTopUp(ids); setAnnounce(text); };
  const release = (ids, text) => { haptic(); app.releaseTopUp(ids); setAnnounce(text); };
  if (shoppingMode || (!rows.length && !held.length)) return null;
  const shown = open ? rows : rows.slice(0, 3);
  const heldCard = held.length > 0 && (
    <Section title={`Held for a top-up · ${held.length}`} className="rise rise-2">
      <Card className="space-y-2">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Not on today’s trip. Each comes back on its own the day before it’s needed.
        </p>
        <ul className="space-y-1.5" aria-label="Items held for a top-up">
          {held.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-[0.8125rem]">
              <span className="font-bold">{item.name}{item.qty ? ` · ${item.qty}` : ''}
                <span className="block text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>Back on {dayName(item.topUpOn)}</span>
              </span>
              {canEdit && (
                <button type="button" className="press min-h-[44px] px-3 text-[0.75rem] font-extrabold" aria-label={`Buy ${item.name} today instead`}
                  onClick={() => release([item.id], `${item.name} is back on today’s list.`)}>Buy today</button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && held.length > 1 && (
          <button type="button" className="press min-h-[44px] text-[0.75rem] font-extrabold" onClick={() => release(null, 'Everything is back on today’s list.')}>Bring all back</button>
        )}
      </Card>
    </Section>
  );
  const live = <p className="sr-only" role="status">{announce}</p>;
  if (!rows.length) return <>{heldCard}{live}</>;
  return (
    <>
    {heldCard}
    {live}
    <Section title={`Could wait for a top-up · ${rows.length}`} className="rise rise-2">
      <Card className="space-y-2">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Your plan doesn’t use these until later in the week. Buy them now, or on a midweek top-up while they’re at their freshest.
        </p>
        <ul className="space-y-1.5" aria-label="Items not needed until later this week">
          {shown.map(({ item, date, slot, recipe }) => (
            <li key={item.id} className="text-[0.8125rem]">
              <span className="inline-flex items-center gap-1.5 font-bold">
                <CalendarClock size={13} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                {item.name}{item.qty ? ` · ${item.qty}` : ''}
              </span>
              <span className="block text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                First needed {dayName(date)} {slot} · {recipe}
              </span>
              {canEdit && (
                <button type="button" className="press mt-1 min-h-[44px] rounded-xl border px-3 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}
                  aria-label={`Hold ${item.name} for a top-up`} onClick={() => hold([item.id], `${item.name} held for a top-up.`)}>Hold for top-up</button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && rows.length > 1 && (
          <button type="button" className="press min-h-[44px] text-[0.75rem] font-extrabold" onClick={() => hold(rows.map((r) => r.item.id), `${rows.length} items held for a top-up.`)}>Hold all {rows.length} for a top-up</button>
        )}
        {rows.length > 3 && (
          <button type="button" className="press text-[0.75rem] font-extrabold" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </Card>
    </Section>
    </>
  );
}
