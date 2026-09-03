import { useEffect, useRef, useState } from 'react';
import { PackagePlus, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Card } from './ui.jsx';

/**
 * Bulk actions for the ticked items on the shopping list.
 *
 * Marking several things bought is the natural gesture mid-shop; what was
 * missing was acting on all of them at once — sending them to the pantry, or
 * clearing a mis-tick — without poking rows one by one. Every action here is
 * one atomic store snapshot, so the undo button always reverses the whole
 * operation, never half of it.
 *
 * The bar lingers after an action even when nothing is ticked anymore: the
 * moment the rows vanish is exactly when the undo offer is needed, and
 * disappearing with them would strand the user mid-recovery. It expires on
 * its own rather than nagging.
 */
export default function BulkListActions({ ticked }) {
  const app = useApp();
  const [notice, setNotice] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const act = (label, run) => {
    clearTimeout(timer.current);
    run();
    setNotice(label);
    timer.current = setTimeout(() => setNotice(''), 6000);
  };

  const undo = () => {
    clearTimeout(timer.current);
    setNotice(app.undoLast() ? 'Undone.' : 'Nothing left to undo.');
  };

  if (!ticked && !notice) return null;

  return (
    <Card className="!p-3 space-y-2" style={{ borderColor: 'var(--accent)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.78125rem] font-extrabold">{ticked ? `${ticked} ticked` : 'All ticked items handled.'}</p>
        <button
          onClick={undo}
          className="press inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[0.75rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <Undo2 size={12} /> Undo
        </button>
      </div>
      {ticked > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => act('Moved to pantry.', () => app.moveCheckedToPantry('Cupboard'))}
            className="press flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <PackagePlus size={14} /> To pantry
          </button>
          <button
            onClick={() => act('Removed from list.', () =>
              app.removeListItems(app.shoppingList.filter((item) => item.checked).map((item) => item.id)))}
            className="press flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--danger, var(--warn))' }}
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>
      )}
      {notice && <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{notice}</p>}
    </Card>
  );
}