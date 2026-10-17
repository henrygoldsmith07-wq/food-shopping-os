import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { parseShareCode } from '../lib/recipe-tools.js';
import { Card } from './ui.jsx';

/** Paste in a recipe someone sent you. */
export default function SharedImport({ onDone }) {
  const app = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const read = () => {
    const { recipe, error: err } = parseShareCode(code);
    setError(err);
    setPreview(recipe);
  };

  return (
    <div className="px-5 pb-10 space-y-3">
      <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Forq has no feed of strangers’ dinners. A recipe travels as a code someone sends you —
        paste it here and it becomes yours, credited to whoever shared it.
      </p>
      <textarea
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null); setPreview(null); }}
        rows={4}
        placeholder="FORQ1:…"
        aria-label="Recipe code"
        className="w-full rounded-2xl border p-3 text-[0.75rem] font-mono outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <button
        onClick={read}
        disabled={!code.trim()}
        className="press w-full rounded-2xl border py-3 text-[0.875rem] font-extrabold disabled:opacity-50"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      >
        Read the code
      </button>
      {error && <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
      {preview && (
        <Card className="space-y-2">
          <p className="font-extrabold text-[0.9375rem]">{preview.name}</p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {preview.sharedBy ? `From ${preview.sharedBy} · ` : ''}{preview.ingredients.length} ingredients · {preview.steps.length} steps · {preview.time} min
          </p>
          {(() => {
            const fit = app.suitabilityFor?.(preview);
            if (!fit) return null;
            if (!fit.allowed) {
              return (
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--danger)' }}>
                  Blocked by your rules: {fit.blockers.map((b) => b.label).join(', ')}.
                </p>
              );
            }
            if (fit.warnings.length) {
              return (
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--warn)' }}>
                  Note: {fit.warnings.map((w) => w.label).join(', ')}.
                </p>
              );
            }
            return null;
          })()}
          <button
            onClick={() => { app.saveRecipe(preview); onDone(); }}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Add to my recipes
          </button>
        </Card>
      )}
    </div>
  );
}
