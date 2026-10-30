import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, Section } from './ui.jsx';
import { canWaitRows } from '../lib/needed-by.js';
import { weekDates } from '../lib/kitchen.js';

const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

/**
 * "Can wait until later": list rows whose first planned meal is three or
 * more days away, with the day and meal that needs them. Read-only advice so
 * a midweek top-up can replace carrying everything home today.
 */
export default function ShopLater({ app, shoppingMode = false }) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => canWaitRows(app.shoppingList, app.plan, weekDates(app.day, 14), app.day),
    [app.shoppingList, app.plan, app.day],
  );
  if (shoppingMode || !rows.length) return null;
  const shown = open ? rows : rows.slice(0, 3);
  return (
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
            </li>
          ))}
        </ul>
        {rows.length > 3 && (
          <button type="button" className="press text-[0.75rem] font-extrabold" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Show fewer' : `Show all ${rows.length}`}
          </button>
        )}
      </Card>
    </Section>
  );
}
