import { Check, Info, ShieldQuestion, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { RESTRICTIVE_SCREENING } from '../lib/target-safety.js';
import { Card, Chip } from './ui.jsx';

const TONE = {
  blocking: { color: 'var(--danger)', Icon: TriangleAlert },
  caution: { color: 'var(--warn)', Icon: TriangleAlert },
  info: { color: 'var(--muted)', Icon: Info },
};

const FIELD_LABEL = {
  age: 'your age',
  weight: 'your weight',
  height: 'your height',
  maintenance: 'a maintenance figure — your stats, or the number you already know',
};

function Warnings({ items }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map(({ id, severity, message }) => {
        const { color, Icon } = TONE[severity] || TONE.info;
        return (
          <li key={id} className="flex items-start gap-1.5 text-[0.75rem] font-semibold" style={{ color }}>
            <Icon size={13} className="shrink-0 mt-0.5" />
            <span>{message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The questions that come before a weight-loss target.
 *
 * They gate what the app will do; they are not an assessment of anybody, and
 * nothing is scored. A "yes" to any of them means Forq plans at maintenance and
 * says who to ask instead.
 */
function Screening() {
  const app = useApp();
  const answers = app.goalScreening || {};

  return (
    <div className="space-y-2.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      <div>
        <p className="font-extrabold text-[0.875rem] inline-flex items-center gap-1.5">
          <ShieldQuestion size={15} /> Before a weight-loss target
        </p>
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Five questions, answered by you. They decide what Forq will set, not what is
          true about you — nothing here is a diagnosis and nothing is scored.
        </p>
      </div>
      {RESTRICTIVE_SCREENING.map(({ id, question }) => (
        <div key={id} className="flex items-start justify-between gap-3">
          <p className="text-[0.78125rem] font-semibold">{question}</p>
          <div className="flex shrink-0 gap-1.5">
            {['no', 'yes'].map((value) => (
              <Chip
                key={value}
                active={answers[id] === value}
                onClick={() => app.answerGoalScreening(id, value)}
              >
                {value === 'no' ? 'No' : 'Yes'}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {Object.keys(answers).length > 0 && (
        <button
          onClick={() => app.clearGoalScreening()}
          className="press text-[0.75rem] font-bold"
          style={{ color: 'var(--accent)' }}
        >
          Clear these answers
        </button>
      )}
    </div>
  );
}

/**
 * The same assessment at setup, where there is no store to read from yet.
 *
 * Setup shows a band and, when the inputs are not there, says so rather than
 * previewing a target the app would then refuse to set.
 */
export function TargetPreview({ safety, preview }) {
  return (
    <Card>
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
        {safety.personalised ? 'That works out as' : 'Not enough to work one out'}
      </p>
      {safety.personalised ? (
        <div className="flex items-end justify-between">
          <div>
            {/* A band, not a figure to the calorie — the equation behind it is
                an estimate and the display should look like one. */}
            <p className="text-[1.5rem] font-extrabold leading-none">
              {safety.range.low.toLocaleString()}–{safety.range.high.toLocaleString()}
            </p>
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              kcal a day · planning at {safety.kcal.toLocaleString()}
            </p>
          </div>
          <div className="flex gap-4 text-right">
            {[['Protein', preview.protein], ['Carbs', preview.carbs], ['Fat', preview.fat]].map(([label, v]) => (
              <div key={label}>
                <p className="text-[0.9375rem] font-extrabold leading-none">{v}g</p>
                <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Forq needs {safety.missing.join(', ')} before it sets a calorie target, and it would
          rather say so than show you a number that is really about somebody else. You can add
          them here or later under Goals.
        </p>
      )}
      {safety.appliedGoal !== safety.goal && (
        <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          A weight-loss target is not set during setup. Forq starts at maintenance; under Goals
          it asks a few questions first and then waits for you to confirm it.
        </p>
      )}
    </Card>
  );
}

/**
 * What Forq is willing to say about this person's calorie target.
 *
 * Every branch here comes from `targetSafety`: the refusal when the inputs are
 * incomplete, the range instead of a single confident number, the warnings, the
 * screen before a restrictive goal, the confirmation a deficit waits on, and
 * the people who can help with what an app cannot.
 */
export default function TargetSafetyCard() {
  const app = useApp();
  const safety = app.targetSafety;
  const blocking = safety.warnings.filter((w) => w.severity === 'blocking');
  const rest = safety.warnings.filter((w) => w.severity !== 'blocking');
  const pending = safety.confirmation.required && !safety.confirmation.given;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-extrabold text-[0.9375rem]">How this target was checked</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          An estimate from an equation, held inside limits — not a prescription.
        </p>
      </div>

      {safety.personalised ? (
        <div>
          <p className="text-[1.5rem] font-extrabold leading-none">
            {safety.range.low.toLocaleString()}–{safety.range.high.toLocaleString()}
            <span className="text-[0.875rem]"> kcal a day</span>
          </p>
          <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Forq plans against {safety.kcal.toLocaleString()} kcal, the middle of that band.
            The equation behind it lands within about {safety.range.pct}% for most people, so
            the band is the honest answer and the single number is the working one.
          </p>
        </div>
      ) : (
        <div>
          <p className="font-extrabold text-[0.875rem]" style={{ color: 'var(--danger)' }}>
            No calorie target yet
          </p>
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Forq will not build one from what it has. Still needed:{' '}
            {safety.missing.map((key) => FIELD_LABEL[key] || key).join(', ')}.
          </p>
        </div>
      )}

      <Warnings items={blocking} />
      <Warnings items={rest} />

      {safety.pathway === 'child' && (
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Under 18 the target is maintenance and the goal chooser only offers goals that
          are not restriction.
        </p>
      )}

      {safety.screening.required && !safety.screening.clear && <Screening />}

      {pending && (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[0.78125rem] font-semibold">
            {safety.proposedKcal
              ? `Confirming sets ${safety.proposedRange.low.toLocaleString()}–${safety.proposedRange.high.toLocaleString()} kcal a day, about ${safety.deficit.proposedWeeklyKg} kg a week. Until then Forq plans at ${safety.kcal.toLocaleString()}.`
              : 'This target is waiting on you.'}
          </p>
          <button
            onClick={() => app.confirmTarget()}
            className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} strokeWidth={3} /> I have read this and want this target
            </span>
          </button>
        </div>
      )}

      {safety.confirmation.given && (
        <p className="inline-flex items-center gap-1.5 text-[0.75rem] font-bold" style={{ color: 'var(--accent)' }}>
          <Check size={13} strokeWidth={3} /> You confirmed this target. Change the goal or the
          numbers behind it and Forq will ask again.
        </p>
      )}

      <div className="space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
        {safety.support.map((line) => (
          <p key={line} className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{line}</p>
        ))}
      </div>
    </Card>
  );
}
