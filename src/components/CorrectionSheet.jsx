import { useState } from 'react';
import { Check, PenLine } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { applyCorrection } from '../lib/corrections.js';
import { Sheet } from './ui.jsx';

/**
 * Contextual corrections — the shortest path from "that's wrong" to a fixed
 * model. One row, one sheet, one tap. Each correction says what Forq will
 * remember, and only says it when the correction actually persisted (the
 * catalogue's `apply` reports back, so no claim is ever made about a write
 * that did not happen).
 */
export default function CorrectionSheet({ open, onClose, title, corrections, context = {} }) {
  const app = useApp();
  const [pending, setPending] = useState(null);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');

  const run = (correction) => {
    if (correction.needsValue) {
      setPending(correction);
      setValue('');
      setStatus('');
      return;
    }
    const { changed, remembers } = applyCorrection(correction, { ...context, app });
    setStatus(changed ? remembers : 'That correction could not be saved.');
  };

  const runPending = () => {
    const { changed, remembers } = applyCorrection(pending, { ...context, app, value });
    if (changed) {
      setPending(null);
      setValue('');
    }
    setStatus(changed ? remembers : 'That correction could not be saved.');
  };

  return (
    <Sheet open={open} onClose={onClose} title={title || 'Correct this'}>
      <div className="px-5 pb-8 pt-1">
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Every correction teaches Forq directly. Nothing here is a bug report.
        </p>
        <div className="mt-3 space-y-2">
          {corrections.map((correction) => (
            <button
              key={correction.id}
              type="button"
              onClick={() => run(correction)}
              className="press flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left"
              style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            >
              <span className="text-[0.84375rem] font-extrabold">{correction.label}</span>
              {correction.needsValue ? (
                <PenLine size={15} style={{ color: 'var(--faint)' }} />
              ) : (
                <Check size={15} style={{ color: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </div>

        {pending && (
          <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
            <p className="text-[0.8125rem] font-extrabold">{pending.label}</p>
            <div className="mt-2 flex gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runPending()}
                placeholder={pending.kind === 'expiry' ? 'YYYY-MM-DD' : pending.kind === 'price' ? '£' : 'Amount'}
                aria-label={pending.label}
                className="flex-1 rounded-xl border px-3 py-2 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
                autoFocus
              />
              <button
                type="button"
                onClick={runPending}
                className="press rounded-xl px-4 py-2 text-[0.8125rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {status && (
          <p role="status" className="mt-3 text-[0.78125rem] font-semibold" style={{ color: 'var(--accent)' }}>
            {status}
          </p>
        )}
      </div>
    </Sheet>
  );
}
