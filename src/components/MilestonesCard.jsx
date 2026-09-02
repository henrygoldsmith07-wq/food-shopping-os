import { Milestone } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { firstSessionMilestones, milestonesComplete } from '../lib/milestones.js';
import { Card } from './ui.jsx';

/**
 * The first-session card: the four smallest moves that make the app yours.
 *
 * Rendered only while at least one milestone is still open — it disappears
 * the moment the household has done all four, and it counts nothing that
 * wasn't really done.
 */
export default function MilestonesCard() {
  const app = useApp();
  const milestones = firstSessionMilestones(app);
  if (milestonesComplete(milestones)) return null;

  const done = milestones.filter((m) => m.done).length;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.9375rem] font-extrabold inline-flex items-center gap-2">
          <Milestone size={16} style={{ color: 'var(--accent)' }} /> Getting started
        </p>
        <span className="text-[0.75rem] font-bold" style={{ color: 'var(--muted)' }}>{done} of {milestones.length}</span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {milestones.map((milestone) => (
          <p
            key={milestone.id}
            className="text-[0.8125rem] font-bold flex items-center gap-2"
            style={{ color: milestone.done ? 'var(--good)' : 'var(--ink)' }}
          >
            <span
              className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border text-[0.5625rem]"
              style={milestone.done
                ? { background: 'var(--good)', borderColor: 'var(--good)', color: 'var(--card)' }
                : { borderColor: 'var(--line)', color: 'transparent' }}
            >✓</span>
            {milestone.label}
          </p>
        ))}
      </div>
    </Card>
  );
}
