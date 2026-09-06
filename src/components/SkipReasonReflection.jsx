import { reasonLabel } from '../lib/plan-outcome.js';

/**
 * The one-question follow-up after rating a missed-meal card.
 *
 * The card's answer says a planned meal was skipped and stamps *why*. Recall
 * of that reason is graded by the rating buttons — but whether the reason is
 * still true of the household is a separate claim, so before the review
 * moves on it asks. The answer folds into the skip-reason learning profile;
 * dismissing grades the card without recording anything.
 */
export default function SkipReasonReflection({ reason, ratingLabel, onAnswer, onDismiss }) {
  const label = reasonLabel(reason);
  return (
    <div
      className="mt-3 rounded-2xl border px-4 py-3 text-left"
      style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
      aria-label={`Reflect on the skip reason: ${label}`}
    >
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        {ratingLabel ? `Rated ${ratingLabel} — one more question` : 'One more question'}
      </p>
      <p className="mt-1 text-[0.8125rem] font-extrabold leading-snug">
        Does “{label}” still describe why planned meals get skipped?
      </p>
      <p className="mt-0.5 text-[0.6875rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
        Your answer is folded into the household's skip-reason profile — it shapes what the plan learns about you.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={`Still applies — ${label} remains a real reason`}
          onClick={() => onAnswer(true)}
          className="press rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold"
          style={{ background: 'var(--good)', color: 'var(--on-accent)' }}
        >
          Still applies
        </button>
        <button
          type="button"
          aria-label={`No longer applies — ${label} has changed`}
          onClick={() => onAnswer(false)}
          className="press rounded-xl border px-3 py-2 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
        >
          No longer applies
        </button>
        <button
          type="button"
          aria-label="Skip the reflection and grade the card"
          onClick={onDismiss}
          className="press text-[0.78125rem] font-bold"
          style={{ color: 'var(--faint)' }}
        >
          Just grade it
        </button>
      </div>
    </div>
  );
}
