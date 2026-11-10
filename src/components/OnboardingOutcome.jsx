import { ArrowRight, CalendarDays, Package, ShoppingCart } from 'lucide-react';

const outcomes = {
  plan: { Icon: CalendarDays, title: 'A week built around your dinners', steps: ['Pick dinners', 'See your plan', 'Review ingredients'] },
  shop: { Icon: ShoppingCart, title: 'One list from the meals you choose', steps: ['Choose meals', 'Combine ingredients', 'Review your list'] },
  pantry: { Icon: Package, title: 'Start with one thing in your kitchen', steps: ['Add an item', 'Confirm quantity', 'Plan around it'] },
};

/** Explains the selected route without inventing stock, meals or savings. */
export default function OnboardingOutcome({ goal }) {
  const { Icon, title, steps } = outcomes[goal] || outcomes.plan;
  return (
    <aside className="rounded-2xl p-4" style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }} aria-label="Your selected starting route">
      <p className="flex items-center gap-2 text-[0.8125rem] font-extrabold"><Icon size={16} aria-hidden="true" />{title}</p>
      <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {steps.map((text, index) => <li key={text} className="inline-flex items-center gap-2">
          {index > 0 && <ArrowRight size={12} aria-hidden="true" />}
          <span>{index + 1}. {text}</span>
        </li>)}
      </ol>
      <p className="mt-3 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--muted)' }}>No account needed. Nothing is added until you choose it.</p>
    </aside>
  );
}
