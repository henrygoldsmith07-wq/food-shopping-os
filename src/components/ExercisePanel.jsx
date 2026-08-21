import { useState } from 'react';
import { Check, Dumbbell, Import, Info, Trash2, Upload } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { prettyDate } from '../lib/utils.js';
import { EXTRA_FIELDS, HEALTH_SOURCES, INTENSITIES, WORKOUT_TYPES, workoutBy } from '../data/workouts.js';
import { activeStreak, burnFor, parseWorkoutCsv } from '../lib/exercise.js';
import { Card, Chip, Meter, Pill, Toggle } from './ui.jsx';
import { Glyph } from './icons.jsx';
import { NumberField } from './FoodDetail.jsx';

const SAMPLE = `date,type,minutes,distance,calories
2026-07-27,Running,32,5.2,340
2026-07-26,Strength training,45,,
2026-07-25,Cycling,60,22.4,520`;

/* ---------- Log one ---------- */

function LogWorkout() {
  const app = useApp();
  const [type, setType] = useState('walking');
  const [intensity, setIntensity] = useState('moderate');
  const [minutes, setMinutes] = useState('30');
  const [extras, setExtras] = useState({});
  const [saved, setSaved] = useState(false);

  const weight = app.body?.weightKg || null;
  const estimate = burnFor({ type, minutes: Number(minutes), intensity }, weight);
  const fields = workoutBy[type]?.fields || [];

  const save = () => {
    app.logWorkout({ type, intensity, minutes: Number(minutes), ...extras });
    setSaved(true);
    setExtras({});
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Card className="space-y-3">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What did you do?</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {WORKOUT_TYPES.map((t) => (
          <Chip key={t.key} active={type === t.key} onClick={() => { setType(t.key); setExtras({}); }}>
            <span className="inline-flex items-center gap-1.5"><Glyph e={t.emoji} size={12} /> {t.label}</span>
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <NumberField label="Minutes" value={minutes} onChange={setMinutes} suffix="min" step={5} />
        {fields.map((key) => (
          <NumberField
            key={key}
            label={EXTRA_FIELDS[key].label}
            value={extras[key] ?? ''}
            onChange={(v) => setExtras((prev) => ({ ...prev, [key]: v }))}
            suffix={EXTRA_FIELDS[key].unit}
            step={EXTRA_FIELDS[key].step}
          />
        ))}
      </div>

      <div className="flex gap-2">
        {INTENSITIES.map((i) => (
          <Chip key={i.key} active={intensity === i.key} onClick={() => setIntensity(i.key)}>{i.label}</Chip>
        ))}
      </div>
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {INTENSITIES.find((i) => i.key === intensity).blurb}.
      </p>

      <div className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
        {estimate ? (
          <>
            <p className="text-[1rem] font-extrabold">≈ {estimate} kcal</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Estimated from the standard MET equation and your weight of {weight} kg. Estimates
              run high — treat it as a ballpark, not a measurement.
            </p>
          </>
        ) : (
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Add your weight (Body, or under Goals) and this can estimate the burn. Without one it
            would be inventing a body, so it doesn’t.
          </p>
        )}
      </div>

      <button
        onClick={save}
        disabled={!Number(minutes)}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          {saved ? <><Check size={15} strokeWidth={3} /> Logged</> : <><Dumbbell size={15} /> Log workout</>}
        </span>
      </button>
    </Card>
  );
}

/* ---------- Import ---------- */

function ImportWorkouts() {
  const app = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);

  const read = () => setResult(parseWorkoutCsv(text, app.body?.weightKg));

  return (
    <Card className="space-y-3">
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>From your health app</p>
      <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        A web app can’t read HealthKit, Health Connect or a watch directly — those are native
        permissions, and no button here could change that. What every one of them can do is export
        a file, so paste that in and this reads it.
      </p>
      {HEALTH_SOURCES.map((s) => (
        <div key={s.id}>
          <p className="text-[0.8125rem] font-bold">{s.name}</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{s.how}</p>
        </div>
      ))}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
        rows={5}
        placeholder={'date,type,minutes,distance,calories'}
        aria-label="Workout export"
        className="w-full rounded-2xl border px-3 py-2.5 text-[0.75rem] font-mono outline-none"
        style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="flex gap-2">
        <button
          onClick={() => setText(SAMPLE)}
          className="press rounded-2xl border px-3 py-2 text-[0.78125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Example
        </button>
        <button
          onClick={read}
          disabled={!text.trim()}
          className="press flex-1 rounded-2xl border py-2 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Read the file</span>
        </button>
      </div>

      {result?.error && <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--danger)' }}>{result.error}</p>}
      {result?.workouts?.length > 0 && (
        <>
          <p className="text-[0.8125rem] font-semibold">
            {result.workouts.length} workout{result.workouts.length === 1 ? '' : 's'} read
            {result.skipped > 0 && `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped for missing a date or a duration`}.
          </p>
          <button
            onClick={() => { app.importWorkouts(result.workouts); setResult(null); setText(''); }}
            className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><Import size={15} /> Add them</span>
          </button>
        </>
      )}
    </Card>
  );
}

/**
 * Exercise: what you did, what it roughly cost, and whether that changes what
 * you can eat. The burn is always labelled an estimate, and eating it back is
 * off until you say otherwise.
 */
export default function ExercisePanel() {
  const app = useApp();
  const week = app.training;
  const activity = app.activity;
  const streak = activeStreak(app.workouts, app.day);
  const recent = [...app.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>This week</p>
        {week.sessions === 0 ? (
          <p className="mt-1 text-[0.84375rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing logged this week. Everything here counts sessions you recorded — there is no
            step counter behind it.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[1.375rem] font-extrabold">
              {week.sessions} session{week.sessions === 1 ? '' : 's'}
              <span className="text-[0.8125rem] font-semibold ml-1.5" style={{ color: 'var(--muted)' }}>
                {/* No weight means no estimate — a "≈ 0 kcal" would read as a measurement of nothing. */}
                {week.minutes} min{week.kcal > 0 && ` · ≈ ${week.kcal.toLocaleString()} kcal`}
              </span>
            </p>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {week.days} day{week.days === 1 ? '' : 's'} active
              {week.distanceKm > 0 && ` · ${week.distanceKm} km`}
              {streak > 1 && ` · ${streak}-day streak`}
            </p>
            <div className="mt-2.5 space-y-1.5">
              {week.byType.map((t) => (
                <div key={t.type}>
                  <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                    <span>{t.label}</span>
                    <span style={{ color: 'var(--muted)' }}>{t.minutes} min</span>
                  </div>
                  <Meter value={t.minutes} max={week.minutes} height={4} />
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        {/* Eating training back is not offered under 18 — the toggle itself is
            the "earn your food" idea, so it isn't there to turn on. */}
        {app.youth.exerciseEatBack && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-[0.875rem]">Count exercise calories</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Add today’s estimated burn to your target
              </p>
            </div>
            <Toggle label="Count exercise calories" on={app.countExerciseKcal} onChange={() => app.setCountExerciseKcal(!app.countExerciseKcal)} />
          </div>
        )}
        <div className="mt-3 rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
          <p className="text-[0.84375rem] font-bold">
            Today: {activity.base.toLocaleString()} kcal
            {activity.counted && activity.burned > 0 && ` + ${activity.burned} = ${activity.adjusted.toLocaleString()}`}
          </p>
          <p className="mt-0.5 text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
            <Info size={13} className="mt-0.5 shrink-0" /> {activity.note}
          </p>
        </div>
      </Card>

      <LogWorkout />

      {recent.length > 0 && (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {recent.map((w) => (
            <div key={w.id} className="flex items-center gap-3 p-3">
              <Glyph e={workoutBy[w.type]?.emoji || '🤸'} size={18} style={{ color: 'var(--muted)' }} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[0.84375rem] truncate">
                  {workoutBy[w.type]?.label || w.type} · {w.minutes} min
                </p>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {prettyDate(w.date)}
                  {w.distanceKm ? ` · ${w.distanceKm} km` : ''}
                  {w.source === 'import' ? ' · imported' : ''}
                </p>
              </div>
              {w.kcal ? <Pill tone={w.estimated ? 'muted' : 'good'}>{w.estimated ? '≈ ' : ''}{w.kcal} kcal</Pill> : null}
              <button onClick={() => app.removeWorkout(w.id)} aria-label={`Delete ${w.type} on ${w.date}`} className="press p-1" style={{ color: 'var(--faint)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}

      <ImportWorkouts />
    </div>
  );
}
