import { useMemo } from 'react';
import { useApp } from '../lib/store.jsx';
import { reasonLabel } from '../lib/plan-outcome.js';
import {
  CONFIRM_THRESHOLD, SKIP_PHRASES, confirmedSkipReasonIds,
} from '../lib/skip-preferences.js';
import { Card, Section } from './ui.jsx';

/**
 * What the household's review reflections have taught the planner.
 *
 * One row per reflected reason: the label, what the plan leans on once the
 * reason is confirmed still-applies, and the honest state — confirmed (the
 * next plan leans on it), one away (needs one more "still applies"), or
 * no-longer-true (the household said the reason changed, so it shapes
 * nothing). Reads the same shared phrases and threshold the planner uses,
 * so what the card promises is exactly what planning does. No reflections,
 * no card — silence instead of a placeholder.
 *
 * Each row that has due questions is a one-tap path to them: it asks the
 * review queue (rendered above) to focus that reason's cards, so the loop
 * from seeing what a reason taught the plan to answering the next reflection
 * is one tap, not a hunt through the queue.
 */
export default function SkipReasonsCard({ onReviewReason = null }) {
  const app = useApp();
  // Which reasons have due questions right now — same source the queue shows.
  const dueByReason = useMemo(() => {
    const groups = app.reviewDueReasonGroups?.() || [];
    return new Map(groups.map((g) => [g.reason, g.count]));
  }, [app.cards]);
  const profile = app.skipReasonProfile && typeof app.skipReasonProfile === 'object' && !Array.isArray(app.skipReasonProfile)
    ? app.skipReasonProfile
    : {};
  const rows = Object.entries(profile)
    .map(([reasonId, entry]) => ({
      reasonId,
      label: reasonLabel(reasonId),
      applies: entry?.applies || 0,
      changed: entry?.changed || 0,
      lastStillApplies: entry?.lastStillApplies === true,
      dueCount: dueByReason.get(reasonId) || 0,
    }))
    .sort((a, b) => (b.applies + b.changed) - (a.applies + a.changed));
  if (!rows.length) return null;

  const confirmed = new Set(confirmedSkipReasonIds(profile));

  return (
    <Section title="How your skip reasons shape the plan" className="rise rise-2">
      <Card className="!p-4">
        <p className="text-[0.9375rem] font-extrabold">The plan listens to what you said still applies</p>
        <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          Review a skipped-meal question and say whether its reason still holds. Confirm a reason
          {` ${CONFIRM_THRESHOLD}`} times and the next plan leans on it.
        </p>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const isConfirmed = confirmed.has(row.reasonId);
            const phrase = SKIP_PHRASES[row.reasonId] || null;
            const tone = !row.lastStillApplies
              ? { color: 'var(--faint)', text: 'You said this no longer applies — it shapes nothing.' }
              : isConfirmed
                ? { color: 'var(--good)', text: phrase
                    ? `Confirmed — the next plan leans on ${phrase}.`
                    : 'Confirmed — the next plan takes it into account.' }
                : { color: 'var(--muted)', text: `One more “still applies” and the plan leans on ${phrase || 'this'}.` };
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.8125rem] font-extrabold" style={{ color: 'var(--ink)' }}>{row.label}</p>
                  <p className="shrink-0 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
                    {row.applies} still apply · {row.changed} changed
                  </p>
                </div>
                <p className="mt-1 text-[0.75rem] font-semibold leading-relaxed" style={{ color: tone.color }}>
                  {tone.text}
                </p>
                {onReviewReason && row.dueCount > 0 && (
                  <p className="mt-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                    Review {row.dueCount} question{row.dueCount === 1 ? '' : 's'} →
                  </p>
                )}
              </>
            );
            const canReview = Boolean(onReviewReason && row.dueCount > 0);
            return (
              <li key={row.reasonId} className="rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
                {canReview ? (
                  <button
                    type="button"
                    aria-label={`Review ${row.dueCount} ${row.label} question${row.dueCount === 1 ? '' : 's'}`}
                    onClick={() => onReviewReason(row.reasonId)}
                    className="press block w-full text-left"
                  >
                    {body}
                  </button>
                ) : body}
              </li>
            );
          })}
          {!confirmed.size && (
            <li className="text-[0.75rem] font-semibold" style={{ color: 'var(--faint)' }}>
              Nothing is confirmed yet — no plan is leaning on any of these.
            </li>
          )}
        </ul>
      </Card>
    </Section>
  );
}
