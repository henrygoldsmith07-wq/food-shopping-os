import { GitMerge } from 'lucide-react';
import { Card, Section } from './ui.jsx';
import { Glyph } from './icons.jsx';

const memberName = (app, id) => {
  const member = app.members.find((m) => m.id === id);
  return member?.name || 'Someone';
};

const whoPhrase = (app, row) => (row.checkedBy && row.checkedBy !== app.activeMemberId
  ? memberName(app, row.checkedBy)
  : 'You');

/** One side's copy, said the way a person would. */
const describeSide = (app, row) => {
  if (!row) return 'not on this copy';
  const qty = row.qty ? ` · ${row.qty}` : '';
  if (row.checked) return `${whoPhrase(app, row)} ticked${qty}`;
  return `${row.name}${qty}`;
};

const difference = (mine, theirs) => {
  if (Boolean(mine.checked) !== Boolean(theirs.checked)) {
    return mine.checked ? 'ticked on one device, unticked on the other' : 'unticked on one device, ticked on the other';
  }
  if (mine.qty !== theirs.qty) return 'quantity differs between devices';
  if (mine.name !== theirs.name) return 'renamed differently on each device';
  return 'changed on both devices';
};

/**
 * A shared list that split: two devices changed the same row differently
 * while apart, and no merge could honestly pick one. Each conflict holds the
 * two copies — who ticked what, whose quantity — and the household decides
 * with a tap. The loser is never silently discarded; it stays visible until
 * someone picks.
 */
export default function ListConflictCard({ app }) {
  const conflicts = (app.listConflicts || []).filter((conflict) => conflict.status !== 'resolved');
  if (!conflicts.length || !app.householdAccess.shopping) return null;

  return (
    <Section title={`List conflicts · ${conflicts.length}`} className="!px-0">
      <Card className="space-y-3">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Two devices changed these while apart. Keep the copy that is right; the other is discarded.
        </p>
        {conflicts.slice(0, 8).map((conflict) => (
          <div key={conflict.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--line)' }}>
            <p className="font-bold text-[0.8125rem] inline-flex items-center gap-1.5">
              <GitMerge size={13} style={{ color: 'var(--warn)' }} />
              {conflict.name}
            </p>
            <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {difference(conflict.mine || {}, conflict.theirs || {})}
            </p>
            <div className="mt-1.5 space-y-1">
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                <Glyph e={conflict.mine?.emoji} size={13} /> This device — {describeSide(app, conflict.mine)}
              </p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                <Glyph e={conflict.theirs?.emoji} size={13} /> Household — {describeSide(app, conflict.theirs)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => app.resolveListConflict(conflict.id, 'mine')}
                className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Keep this device's
              </button>
              <button
                onClick={() => app.resolveListConflict(conflict.id, 'theirs')}
                className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                Keep household's
              </button>
            </div>
          </div>
        ))}
      </Card>
    </Section>
  );
}
