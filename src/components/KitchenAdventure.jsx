import { useMemo } from 'react';
import { Check, Flame, Sparkles, Trophy } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { adventureSummary } from '../lib/adventure.js';
import { Card, Meter, Pill } from './ui.jsx';

export default function KitchenAdventure() {
  const app = useApp();
  const summary = useMemo(() => adventureSummary(app), [app]);
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Trophy size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 flex-auto font-extrabold">Kitchen adventure</p><Pill tone="accent"><Flame size={11} /> {summary.completed}/{summary.total}</Pill></div>
          <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Complete real kitchen actions to earn bonus XP this week.</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {summary.missions.map((mission) => (
          <div key={mission.id} className="rounded-2xl border p-3" style={{ borderColor: mission.complete ? 'var(--good)' : 'var(--line)' }}>
            <div className="flex items-center gap-2"><p className="min-w-0 flex-1 text-[0.8125rem] font-extrabold">{mission.complete ? <Check size={14} className="mr-1 inline" style={{ color: 'var(--good)' }} /> : null}{mission.label}</p><span className="text-[0.6875rem] font-black" style={{ color: 'var(--accent)' }}>+{mission.xp} XP</span></div>
            <p className="mt-0.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{mission.detail}</p>
            <div className="mt-2 flex items-center gap-2"><Meter value={mission.progress} max={mission.target} height={4} /><span className="shrink-0 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>{mission.progress}/{mission.target}</span></div>
            {mission.complete && !mission.claimed && <button onClick={() => app.claimAdventureMission(mission.id)} className="press mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.71875rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}><Sparkles size={12} /> Claim reward</button>}
            {mission.claimed && <p className="mt-2 text-[0.6875rem] font-bold" style={{ color: 'var(--good)' }}>Reward claimed</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
