import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import { Card } from './ui.jsx';

/**
 * Decisions, rendered. Every recommendation Forq surfaces reads the same way:
 * the recommendation, the reason, the evidence behind it, what acting is
 * worth, and three ways to respond — Do it, an alternative, and Not now.
 * "Not now" is not a discard: the screen logs it as a rejected recommendation,
 * which is exactly how the household teaches Forq what not to say again.
 *
 * The component makes no decisions of its own — the ranked stack comes from
 * lib/food-intelligence.js, and confidence is shown honestly (a prediction
 * says it is a prediction; weak evidence never sounds like certainty).
 */

/** One decision card: recommendation → reason → evidence → impact → action. */
export function DecisionCard({ decisionRow, onDo, onAlternative, onDismiss }) {
  const row = decisionRow;
  if (!row?.action) return null;
  const confidenceLine = row.confidence === 'low'
    ? 'Low confidence — based on limited evidence.'
    : row.confidence === 'medium'
      ? 'Based on what Forq can see so far.'
      : null;

  return (
    <Card className="!p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: row.kind === 'waste' ? 'color-mix(in srgb, var(--warn) 12%, transparent)' : 'var(--accent-soft)' }}
        >
          {row.kind === 'waste'
            ? <AlertTriangle size={16} style={{ color: 'var(--warn)' }} />
            : <Check size={16} style={{ color: 'var(--accent)' }} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-extrabold leading-snug">{row.title}</p>
          {row.reason && (
            <p className="mt-0.5 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {row.reason}
            </p>
          )}
          {row.evidence.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {row.evidence.slice(0, 3).map((line) => (
                <li key={line} className="text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                  · {line}
                </li>
              ))}
            </ul>
          )}
          {row.impact && (
            <p className="mt-1.5 text-[0.71875rem] font-extrabold" style={{ color: 'var(--accent)' }}>
              {row.impact}
            </p>
          )}
          {confidenceLine && (
            <p className="mt-1 text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>
              {confidenceLine}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDo?.(row)}
              className="press rounded-xl px-3.5 py-2 text-[0.78125rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {row.action.label || 'Do it'}
            </button>
            {row.alternative && (
              <button
                type="button"
                onClick={() => onAlternative?.(row)}
                className="press rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                {row.alternative.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss?.(row)}
              className="press text-[0.71875rem] font-bold"
              style={{ color: 'var(--faint)' }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * A ranked stack of decisions. Surfaces pass the decisions; the stack renders
 * them in order and stays silent when there is nothing worth deciding —
 * quiet is a real answer.
 */
export function DecisionStack({ decisions = [], title = 'Worth deciding', onDo, onAlternative, onDismiss, empty = null }) {
  if (!decisions.length) return empty;
  return (
    <section className="px-5 space-y-2.5" aria-label={title}>
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        {title}
      </p>
      {decisions.map((row) => (
        <DecisionCard
          key={row.id}
          decisionRow={row}
          onDo={onDo}
          onAlternative={onAlternative}
          onDismiss={onDismiss}
        />
      ))}
    </section>
  );
}

/** Quiet link row under a stack, for the destinations a decision points to. */
export function DecisionLink({ label, onClick }) {
  if (!label) return null;
  return (
    <button type="button" onClick={onClick} className="press inline-flex items-center gap-0.5 text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
      {label} <ChevronRight size={13} />
    </button>
  );
}
