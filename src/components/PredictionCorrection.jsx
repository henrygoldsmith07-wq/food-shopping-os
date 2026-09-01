import { Check } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { PREDICTION_CORRECTION_OPTIONS } from '../lib/prediction-feedback.js';

export default function PredictionCorrection({ predictionType, predictionKey, predicted, context, label = 'How many do you actually have?' }) {
  const app = useApp();
  const [selected, setSelected] = useState(null);

  const correct = (actual) => {
    if (selected !== null) return;
    app.correctPrediction({ predictionType, predictionKey, predicted, actual, context });
    setSelected(actual);
  };

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={label}>
        {PREDICTION_CORRECTION_OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => correct(option.value)}
              disabled={selected !== null}
              aria-pressed={active}
              className="press rounded-xl border px-2 py-2 text-[0.75rem] font-extrabold disabled:cursor-default"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active ? 'var(--accent-soft)' : 'var(--card)',
                color: active ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              {active && <Check size={12} className="mr-1 inline" />}{option.label}
            </button>
          );
        })}
      </div>
      {selected !== null && <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Thanks — this corrects Forq and teaches your household pattern.</p>}
    </div>
  );
}
