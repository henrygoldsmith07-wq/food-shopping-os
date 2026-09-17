import { useState } from 'react';
import { CircleCheck, CircleX, ListChecks } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { loopInference } from '../lib/loop-inference.js';
import { Card } from './ui.jsx';

/**
 * The loop's one lightweight confirmation step: meals the plan left open
 * get a single "did this happen?" tap instead of manual logging, and a
 * missing list row gets a one-tap top-up. Nothing is ever assumed — each
 * card is a question, and both answers land through the normal commands
 * (ledger events, undo, learning all intact).
 */
export default function LoopConfirmCard({ goTab }) {
  const app = useApp();
  const { proposals, listTopUp } = loopInference(app, { today: app.day, maxProposals: 3 });
  const [answered, setAnswered] = useState({});
  if (!proposals.length && !listTopUp.length) return null;

  const live = proposals.filter((p) => !answered[p.id]);

  const resolve = (proposal, cooked) => {
    app.resolveMealOutcome?.({
      date: proposal.date,
      slot: proposal.slot,
      recipeId: proposal.recipeId,
      cooked,
      reason: cooked ? null : 'not-cooked',
    });
    setAnswered((current) => ({ ...current, [proposal.id]: true }));
  };

  const addTopUp = () => {
    for (const row of listTopUp) {
      app.addToList?.({ name: row.name, qty: row.qty, fromRecipe: row.fromRecipe || undefined });
    }
    goTab?.('shop');
  };

  return (
    <section className="px-5" aria-label="Confirm the week">
      <Card className="!p-4">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
          <ListChecks size={12} /> Quick check
        </p>
        <div className="mt-2.5 space-y-3">
          {live.map((proposal) => (
            <div key={proposal.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-extrabold leading-snug">{proposal.description}</p>
                <p className="text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
                  One tap closes the loop — it teaches next week's plan.
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => resolve(proposal, true)}
                  className="press inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-[0.71875rem] font-extrabold"
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                  aria-label={`Yes — ${proposal.description}`}
                >
                  <CircleCheck size={13} /> Yes
                </button>
                <button
                  type="button"
                  onClick={() => resolve(proposal, false)}
                  className="press inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                  aria-label={`No — ${proposal.description}`}
                >
                  <CircleX size={13} /> No
                </button>
              </div>
            </div>
          ))}
          {listTopUp.length > 0 && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-extrabold leading-snug">
                  {listTopUp.length} item{listTopUp.length === 1 ? '' : 's'} the plan needs aren't on your list
                </p>
                <p className="truncate text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {listTopUp.slice(0, 3).map((r) => r.name).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={addTopUp}
                className="press shrink-0 rounded-xl border px-2.5 py-2 text-[0.71875rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Add them
              </button>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
