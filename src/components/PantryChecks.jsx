import { Check, TriangleAlert } from 'lucide-react';
import { Card, Pill, Section } from './ui.jsx';
import { Glyph } from './icons.jsx';

/**
 * The two things the pantry is unsure about, and asks you to settle.
 *
 * Confidence checks are stock that has aged past the point the app is willing
 * to keep calling it confirmed — it decays rather than staying true forever,
 * because a tin bought in March is not evidence about tonight. Conflicts are
 * two sources disagreeing about a quantity, which is a decision only the
 * household can make.
 */
export default function PantryChecks({ app, confidenceChecks, conflicts }) {
  return (
    <>
      {confidenceChecks.length > 0 && (
        <Section title={`Check pantry confidence · ${confidenceChecks.length}`} className="!px-0">
          <Card className="space-y-3">
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Older or uncertain stock is not silently treated as confirmed. Confirm anything you still have.
            </p>
            {confidenceChecks.length > 1 && (
              <button
                type="button"
                onClick={() => confidenceChecks.forEach(({ item }) => app.confirmPantryItem(item.id))}
                className="press w-full rounded-xl border px-3 py-2.5 text-[0.75rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Confirm all {confidenceChecks.length} stock rows
              </button>
            )}
            {confidenceChecks.slice(0, 8).map(({ item, confidence }) => (
              <div key={item.id} className="flex items-center gap-3">
                <Glyph e={item.emoji} size={20} style={{ color: 'var(--muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[0.8125rem] truncate">{item.name}</p>
                  <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{confidence.reason}</p>
                </div>
                <button
                  onClick={() => app.confirmPantryItem(item.id)}
                  aria-label={`Confirm ${item.name}`}
                  className="press shrink-0 rounded-xl border px-2.5 py-1.5 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Confirm stock
                </button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {conflicts.length > 0 && (
        <Section title={`Pantry conflicts · ${conflicts.length}`} className="!px-0">
          <Card className="space-y-3">
            {conflicts.slice(0, 8).map((conflict) => (
              <div key={conflict.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--line)' }}>
                <p className="font-bold text-[0.8125rem]">{conflict.title}</p>
                <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{conflict.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'keep_separate')}
                    className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                  >
                    Keep separate
                  </button>
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'merge')}
                    className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    Merge as written
                  </button>
                  <button
                    onClick={() => app.resolvePantryConflict(conflict.id, 'dismiss')}
                    className="press rounded-xl px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                    style={{ color: 'var(--faint)' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}
