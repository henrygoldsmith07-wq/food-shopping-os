import { useMemo, useState } from 'react';
import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { Card, Chip, Pill } from './ui.jsx';
import { useApp } from '../lib/store.jsx';
import { simulatePlan } from '../lib/plan-simulator.js';

const asCandidates = (recipes) => {
  const pool = recipes || [];
  const candidates = [];
  for (let i = 0; i < Math.min(pool.length, 36); i += 6) {
    const meals = pool.slice(i, i + 6);
    if (meals.length) candidates.push(meals);
  }
  return candidates;
};

export default function PlanSimulator() {
  const app = useApp();
  const [budget, setBudget] = useState(Number(app.weeklyBudget) || 40);
  const [maxTime, setMaxTime] = useState(45);
  const [strictEquipment, setStrictEquipment] = useState(Boolean((app.equipment || []).length));
  const [showAll, setShowAll] = useState(false);
  const candidates = useMemo(() => asCandidates(app.safeRecipes), [app.safeRecipes]);
  const simulation = useMemo(() => simulatePlan(candidates, {
    pantryItems: app.pantry,
    weeklyBudget: budget,
    maxTimeMins: maxTime,
    strictEquipment,
    equipmentOwned: app.equipment || [],
    today: app.day,
  }), [candidates, app.pantry, app.equipment, app.day, budget, maxTime, strictEquipment]);
  const best = simulation.best;

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-2">
        <SlidersHorizontal size={17} style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">Plan simulator</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Stress-test the week before you commit it. Every score is explainable.
          </p>
        </div>
        {best && <Pill tone={best.score >= 75 ? 'good' : 'accent'}>{best.score}/100</Pill>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[0.75rem] font-bold">
          Weekly budget £{budget}
          <input aria-label="Simulation weekly budget" className="w-full" type="range" min="5" max="200" step="5" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
        <label className="text-[0.75rem] font-bold">
          Max cooking time {maxTime}m
          <input aria-label="Simulation cooking time" className="w-full" type="range" min="10" max="120" step="5" value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[0.78125rem] font-bold">Only use equipment I have</p>
        <Chip active={strictEquipment} onClick={() => setStrictEquipment((value) => !value)}>{strictEquipment ? 'On' : 'Off'}</Chip>
      </div>
      {best ? (
        <>
          <div className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
            <p className="text-[0.8125rem] font-extrabold">Best scenario: {best.meals.slice(0, 3).map((meal) => meal.name || meal.title).join(' · ')}</p>
            <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{simulation.summary}</p>
          </div>
          <button className="press text-left text-[0.75rem] font-extrabold" style={{ color: 'var(--accent)' }} onClick={() => setShowAll((value) => !value)}>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> {showAll ? 'Hide trade-offs' : 'Show trade-offs'}</span>
          </button>
          {showAll && <ul className="space-y-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{simulation.tradeoffs.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}
        </>
      ) : <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Add recipes to simulate a plan.</p>}
    </Card>
  );
}
