/**
 * The one thing the Week screen leads with.
 *
 * Every other card on that screen answers a question; this one answers "what
 * do I do now", and it is the only card allowed to look like a call to action
 * at the top of the page. The ranking it renders comes from `lib/next-action.js`
 * — the component makes no decisions of its own, so the same answer is
 * available to anything else that needs it.
 *
 * When there is genuinely nothing to do, it says that instead of inventing a
 * suggestion. "Nothing is on fire" is a real answer and a useful one.
 */

import { Card } from './ui.jsx';
import { Glyph } from './icons.jsx';

const GLYPH = {
  'use-soon': '🥬',
  'confirm-loop': '🍽️',
  'recover-week': '🧭',
  'plan-week': '📅',
  shop: '🛒',
  setup: '⚙️',
};

export default function NextActionCard({ action, onRun }) {
  if (!action) {
    return (
      <section className="px-5" aria-label="Next action">
        <Card>
          <p className="text-[0.9375rem] font-extrabold">Nothing needs you right now</p>
          <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your week is planned and the list is done. Cook something, and Forq will learn from it.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="px-5" aria-label="Next action">
      <Card>
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'var(--accent-soft)' }}
          >
            <Glyph e={GLYPH[action.id] || '🍽️'} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Next
            </p>
            <p className="mt-0.5 text-[0.9375rem] font-extrabold">{action.title}</p>
            {action.detail && (
              <p className="mt-1 text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                {action.detail}
              </p>
            )}
            {action.cta && (
              <button
                type="button"
                onClick={onRun}
                className="press mt-2.5 rounded-xl px-4 py-2.5 text-[0.8125rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {action.cta}
              </button>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
