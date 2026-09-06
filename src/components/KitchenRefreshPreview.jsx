import { useState } from 'react';
import { useApp } from '../lib/store.jsx';

/**
 * The confirm-before-apply preview, one row per affected card.
 *
 * Each row is a decision, not a list: Apply refreshes just that question,
 * Skip keeps the current answer (or declines the new one) — durably, so the
 * question stops being re-offered and the boot auto-refresh leaves it alone
 * until Settings restores the offers. A row that is acted on leaves the
 * panel; a row left alone is still stale and stays.
 *
 * Two faces, one decision model:
 *  - `kind: 'refresh'` (default) — what a Learn refresh would change, when
 *    the deck already exists. Copy and labels say refresh.
 *  - `kind: 'seed'` — what the Today strip would build into an empty deck.
 *    Every row is a new question; apply builds, skip declines.
 * `onApplied(count)` lets a parent show what actually landed, and both kinds
 * apply through the same `applySeedRows` subset action.
 */
export default function KitchenRefreshPreview({ now, plan, kind = 'refresh', onApplied, onClose }) {
  const app = useApp();
  const seedMode = kind === 'seed';
  // A snapshot is fine: applying one row never changes what another row
  // would do, so acting on a row just removes it from the local list.
  const [rows, setRows] = useState(() => [
    ...(plan.updates || []).map((u) => ({ kind: 'update', ...u })),
    ...(plan.additions || []).map((a) => ({ kind: 'addition', ...a })),
    // Outlived plan questions: the slot or week moved on, so the auto card
    // answers nothing current. Remove retires it; Keep keeps it durably.
    ...(plan.removals || []).map((r) => ({ kind: 'removal', ...r })),
  ]);
  const remaining = rows.length;

  const act = (row, mode) => {
    if (mode === 'apply') {
      app.applySeedRows(now, [row.front]);
      if (onApplied) onApplied(1);
    } else {
      app.keepSeedFronts([row.front]);
    }
    setRows((current) => current.filter((r) => r !== row));
    if (remaining <= 1) onClose();
  };

  const applyAll = () => {
    app.applySeedRows(now, rows.map((r) => r.front));
    if (onApplied) onApplied(rows.length);
    onClose();
  };

  const heading = seedMode ? 'Cards your kitchen would build' : 'What refreshing would change';
  const sub = seedMode
    ? 'Add builds the question; Skip leaves it out — restore any kept offer in Settings.'
    : 'Apply refreshes one question; Skip keeps it as-is for good — Settings can bring kept offers back.';

  return (
    <div className="mb-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <p className="text-[0.78125rem] font-bold">{heading}</p>
      {plan.total === 0 ? (
        <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {seedMode
            ? 'Nothing to build right now — your recent kitchen activity is quiet.'
            : 'Everything is already current — nothing to refresh.'}
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {sub}
          </p>
          <ul className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <li
                key={row.front}
                className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
              >
                <div className="min-w-0 text-[0.6875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                  <span className="block font-extrabold" style={{ color: 'var(--ink)' }}>{row.front}</span>
                  {row.kind === 'update' ? (
                    <span className="block">{row.oldBack} <span aria-hidden="true" style={{ color: 'var(--faint)' }}>→</span> {row.newBack}</span>
                  ) : row.kind === 'removal' ? (
                    <span className="block" style={{ color: 'var(--faint)' }}>
                      No longer on the plan — {row.back || 'not planned this week'}. Remove the stale card, or keep it.
                    </span>
                  ) : (
                    <span className="block" style={{ color: 'var(--faint)' }}>New question</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {row.kind === 'removal' ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Remove stale card for ${row.front}`}
                        onClick={() => act(row, 'apply')}
                        className="press text-[0.6875rem] font-extrabold"
                        style={{ color: 'var(--danger)' }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        aria-label={`Keep stale card for ${row.front}`}
                        onClick={() => act(row, 'keep')}
                        className="press text-[0.6875rem] font-bold"
                        style={{ color: 'var(--faint)' }}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={seedMode ? `Add question for ${row.front}` : `Apply refresh for ${row.front}`}
                        onClick={() => act(row, 'apply')}
                        className="press text-[0.6875rem] font-extrabold"
                        style={{ color: 'var(--accent)' }}
                      >
                        {seedMode ? 'Add' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        aria-label={seedMode ? `Skip question for ${row.front}` : `Skip refresh for ${row.front}`}
                        onClick={() => act(row, 'keep')}
                        className="press text-[0.6875rem] font-bold"
                        style={{ color: 'var(--faint)' }}
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                aria-label={seedMode ? 'Add remaining seed questions' : 'Apply remaining refresh changes'}
                onClick={applyAll}
                className="press rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {seedMode ? 'Add remaining' : 'Apply remaining'} ({remaining})
              </button>
              <button
                type="button"
                aria-label={seedMode ? 'Close seed preview' : 'Close refresh preview'}
                onClick={onClose}
                className="press text-[0.78125rem] font-bold"
                style={{ color: 'var(--faint)' }}
              >
                {seedMode ? 'Not now' : 'Keep as is'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
