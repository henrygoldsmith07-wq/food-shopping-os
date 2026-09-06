import { useState } from 'react';
import { Check, ShoppingCart, X } from 'lucide-react';
import { Card } from './ui.jsx';

/**
 * The moment right after tonight's dinner is picked: if the dish needs
 * ingredients the pantry does not yet hold, offer to send just those to the
 * shopping list — one tap, while the meal is still the thing on the user's
 * mind. Nothing renders when the pantry already covers the dish, and adding
 * flips the card into its "done" state rather than nagging.
 */
export default function JustPlannedOffer({ meal = '', missing = 0, onAdd, onGo, onDismiss }) {
  const [added, setAdded] = useState(false);
  if (!missing) return null;
  return (
    <Card className="!p-3 mb-2.5" style={{ borderColor: 'var(--accent)' }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.8125rem] font-bold leading-snug">
          {added
            ? <span className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: 'var(--good)' }} /> Tonight's items are on your shopping list.</span>
            : <>Tonight's {meal} needs {missing} ingredient{missing === 1 ? '' : 's'} that {missing === 1 ? 'is' : 'are'} not in your pantry yet.</>}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss tonight's shopping offer"
          className="press shrink-0 rounded-lg p-1"
          style={{ color: 'var(--faint)' }}
        >
          <X size={14} />
        </button>
      </div>
      {added ? (
        <button
          type="button"
          onClick={onGo}
          className="press mt-2 w-full rounded-xl py-2.5 text-[0.8125rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Go to your list
        </button>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => { onAdd(); setAdded(true); }}
            className="press flex-1 rounded-xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <ShoppingCart size={14} /> Add {missing} to your shopping list
            </span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="press rounded-xl border px-3 py-2.5 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Not now
          </button>
        </div>
      )}
    </Card>
  );
}
