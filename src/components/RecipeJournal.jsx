import { useMemo, useState } from 'react';
import { History, NotebookPen } from 'lucide-react';
import { RECIPE_NOTE_MAX, cookHistory, cookedLabel } from '../lib/recipe-journal.js';

/**
 * The recipe's own record in this kitchen: how often it has been cooked and
 * when last (from cook mode, never from the plan), and a note the cook keeps
 * on it. Everyone can read the note; only a member with recipe access edits.
 */
export default function RecipeJournal({ app, recipeId }) {
  const history = useMemo(() => cookHistory(app.cooked, recipeId, app.day), [app.cooked, recipeId, app.day]);
  const note = app.recipeNotes?.[recipeId] || '';
  const canEdit = Boolean(app.householdAccess?.recipes) && typeof app.setRecipeNote === 'function';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [status, setStatus] = useState('');

  const start = () => { setDraft(note); setEditing(true); setStatus(''); };
  const save = () => {
    app.setRecipeNote(recipeId, draft);
    setEditing(false);
    setStatus(draft.trim() ? 'Note saved.' : 'Note removed.');
  };

  if (!history && !note && !canEdit) return null;
  const muted = { color: 'var(--muted)' };
  return (
    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--line)' }}>
      <p className="inline-flex items-center gap-1.5 text-[0.78125rem] font-bold" style={history ? undefined : muted}>
        <History size={13} aria-hidden="true" />
        {cookedLabel(history) || 'Not cooked yet — cook mode records it when you do.'}
      </p>
      {editing ? (
        <div className="space-y-2">
          <label htmlFor={`recipe-note-${recipeId}`} className="block text-[0.75rem] font-extrabold">Your note</label>
          <textarea
            id={`recipe-note-${recipeId}`}
            value={draft}
            maxLength={RECIPE_NOTE_MAX}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Less chilli next time · doubles well · kids loved it"
            className="w-full rounded-xl border px-3 py-2 text-[0.8125rem]"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="press min-h-[44px] rounded-xl px-3 text-[0.75rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              Save note
            </button>
            <button type="button" onClick={() => setEditing(false)} className="press min-h-[44px] rounded-xl border px-3 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          {note
            ? <p className="text-[0.8125rem] font-semibold whitespace-pre-line"><span className="sr-only">Your note: </span>{note}</p>
            : <span />}
          {canEdit && (
            <button type="button" onClick={start} className="press inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }}>
              <NotebookPen size={13} aria-hidden="true" /> {note ? 'Edit note' : 'Add a note'}
            </button>
          )}
        </div>
      )}
      <p className="sr-only" role="status">{status}</p>
    </div>
  );
}
