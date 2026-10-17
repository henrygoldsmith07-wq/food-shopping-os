import { Check, Minus, Trash2, TriangleAlert } from 'lucide-react';
import { cx, gbp, expiryStatus } from '../lib/utils.js';
import {
  daysUntil, freshnessOf, pantryConfidenceLevel, pantryUncertaintyLabel, pantryUseLabel,
} from '../lib/kitchen.js';
import { quantityRangeLabel } from '../lib/pantry-intelligence.js';
import { Card, GestureMenu, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

/**
 * One row of the pantry list: glyph, name, quantity, freshness, confidence and
 * the four quick actions (use / confirm / low / remove).
 *
 * Extracted from PantryView so that file stays under the 500-line invariant
 * enforced by tests/invariants.test.js. Every prop the row needs is passed in
 * rather than reaching back into the parent, and the row reads `app` only for
 * the actions it calls — so moving it changed no behaviour.
 */
export default function PantryRow({ item: p, app, onRemove, onCorrect }) {
  const days = p.expiry ? daysUntil(p.expiry, app.day) : null;
  const st = days === null ? null : expiryStatus(days);
  const useLabel = pantryUseLabel(p);
  const fresh = freshnessOf(p, app.day);
  const confidence = pantryConfidenceLevel(p, app.day);

  const menuActions = [
    { label: p.low ? 'Mark stocked' : 'Mark running low', onClick: () => app.togglePantryLow(p.id) },
    { label: useLabel, onClick: () => app.usePantryItem(p.id) },
    { label: 'Correct this…', onClick: () => onCorrect(p) },
    { label: p.openedDate ? 'Opened — reset opened date' : 'Mark opened today', onClick: () => app.updatePantryItem(p.id, { openedDate: p.openedDate ? null : app.day }) },
    { label: 'Add to shopping list', onClick: () => app.addToList({ name: p.name, emoji: p.emoji, qty: p.qty }) },
    { label: 'Remove', tone: 'danger', onClick: () => onRemove(p.id) },
  ];
  if (confidence.requiresConfirmation && confidence.recommendationImpact) {
    menuActions.unshift({ label: 'Confirm stock', onClick: () => app.confirmPantryItem(p.id) });
  }
  if (p.location === 'Freezer') {
    menuActions.splice(3, 0, { label: 'Move to fridge (thaw)', onClick: () => app.updatePantryItem(p.id, { location: 'Fridge' }) });
  } else if (p.cat !== 'Leftovers') {
    menuActions.splice(3, 0, { label: 'Move to freezer', onClick: () => app.updatePantryItem(p.id, { location: 'Freezer' }) });
  }

  return (
    <GestureMenu
      key={p.id}
      label={p.name}
      actions={menuActions}
      onSwipeLeft={() => onRemove(p.id)}
      onSwipeRight={() => app.togglePantryLow(p.id)}
    >
      <div className="flex items-center gap-3 p-3" style={{ borderColor: 'var(--line)' }}>
        <Glyph e={p.emoji} name={p.name} size={22} style={{ color: 'var(--muted)' }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[0.875rem] truncate">{p.name}</p>
          {/* "Opened" is worth saying; "Unopened" is not. Every item starts
              unopened, so printing it put the same dead word on every row and
              pushed the location and shop out of a line that truncates. */}
          <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
            {[quantityRangeLabel(p), p.opened ? 'Opened' : null, p.location, p.store].filter(Boolean).join(' · ') || p.cat}
          </p>
          {fresh.kind !== 'unknown' && (
            <p className="text-[0.65625rem] font-semibold" style={{ color: 'var(--muted)' }}>{fresh.label}</p>
          )}
          <p className="text-[0.65625rem] font-bold" style={{ color: confidence.requiresConfirmation ? 'var(--warn)' : 'var(--faint)' }}>
            {pantryUncertaintyLabel(p, app.day)}
          </p>
        </div>
        <div className="text-right shrink-0">
          {p.cost > 0 && <p className="font-bold text-[0.8125rem]">{gbp(p.cost, { always: true })}</p>}
          {st && <Pill tone={st.tone}>{st.label}</Pill>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => app.usePantryItem(p.id)} aria-label={`${useLabel} ${p.name}`} title={useLabel} className="press p-1" style={{ color: 'var(--muted)' }}><Minus size={15} /></button>
          {confidence.requiresConfirmation && confidence.recommendationImpact && (
            <button
              onClick={() => app.confirmPantryItem(p.id)}
              aria-label={`Confirm ${p.name}`}
              title="Confirm stock"
              className="press p-1"
              style={{ color: 'var(--accent)' }}
            >
              <Check size={15} />
            </button>
          )}
          <button
            onClick={() => app.togglePantryLow(p.id)}
            aria-label={`Mark ${p.name} ${p.low ? 'stocked' : 'running low'}`}
            className="press p-1"
            style={{ color: p.low ? 'var(--warn)' : 'var(--faint)' }}
          >
            {p.low ? <TriangleAlert size={15} /> : <Check size={15} />}
          </button>
          <button
            onClick={() => onRemove(p.id)}
            aria-label={`Remove ${p.name}`}
            className="press p-1"
            style={{ color: 'var(--faint)' }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </GestureMenu>
  );
}
