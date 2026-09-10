import { useState } from 'react';
import { gbp } from '../lib/utils.js';
import { recoveryChanged } from '../lib/week-recovery.js';
import { Card, Pill } from './ui.jsx';
import UndoNotice from './UndoNotice.jsx';

const triggerLabels = {
  MealSkipped: 'A meal was skipped',
  IngredientWasted: 'An ingredient was binned',
  PantryCorrected: 'The pantry was corrected',
  LeftoverCreated: 'A leftover was saved',
  UnplannedShop: 'You bought off-plan',
  MealCooked: 'A meal was substituted',
  Check: 'The week changed',
};

export default function WeekRecoveryPreview({ recovery, onApply, onUndo, goTab }) {
  const [notice, setNotice] = useState('');
  const active = Boolean(recovery && recoveryChanged(recovery));

  const apply = () => {
    if (!recovery || !onApply) return;
    onApply(recovery);
    setNotice('Week repairs applied.');
  };

  const undo = () => {
    setNotice(onUndo?.() ? 'Week repairs undone.' : 'Nothing left to undo.');
  };

  if (!active && !notice) return null;

  return (
    <section className="px-5" aria-label="Week recovery">
      {active && (
        <Card style={{ borderColor: 'var(--accent)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              Week recovery
            </p>
            <Pill tone={recovery.disruption <= 1 ? 'good' : recovery.disruption === 2 ? 'warn' : 'danger'}>
              {recovery.repairs.length} repair{recovery.repairs.length === 1 ? '' : 's'}
            </Pill>
          </div>
          <p className="mt-2 text-[0.9375rem] font-extrabold">
            {triggerLabels[recovery.trigger?.kind] || 'The week changed'}
          </p>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {recovery.explanations[0]}
          </p>

          {recovery.repairs.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {recovery.repairs.slice(0, 3).map((repair) => (
                <li key={`${repair.kind}-${repair.date}-${repair.slot}`} className="text-[0.8125rem] font-semibold">
                  · {repair.recipeName || repair.name || repair.missingIngredient || repair.kind}
                  {repair.date ? ` — ${repair.date}` : ''}
                </li>
              ))}
            </ul>
          )}

          {(recovery.shoppingAdd.length > 0 || recovery.shoppingRemove.length > 0) && (
            <p className="mt-2 text-[0.75rem] font-bold" style={{ color: 'var(--faint)' }}>
              {recovery.shoppingAdd.length} item{recovery.shoppingAdd.length === 1 ? '' : 's'} to add · {recovery.shoppingRemove.length} to remove
            </p>
          )}

          {recovery.budgetNote?.over && (
            <p className="mt-2 text-[0.75rem] font-bold" style={{ color: 'var(--danger)' }}>
              Repairs would go over budget by {gbp(Math.abs(recovery.budgetNote.remaining), { always: true })}.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={apply}
              className="press rounded-2xl px-4 py-2.5 text-[0.8125rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Apply repairs
            </button>
            <button
              type="button"
              onClick={() => goTab('plan')}
              className="press rounded-2xl border px-4 py-2.5 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
            >
              Review plan
            </button>
          </div>
        </Card>
      )}
      {notice && (
        <div className="mt-2">
          <UndoNotice message={notice} onUndo={undo} />
        </div>
      )}
    </section>
  );
}
