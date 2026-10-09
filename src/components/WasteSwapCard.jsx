import { useMemo, useState } from 'react';
import { Check, Move, Recycle } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { weekDates } from '../lib/kitchen.js';
import { planEntries } from '../lib/mealplan.js';
import { wasteSwapSuggestions } from '../lib/waste-swaps.js';
import { Card, Pill } from './ui.jsx';

/**
 * Waste-money moves, right where the plan is made.
 *
 * Each suggestion is a measured gain in the waste score — never a hunch — and
 * is applied with one tap through the same `moveMealSlot` the calendar's drag
 * and grip use, so outings, shopping and prep all show the new nights.
 * A used suggestion is remembered for the day and dropped: the card never
 * re-proposes a move you already took today.
 */
export default function WasteSwapCard({ app, limit = 2, onApplied = null }) {
  const [done, setDone] = useState([]); // suggestion ids already applied
  const week = useMemo(() => weekDates(app.day), [app.day]);
  const suggestions = useMemo(() => wasteSwapSuggestions({
    entries: planEntries(app.plan, week),
    plan: app.plan,
    dates: week,
    pantry: app.pantry,
    today: app.day,
    people: app.household,
    learnedAliases: app.aliasMemory || {},
  }), [app.plan, week, app.pantry, app.day, app.household, app.aliasMemory]);

  const fresh = suggestions
    .map((s) => ({ ...s, id: `${s.kind}|${s.from.date}|${s.to.date}` }))
    .filter((s) => !done.includes(s.id))
    .slice(0, Math.max(1, Number(limit) || 1));
  if (!fresh.length) return null;

  const apply = (s) => {
    app.moveMealSlot(s.from, s.to);
    setDone((ids) => (ids.includes(s.id) ? ids : [...ids, s.id]));
    onApplied?.();
  };

  return (
    <Card className="!p-3 space-y-2" style={{ borderColor: 'color-mix(in srgb, var(--good) 45%, var(--line))' }}>
      <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-extrabold">
        <Recycle size={14} style={{ color: 'var(--good)' }} /> Before your next shop
      </p>
      {fresh.map((s) => (
        <div key={s.id} className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--ink)' }}>
            {s.reason}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Pill tone="good">waste score {s.before} → {s.after}</Pill>
            <button
              onClick={() => apply(s)}
              className="press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-extrabold"
              style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
            >
              <Check size={13} /> Move it
            </button>
          </div>
        </div>
      ))}
    </Card>
  );
}