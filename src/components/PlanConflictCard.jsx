import { GitMerge } from 'lucide-react';
import { Card, Section } from './ui.jsx';
import { byId } from '../data/recipes.js';

const recipeName = (recipeId) => (recipeId ? (byId(recipeId)?.name || 'a meal') : 'nothing planned');

/**
 * A plan that split: two devices changed the same day's slot differently
 * while apart, and no merge could honestly pick one. Each conflict holds the
 * two copies — what this device planned, what the household planned — and
 * the household decides with a tap. The loser is never silently discarded;
 * it stays visible until someone picks.
 */
export default function PlanConflictCard({ app }) {
  const conflicts = (app.planConflicts || []).filter((conflict) => conflict.status !== 'resolved');
  if (!conflicts.length) return null;

  return (
    <Section title={`Plan conflicts · ${conflicts.length}`} className="!px-0">
      <Card className="space-y-3">
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Two devices planned these slots differently. Keep the meal that is right; the other is discarded.
        </p>
        {conflicts.slice(0, 8).map((conflict) => (
          <div key={conflict.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--line)' }}>
            <p className="font-bold text-[0.8125rem] inline-flex items-center gap-1.5">
              <GitMerge size={13} style={{ color: 'var(--warn)' }} />
              {conflict.date} · {conflict.slot}
            </p>
            <div className="mt-1.5 space-y-1">
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                This device — {recipeName(conflict.mine?.recipeId)}
              </p>
              <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Household — {recipeName(conflict.theirs?.recipeId)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => app.resolvePlanConflict(conflict.id, 'mine')}
                className="press rounded-xl border px-2.5 py-1.5 text-[0.6875rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Keep this device's
              </button>
              <button
                onClick={() => app.resolvePlanConflict(conflict.id, 'theirs')}
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
