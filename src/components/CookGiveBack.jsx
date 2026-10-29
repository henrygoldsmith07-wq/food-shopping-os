'use client';

import { canGiveBack, usedAmountLabel } from '../lib/cook-giveback.js';

/**
 * What the cook took from the pantry, one line each, with a one-tap
 * "Didn't use" so the shelf stays true when the recipe and the kitchen differ.
 */
export default function CookGiveBack({ event, onGiveBack }) {
  const used = event?.used || [];
  if (!event?.enabled || !used.length) return null;
  return (
    <div className="mt-3" data-testid="cook-giveback">
      <p className="text-[0.71875rem] font-bold" style={{ color: 'var(--faint)' }}>Took from your pantry</p>
      <ul className="mt-1 space-y-1">
        {used.map((row, index) => (
          <li key={`${row.id}-${index}`} className="flex items-center justify-between gap-2 text-[0.78125rem] font-semibold">
            <span style={{ color: row.givenBack ? 'var(--faint)' : 'var(--ink)' }}>
              {row.name} · {row.givenBack ? 'put back' : usedAmountLabel(row)}
            </span>
            {canGiveBack(row) && (
              <button
                type="button"
                onClick={() => onGiveBack(event.id, index)}
                className="press rounded-lg px-2.5 py-1 text-[0.71875rem] font-extrabold"
                style={{ background: 'var(--surface-2, var(--line))', color: 'var(--ink)', minHeight: 32 }}
                aria-label={`Didn’t use ${row.name}, put it back in the pantry`}
              >
                Didn’t use it
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
