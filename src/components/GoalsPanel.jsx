import { useState } from 'react';
import { Calculator, Check, Info, Sliders, Target, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  ACTIVITY_LEVELS, BODY_GOALS, DIET_PATTERNS, SEXES,
} from '../data/goals.js';
import { defaultWeeklyKcal, macroBreakdown, macroMismatch, resolveMaintenance } from '../lib/goals.js';
import { formatAmount } from '../data/nutrients.js';
import { YOUTH_COPY, YOUTH_SIGNPOST } from '../lib/youth.js';
import { MAX_DEFICIT_PCT } from '../lib/target-safety.js';
import { Card, Chip, Meter, Pill, Section, Toggle } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';
import TargetSafetyCard from './TargetSafety.jsx';

const MACRO_COLOR = {
  protein: 'var(--series-1)',
  carbs: 'var(--series-3)',
  fat: 'var(--series-2)',
};

/** Where your maintenance figure comes from: your body, or your own estimate. */
function MaintenanceCard() {
  const app = useApp();
  const body = app.body || {};
  const computed = resolveMaintenance(app);
  const fromStats = !!(body.weightKg && body.heightCm && body.age);

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.9375rem]">Maintenance calories</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Everything else is worked out from this. Give your stats and Forq estimates it
          (Mifflin-St Jeor), or just type the number you already know.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Weight" value={body.weightKg ?? ''} onChange={(v) => app.setBody({ weightKg: Number(v) || null })} suffix="kg" step={0.5} />
        <NumberField label="Target weight" value={body.targetWeightKg ?? ''} onChange={(v) => app.setBody({ targetWeightKg: Number(v) || null })} suffix="kg" step={0.5} />
        <NumberField label="Height" value={body.heightCm ?? ''} onChange={(v) => app.setBody({ heightCm: Number(v) || null })} suffix="cm" step={1} />
        <NumberField label="Age" value={body.age ?? ''} onChange={(v) => app.setBody({ age: Number(v) || null })} suffix="yrs" step={1} />
        <div>
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Sex</span>
          <div className="mt-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {SEXES.map((s) => (
              <Chip key={s.id} active={body.sex === s.id} onClick={() => app.setBody({ sex: s.id })}>{s.label}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--faint)' }}>Activity</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {ACTIVITY_LEVELS.map((a) => (
            <Chip key={a.id} active={body.activity === a.id} onClick={() => app.setBody({ activity: a.id })}>{a.label}</Chip>
          ))}
        </div>
      </div>

      {fromStats ? (
        <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1.5">
          <Calculator size={14} style={{ color: 'var(--muted)' }} />
          Estimated maintenance: {computed?.toLocaleString()} kcal a day
        </p>
      ) : (
        <NumberField
          label="Or set it yourself"
          value={app.maintenanceKcal || ''}
          onChange={app.setMaintenance}
          suffix="kcal"
          step={50}
        />
      )}

      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Sex is here because Mifflin-St Jeor&rsquo;s constants differ by 166 kcal; &ldquo;Rather not
        say&rdquo; takes the midpoint rather than picking one for you.
      </p>

      {app.youth.on && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {YOUTH_COPY.targets}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        <div className="min-w-0">
          <p className="font-bold text-[0.875rem]">Track your cycle</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {app.trackCycle
              ? 'A page under Health for periods and symptoms'
              : 'Off — turning it on adds a page under Health'}
          </p>
        </div>
        <Toggle label="Track your cycle" on={app.trackCycle} onChange={() => app.setTrackCycle(!app.trackCycle)} />
      </div>
    </Card>
  );
}

/** The macro split, either derived from the goal or typed in by hand. */
function MacroCard() {
  const app = useApp();
  const rows = macroBreakdown(app.targets);
  const mismatch = macroMismatch(app.targets);
  const custom = app.targetMode === 'custom';
  // Nothing personal has been worked out, so the figures on screen are the
  // reference ones. Saying so is the difference between a placeholder and a
  // number somebody follows.
  const generic = !custom && !app.targetSafety.personalised;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-[0.9375rem]">Daily targets</p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {custom
              ? 'Yours — nothing recalculates them.'
              : generic
                ? 'General reference figures, not yours — Forq has not been given enough to work one out.'
                : 'Following your goal and patterns.'}
          </p>
        </div>
        <button
          onClick={() => app.setTargetMode(custom ? 'auto' : 'custom')}
          className="press shrink-0 rounded-2xl border px-3 py-2 text-[0.78125rem] font-extrabold"
          style={custom
            ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
            : { borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sliders size={13} /> {custom ? 'Custom' : 'Auto'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Calories" value={app.targets.kcal} onChange={(v) => app.setTarget('kcal', v)} suffix="kcal" step={50} />
        <NumberField label="Protein" value={app.targets.protein} onChange={(v) => app.setTarget('protein', v)} suffix="g" step={5} />
        <NumberField label="Carbs" value={app.targets.carbs} onChange={(v) => app.setTarget('carbs', v)} suffix="g" step={5} />
        <NumberField label="Fat" value={app.targets.fat} onChange={(v) => app.setTarget('fat', v)} suffix="g" step={5} />
      </div>

      {/* What the split actually comes to */}
      <div className="space-y-2 pt-1">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex justify-between text-[0.75rem] font-bold mb-1">
              <span className="capitalize">{r.key}</span>
              <span style={{ color: 'var(--muted)' }}>{r.pct}% · {r.kcal.toLocaleString()} kcal</span>
            </div>
            <Meter value={r.pct} max={100} color={MACRO_COLOR[r.key]} height={5} />
          </div>
        ))}
      </div>

      {Math.abs(mismatch) > 25 && (
        <p className="inline-flex items-start gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          Your macros add up to {(app.targets.kcal + mismatch).toLocaleString()} kcal —
          {mismatch > 0 ? ` ${mismatch} over` : ` ${-mismatch} under`} the calorie target.
        </p>
      )}
    </Card>
  );
}

/** Weekly energy budget — one big day doesn't have to sink the week. */
function WeeklyCard() {
  const app = useApp();
  const auto = defaultWeeklyKcal(app.targets.kcal);
  const week = app.week;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.9375rem]">Weekly target</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Judge the week rather than the day. Leave it at seven times your daily target,
          or set your own.
        </p>
      </div>

      <NumberField
        label="Calories per week"
        value={app.weeklyKcal || auto}
        onChange={app.setWeeklyKcal}
        suffix="kcal"
        step={100}
      />
      {app.weeklyKcal > 0 && (
        <button onClick={() => app.setWeeklyKcal(0)} className="press text-[0.75rem] font-bold" style={{ color: 'var(--accent)' }}>
          Back to 7 × daily ({auto.toLocaleString()} kcal)
        </button>
      )}

      <div>
        <div className="flex justify-between text-[0.75rem] font-bold mb-1">
          <span>{week.eaten.toLocaleString()} kcal so far</span>
          <span style={{ color: 'var(--muted)' }}>of {app.weeklyKcalTarget.toLocaleString()}</span>
        </div>
        <Meter value={week.eaten} max={app.weeklyKcalTarget} color={week.onTrack ? 'var(--accent)' : 'var(--warn)'} />
        <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {week.left >= 0
            ? `${week.left.toLocaleString()} kcal left · about ${week.perDayLeft.toLocaleString()} a day for the rest of the week`
            : `${Math.abs(week.left).toLocaleString()} kcal over — the coming days can pull it back`}
        </p>
      </div>
    </Card>
  );
}

/**
 * One place for what you're aiming at: the body goal, the way you want to eat,
 * where the numbers come from, and the daily and weekly targets they produce.
 */
export default function GoalsPanel() {
  const app = useApp();
  const [showWorking, setShowWorking] = useState(false);
  // Under 18 a stored deficit goal is not the goal in force — the panel shows
  // what the app is actually doing, which is maintenance.
  const goal = BODY_GOALS.find((g) => g.id === app.goal && app.youth.goals.includes(g.id))
    || BODY_GOALS.find((g) => g.id === 'maintain');

  return (
    <div className="px-5 pb-10 space-y-5">
      {/* Body goal */}
      <Section title="Your goal" className="!px-0">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mb-2.5">
          {BODY_GOALS.filter((g) => app.youth.goals.includes(g.id)).map((g) => (
            <Chip key={g.id} active={goal.id === g.id} onClick={() => app.setGoal(g.id)}>{g.label}</Chip>
          ))}
        </div>
        <Card className="!py-3">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{goal.blurb}</p>
          {app.youth.on && (
            <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {YOUTH_COPY.goals}
            </p>
          )}
          {!app.youth.on && app.targetSafety.appliedGoal !== app.targetSafety.goal && (
            <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--warn)' }}>
              Chosen, but not in force: Forq is planning at maintenance until the checks below
              are done.
            </p>
          )}
          <p className="mt-1.5 text-[0.75rem] font-bold">
            {Math.round((goal.kcalFactor - 1) * 100) === 0
              ? 'Energy: at maintenance'
              : `Energy: ${goal.kcalFactor > 1 ? '+' : ''}${Math.round((goal.kcalFactor - 1) * 100)}% of maintenance`}
            {' · '}protein {goal.proteinPerKg} g/kg
          </p>
        </Card>
      </Section>

      {/* Dietary patterns */}
      <Section title="How you eat" className="!px-0">
        <p className="-mt-1 mb-2.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Pick as many as apply. Macro patterns reshape your split; the rest filter recipes
          and flag foods that clash.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIET_PATTERNS.map((d) => (
            <Chip key={d.id} active={app.diets.includes(d.id)} onClick={() => app.toggleDiet(d.id)}>{d.label}</Chip>
          ))}
        </div>
        {app.diets.length > 0 && (
          <Card className="mt-3 !py-3 space-y-1.5">
            {app.diets.map((id) => {
              const d = DIET_PATTERNS.find((x) => x.id === id);
              return d ? (
                <p key={id} className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  <b style={{ color: 'var(--ink)' }}>{d.label}</b> — {d.blurb}
                </p>
              ) : null;
            })}
          </Card>
        )}
      </Section>

      <MaintenanceCard />
      <TargetSafetyCard />
      <MacroCard />
      {app.youth.weeklyCompensation ? <WeeklyCard /> : (
        <Card className="space-y-2">
          <p className="font-extrabold text-[0.9375rem]">No weekly calorie budget</p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {YOUTH_COPY.weekly}
          </p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {YOUTH_COPY.balance}
          </p>
        </Card>
      )}

      {/* Show the working */}
      <button
        onClick={() => setShowWorking((v) => !v)}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
        style={{ borderColor: 'var(--line)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <Info size={14} /> {showWorking ? 'Hide' : 'Show'} how these were worked out
        </span>
      </button>
      {showWorking && (
        <Card className="space-y-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          <p>
            <b style={{ color: 'var(--ink)' }}>1.</b> Maintenance
            {app.body?.weightKg && app.body?.heightCm && app.body?.age
              ? ' from Mifflin-St Jeor × your activity level'
              : ' as you set it'}: {(app.maintenanceKcalResolved || app.targets.kcal).toLocaleString()} kcal.
          </p>
          <p>
            <b style={{ color: 'var(--ink)' }}>2.</b> {goal.label} applies ×{goal.kcalFactor} →
            {' '}{app.targets.kcal.toLocaleString()} kcal a day.
          </p>
          <p>
            <b style={{ color: 'var(--ink)' }}>2a.</b> Then the safety checks: a deficit is held
            to {Math.round(MAX_DEFICIT_PCT * 100)}% of maintenance at most, the day is floored
            at {app.targetSafety.floor.kcal.toLocaleString()} kcal for your body, and anything
            unusual is said rather than absorbed.
          </p>
          <p>
            <b style={{ color: 'var(--ink)' }}>3.</b> Protein{app.body?.weightKg ? ` at ${goal.proteinPerKg} g per kg` : ` at ${Math.round(goal.proteinPct * 100)}% of energy`},
            fat takes {Math.round(goal.fatPct * 100)}%, carbohydrate fills what's left
            {app.diets.length ? ' — then your patterns cap or floor it.' : '.'}
          </p>
          <p>
            <b style={{ color: 'var(--ink)' }}>4.</b> Vitamins and minerals stay at UK reference
            intakes unless a pattern implies otherwise.
          </p>
          <p className="pt-1" style={{ color: 'var(--faint)' }}>
            Estimates, not medical advice — every number above is editable.
          </p>
        </Card>
      )}

      {app.youth.on && (
        <Card className="!py-3">
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_SIGNPOST}</p>
        </Card>
      )}

      <p className="text-center">
        <Pill tone="muted"><Target size={11} /> {app.goalSummary}</Pill>
      </p>
      <p className="text-center text-[0.75rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Today: {formatAmount('kcal', app.totals.kcal)} of {formatAmount('kcal', app.targets.kcal)}
        {app.targetMode === 'custom' && ' · custom targets'}
      </p>
      {app.targetMode === 'custom' && (
        <button
          onClick={() => app.resetTargets()}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Check size={14} /> Recalculate from my goal</span>
        </button>
      )}
    </div>
  );
}
