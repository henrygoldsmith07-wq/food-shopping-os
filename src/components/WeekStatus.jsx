import { AlertTriangle, Check } from 'lucide-react';
import { Card } from './ui.jsx';

/**
 * Home's third area: one derived week status and the exceptions that need a
 * human — nothing else. Both panels read the Week Manager derivation
 * (lib/week-manager.js), so Home can never disagree with the plan, pantry,
 * list and recovery systems underneath it.
 */

/** One week status with what Forq already handled — the calm default. */
export function WeekStatusCard({ manager, onOpenWeekLoop }) {
  return (
    <section aria-label="Week status">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Week status
        </p>
        <p className="mt-1 text-[1.0625rem] font-extrabold tracking-tight">{manager.statusLine}</p>
        {manager.summary.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {manager.summary.map((line) => (
              <li key={line} className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                · {line}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => (onOpenWeekLoop ? onOpenWeekLoop(null) : undefined)}
          className="press mt-2.5 text-[0.78125rem] font-extrabold"
          style={{ color: 'var(--accent)' }}
        >
          Start the week →
        </button>
      </Card>
    </section>
  );
}

/**
 * Needs attention — only exceptions, and a quiet state when there are none.
 * An autonomous product should sometimes have nothing for the user to do,
 * and say so.
 *
 * The footer keeps every core destination one tap away as quiet secondary
 * links (not competing CTAs), and the cold-start block keeps the empty-pantry
 * / empty-list prompts that lead straight into value.
 */
export function NeedsAttentionCard({ manager, app, goTab, openPantry }) {
  const coldStart = (app?.pantry || []).length === 0 && (app?.shoppingList || []).length === 0;

  return (
    <section aria-label="Needs attention">
      <Card>
        <div className="flex items-baseline justify-between">
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Needs attention
          </p>
          {manager.quiet && !coldStart && (
            <span className="inline-flex items-center gap-1 text-[0.71875rem] font-extrabold" style={{ color: 'var(--good)' }}>
              <Check size={13} strokeWidth={3} /> All clear
            </span>
          )}
        </div>

        {manager.quiet ? (
          <div className="mt-2">
            <p className="text-[0.9375rem] font-extrabold">Nothing needs attention.</p>
            <p className="mt-0.5 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              You’re sorted for tonight. Forq will surface the next thing worth doing here.
            </p>
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {manager.exceptions.map((exception) => (
              <li key={exception.id}>
                <button
                  type="button"
                  onClick={() => goTab?.(exception.goTab)}
                  className="press flex w-full items-start gap-2.5 rounded-2xl border p-3 text-left"
                  style={{
                    borderColor: exception.severity === 'warn' ? 'var(--warn)' : 'var(--line)',
                    background: exception.severity === 'warn' ? 'color-mix(in srgb, var(--warn) 8%, transparent)' : 'var(--card)',
                  }}
                >
                  {exception.severity === 'warn' && (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.84375rem] font-extrabold">{exception.title}</span>
                    {exception.detail && (
                      <span className="mt-0.5 block text-[0.71875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                        {exception.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[0.71875rem] font-extrabold" style={{ color: 'var(--accent)' }}>
                    {exception.actionLabel || 'Open'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Cold start: nothing tracked and nothing listed — the empty states
            lead straight into value instead of showing zeros. */}
        {coldStart && (
          <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--line)' }}>
            <button type="button" onClick={openPantry} className="press w-full text-left">
              <span className="block text-[0.875rem] font-extrabold">Nothing tracked yet</span>
              <span className="mt-0.5 block text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                Add a few ingredients and Forq can stop buying things you already own.
              </span>
            </button>
            <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Empty — add items or send a recipe’s ingredients over.
            </p>
          </div>
        )}

        {/* Quiet secondary links: every core destination stays one tap away
            without competing for the primary action. "Full plan" lives on the
            Today’s meals section header, so it is not repeated here. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5" style={{ borderColor: 'var(--line)' }}>
          <button type="button" onClick={openPantry} className="press text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
            Open pantry →
          </button>
          <button type="button" onClick={() => goTab?.('shop')} className="press text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
            Open shopping list →
          </button>
        </div>
      </Card>
    </section>
  );
}
