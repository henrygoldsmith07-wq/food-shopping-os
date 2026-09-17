import { useState } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { collectAdaptations } from '../lib/adaptations.js';
import { Card } from './ui.jsx';

const TONE = {
  high: { color: 'var(--accent)', label: 'Strong evidence' },
  medium: { color: 'var(--warn)', label: 'Some evidence' },
  low: { color: 'var(--faint)', label: 'Light evidence' },
};

/**
 * What Forq changed based on what actually happened — the only place
 * learning surfaces by default. Each row is one adaptation in the same
 * four-part shape: what changed, the evidence behind it, how confident it
 * is, and a one-tap undo. Undoing teaches: repeatedly corrected changes
 * stop being applied (adaptations.js), so the household stays in charge.
 */
export default function AdaptationsCard() {
  const app = useApp();
  const { adaptations } = collectAdaptations(app, { today: app.day });
  const [open, setOpen] = useState(false);
  if (!adaptations.length) return null;

  const undo = (adaptation) => {
    app.undoAdaptation?.(adaptation);
  };

  const visible = open ? adaptations : adaptations.slice(0, 3);

  return (
    <section className="px-5" aria-label="Changes Forq made">
      <Card className="!p-4">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
          <Sparkles size={12} /> Changed for you
        </p>
        <div className="mt-2.5 space-y-3">
          {visible.map((row) => {
            const tone = TONE[row.confidence] || TONE.low;
            return (
              <div key={row.id} className="space-y-1">
                <p className="text-[0.8125rem] font-extrabold leading-snug">{row.title}</p>
                <p className="text-[0.71875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
                  {row.evidence}
                  {' · '}
                  <span style={{ color: tone.color }}>{tone.label}</span>
                </p>
                {row.undo && (
                  <button
                    type="button"
                    onClick={() => undo(row)}
                    className="press inline-flex items-center gap-1 text-[0.71875rem] font-extrabold"
                    style={{ color: 'var(--muted)' }}
                    aria-label={`Undo: ${row.title}`}
                  >
                    <Undo2 size={11} /> Not for me
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {adaptations.length > 3 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="press mt-3 text-[0.71875rem] font-extrabold"
            style={{ color: 'var(--accent)' }}
          >
            {open ? 'Show fewer' : `Show ${adaptations.length - 3} more change${adaptations.length - 3 === 1 ? '' : 's'}`}
          </button>
        )}
      </Card>
    </section>
  );
}
