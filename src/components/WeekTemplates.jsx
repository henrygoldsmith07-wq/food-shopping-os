import { useState } from 'react';
import { BookmarkPlus, CalendarClock, Check, Pencil, Trash2, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { byId } from '../data/recipes.js';
import { applyWeekTemplate, summariseWeekTemplate } from '../lib/week-templates.js';
import { Card } from './ui.jsx';

/**
 * Named week templates — save a good week, replay it on any later one.
 *
 * Last-week repeat covers the common case; this covers the *best* case: the
 * cheap term-time week, the batch-cook week, the one the kids actually ate.
 * Saving snapshots the visible week as weekday slots, applying fills only
 * empty slots (locked meals and decided slots are never touched), and
 * recipe ids that no longer resolve — a deleted My recipe — are reported,
 * never written as ghosts.
 */
export default function WeekTemplates({ dates = [] }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }
  const templates = app.weekTemplates || [];

  const save = () => {
    const result = app.saveWeekTemplate({ name, dates });
    setStatus(result?.ok
      ? `Saved “${result.template.name}” — ${summariseWeekTemplate(result.template)}.`
      : (result?.error || 'Could not save the template.'));
    if (result?.ok) setName('');
  };

  const apply = (template) => {
    const { entries } = applyWeekTemplate(app.plan, template, dates);
    const locked = app.lockedMeals || {};
    // Known recipes only, unlocked slots only: the count below is what
    // applyPlanEntries will actually write, so the status line stays honest.
    const known = entries.filter((e) => byId(e.recipeId));
    const writable = known.filter((e) => !(`${e.date}|${e.slot}` in locked));
    const skippedGone = entries.length - known.length;
    const skippedDecided = known.length - writable.length;
    if (writable.length) app.applyPlanEntries(writable);
    const moved = writable.length;
    const bits = [];
    if (moved) bits.push(`laid ${moved} meal${moved === 1 ? '' : 's'} onto this week`);
    else bits.push('nothing to lay — this week already holds those slots');
    if (skippedDecided) bits.push(`${skippedDecided} decided slot${skippedDecided === 1 ? '' : 's'} kept`);
    if (skippedGone) bits.push(`${skippedGone} recipe${skippedGone === 1 ? '' : 's'} no longer in your book skipped`);
    setStatus(`“${template.name}”: ${bits.join(' · ')}. Change or clear anything you don't want again.`);
  };

  const remove = (template) => {
    app.deleteWeekTemplate(template.id);
    if (renaming?.id === template.id) setRenaming(null);
    setStatus(`Deleted “${template.name}”. Undo brings it back.`);
  };

  const commitRename = () => {
    if (!renaming) return;
    const result = app.renameWeekTemplate({ id: renaming.id, name: renaming.name });
    setStatus(result?.ok ? 'Template renamed.' : (result?.error || 'Could not rename the template.'));
    if (result?.ok) setRenaming(null);
  };

  return (
    <Card className="!p-3.5 space-y-3">
      <div>
        <p className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5">
          <CalendarClock size={14} style={{ color: 'var(--accent)' }} /> Week templates
        </p>
        <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Save a week that worked, then replay it any time. Applying never replaces a meal already decided.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Name this week's plan…"
          aria-label="Template name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
          style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
        />
        <button
          onClick={save}
          disabled={!name.trim()}
          className="press shrink-0 rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><BookmarkPlus size={14} /> Save week</span>
        </button>
      </div>

      {templates.length > 0 && (
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {templates.map((template) => (
            <li key={template.id} className="py-2.5">
              {renaming?.id === template.id ? (
                <div className="flex gap-2">
                  <input
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: template.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    aria-label="New template name"
                    maxLength={40}
                    autoFocus
                    className="min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-[0.8125rem] font-semibold outline-none"
                    style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                  />
                  <button onClick={commitRename} aria-label="Save name" className="press p-1.5" style={{ color: 'var(--good)' }}>
                    <Check size={15} strokeWidth={3} />
                  </button>
                  <button onClick={() => setRenaming(null)} aria-label="Cancel rename" className="press p-1.5" style={{ color: 'var(--muted)' }}>
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[0.8125rem] truncate">{template.name}</p>
                    <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {summariseWeekTemplate(template)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => apply(template)}
                      className="press rounded-xl px-3 py-1.5 text-[0.78125rem] font-extrabold"
                      style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => { setRenaming({ id: template.id, name: template.name }); setStatus(''); }}
                      aria-label={`Rename ${template.name}`}
                      className="press p-1.5"
                      style={{ color: 'var(--muted)' }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => remove(template)}
                      aria-label={`Delete ${template.name}`}
                      className="press p-1.5"
                      style={{ color: 'var(--muted)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {status && (
        <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{status}</p>
      )}
    </Card>
  );
}
