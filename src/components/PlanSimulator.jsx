import { useMemo, useState } from 'react';
import { SlidersHorizontal, Sparkles, BookmarkPlus, Trash2 } from 'lucide-react';
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
    // Plans compete with what the week still has, not the whole budget —
    // derive's spentThisWeek is what the shops have already taken.
    budgetSpent: app.spentThisWeek,
    maxTimeMins: maxTime,
    strictEquipment,
    equipmentOwned: app.equipment || [],
    today: app.day,
  }), [candidates, app.pantry, app.equipment, app.day, budget, app.spentThisWeek, maxTime, strictEquipment]);
  const best = simulation.best;
  const saved = app.planSimulations || [];
  const saveCurrent = () => {
    if (!best) return;
    app.savePlanSimulation({
      label: `£${budget} · ${maxTime}m${strictEquipment ? ' · my kit' : ''}`,
      score: best.score,
      summary: simulation.summary,
      meals: best.meals.map((meal) => meal.name || meal.title),
      options: { weeklyBudget: budget, maxTimeMins: maxTime, strictEquipment },
    });
  };
  const restore = (simulation) => {
    const options = simulation?.options || {};
    if (Number.isFinite(Number(options.weeklyBudget))) setBudget(Number(options.weeklyBudget));
    if (Number.isFinite(Number(options.maxTimeMins))) setMaxTime(Number(options.maxTimeMins));
    if (typeof options.strictEquipment === 'boolean') setStrictEquipment(options.strictEquipment);
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <SlidersHorizontal size={17} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="break-words font-extrabold">Plan simulator</p>
          <p className="break-words text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
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
      {best && (
        <button
          className="press w-full rounded-2xl border px-3 py-2.5 text-[0.75rem] font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          onClick={saveCurrent}
        >
          <span className="inline-flex items-center gap-1.5"><BookmarkPlus size={13} /> Save this scenario</span>
        </button>
      )}
      {saved.length > 0 && (
        <ul className="space-y-1.5">
          {saved.slice().reverse().map((simulation) => (
            <li key={simulation.id} className="flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: 'var(--line)' }}>
              <button className="min-w-0 flex-1 text-left" onClick={() => restore(simulation)}>
                <span className="block truncate text-[0.75rem] font-extrabold">{simulation.label || 'Saved scenario'}</span>
                <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {simulation.score == null ? '' : `${simulation.score}/100 · `}{simulation.meals?.length || 0} meals
                </span>
              </button>
              <button
                className="press shrink-0 text-[0.6875rem] font-extrabold"
                style={{ color: 'var(--muted)' }}
                aria-label={`Delete saved scenario ${simulation.label || ''}`}
                onClick={() => app.deletePlanSimulation(simulation.id)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
