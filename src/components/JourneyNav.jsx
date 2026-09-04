import { BookOpen, CalendarDays, ChefHat, ShoppingCart } from 'lucide-react';
import { cx } from '../lib/utils.js';

export const JOURNEY_STAGES = [
  { id: 'plan', label: 'Plan', hint: 'Choose meals', Icon: CalendarDays },
  { id: 'shop', label: 'Shop', hint: 'Buy what you need', Icon: ShoppingCart },
  { id: 'cook', label: 'Cook', hint: 'Make the next meal', Icon: ChefHat },
  { id: 'learn', label: 'Learn', hint: 'Use what happened', Icon: BookOpen },
];

/** The product spine: every kitchen decision starts and ends in this loop. */
export default function JourneyNav({ active, onNavigate }) {
  return (
    <nav className="journey-nav px-5 pb-3" aria-label="Kitchen journey">
      <ol className="mx-auto grid max-w-3xl grid-cols-4 gap-1.5 rounded-2xl border p-1" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
        {JOURNEY_STAGES.map(({ id, label, hint, Icon }, index) => {
          const selected = active === id;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={selected ? 'page' : undefined}
                aria-label={`${label}: ${hint}`}
                className={cx(
                  'press flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-center',
                  selected && 'journey-nav-active',
                )}
                style={{ color: selected ? 'var(--accent)' : 'var(--muted)', background: selected ? 'var(--card)' : 'transparent' }}
              >
                <span className="inline-flex items-center gap-1 text-[0.75rem] font-extrabold">
                  <span className="text-[0.625rem] font-black" aria-hidden="true">{index + 1}</span>
                  <Icon size={14} strokeWidth={selected ? 2.5 : 1.9} aria-hidden="true" />
                  {label}
                </span>
                <span className="hidden text-[0.625rem] font-semibold sm:block" style={{ color: 'var(--faint)' }}>{hint}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
