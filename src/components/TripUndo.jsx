import { Undo2 } from 'lucide-react';
import { lastTicked, undoLabel } from '../lib/trip-undo.js';

/** One-tap undo for the last item ticked while shopping. */
export default function TripUndo({ list, onUndo, now = Date.now() }) {
  const row = lastTicked(list, now);
  if (!row) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
      <p className="min-w-0 truncate text-[0.8125rem] font-bold">{undoLabel(row)}</p>
      <button type="button" onClick={() => onUndo(row.id)} className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[0.75rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
        <Undo2 size={14} /> Undo
      </button>
    </div>
  );
}
