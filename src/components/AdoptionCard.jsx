import { Check, Undo2, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { adoptionSummary } from '../data/exampleWeek.js';
import { Card } from './ui.jsx';

/**
 * The adoption receipt: the one-time acknowledgement that the example week
 * became the real kitchen. It says what happened in counts (dinners added,
 * real meals kept, staples adopted), offers the plan for review, and —
 * because adoption is the biggest single write a new kitchen sees — makes
 * Undo discoverable instead of hiding it behind Ctrl+Z. Dismissing clears
 * the marker; undoing reverts to the pre-adoption state, which clears it too
 * unless an even earlier adoption is restored (then that receipt correctly
 * shows instead). Renders nothing without an adoption marker.
 */
export default function AdoptionCard({ goTab }) {
  const app = useApp();
  const summary = adoptionSummary(app.adoptedFromDemo);
  if (!summary) return null;

  const parts = [];
  if (summary.added > 0) parts.push(`${summary.added} dinner${summary.added === 1 ? '' : 's'} planned`);
  if (summary.kept > 0) parts.push(`kept your ${summary.kept} planned meal${summary.kept === 1 ? '' : 's'}`);
  if (summary.staples > 0) parts.push(`${summary.staples} pantry staple${summary.staples === 1 ? '' : 's'} added`);

  return (
    <section className="px-5" aria-label="Example week adopted">
      <Card className="!p-3.5 mb-2.5" style={{ borderColor: 'var(--accent)' }}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[0.8125rem] font-bold leading-snug">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} style={{ color: 'var(--good)' }} /> Your week is planned
            </span>
          </p>
          <button
            type="button"
            onClick={() => app.set({ adoptedFromDemo: null })}
            aria-label="Dismiss adoption summary"
            className="press shrink-0 rounded-lg p-1"
            style={{ color: 'var(--faint)' }}
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          {parts.length ? `${parts.join(' · ')} — from the example week. Demo receipts stayed behind.` : 'From the example week. Demo receipts stayed behind.'}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => goTab?.('plan')}
            className="press flex-1 rounded-xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Review your plan
          </button>
          <button
            type="button"
            onClick={() => {
              // A successful undo restores the pre-adoption state, which has
              // no marker (or an earlier adoption's own receipt). Only when
              // there is nothing to undo does dismissing make sense.
              if (app.undoLast?.() === false) app.set({ adoptedFromDemo: null });
            }}
            className="press rounded-xl border px-3 py-2.5 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Undo2 size={14} /> Undo
            </span>
          </button>
        </div>
      </Card>
    </section>
  );
}
