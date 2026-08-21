import { useEffect, useState } from 'react';
import {
  Check, ExternalLink, Lightbulb, Mic, Pause, PartyPopper, Play, PlayCircle, Snowflake, TriangleAlert, X,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { recordProductEvent } from '../lib/product-analytics.js';
import { safeExternalUrl } from '../lib/recipe-tools.js';
import { Card, Meter, Stepper } from './ui.jsx';

/**
 * Cooking mode: one step at a time, full screen, with timers that survive
 * navigating back and forth.
 *
 * **Hands-free** is the closest thing here to a video recipe, and it is an
 * honest one: there is no stock footage in this app and none is invented. It
 * plays the method itself — each step held on screen long enough to read, timed
 * steps running their timer before moving on. A recipe you imported from a
 * video keeps its link, and that link is offered as what it is: someone else's
 * video, on their site.
 */

const DWELL_SECONDS = 14;

function Timer({ mins, state, onChange }) {
  const left = state ? state.left : mins * 60;
  const running = state?.running ?? false;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const done = left === 0;
  return (
    <button
      onClick={() => (done ? onChange({ left: mins * 60, running: false }) : onChange({ left, running: !running }))}
      className="press mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[0.9375rem] font-extrabold tabular-nums"
      style={done
        ? { background: 'color-mix(in srgb, var(--good) 15%, transparent)', color: 'var(--good)' }
        : running
          ? { background: 'var(--accent)', color: 'var(--on-accent)' }
          : { background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}
    >
      {done
        ? <><Check size={16} strokeWidth={3} /> Done — reset</>
        : <>{running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />} {mm}:{ss}</>}
    </button>
  );
}

export default function CookMode({ recipe, onExit, onClose }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [timers, setTimers] = useState({}); // step index -> {left, running}
  const [auto, setAuto] = useState(false);
  const [dwell, setDwell] = useState(DWELL_SECONDS);
  const [spare, setSpare] = useState(Math.max(0, (recipe.servings || 1) - 1));
  const [saved, setSaved] = useState(false);
  const [wakeState, setWakeState] = useState('checking');
  const [startedAt] = useState(() => Date.now());

  const s = recipe.steps[step];
  const last = step === recipe.steps.length - 1;
  const videoUrl = safeExternalUrl(recipe.video);
  const pantryEvent = app.lastPantryEvent?.recipeId === recipe.id && app.lastPantryEvent?.date === app.day
    ? app.lastPantryEvent
    : null;

  useEffect(() => {
    if (finished) {
      setWakeState('released');
      return undefined;
    }
    if (!navigator.wakeLock?.request) {
      setWakeState('unsupported');
      return undefined;
    }
    let active = true;
    let lock = null;
    const acquire = async () => {
      if (!active || document.visibilityState !== 'visible' || lock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!active) {
          await lock.release();
          return;
        }
        setWakeState('active');
        lock.addEventListener('release', () => {
          lock = null;
          if (active) setWakeState('released');
        });
      } catch {
        if (active) setWakeState('unavailable');
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release();
    };
  }, [finished]);

  const finish = () => {
    app.completeRecipe(recipe, { actualMins: Math.max(1, Math.round((Date.now() - startedAt) / 60000)) });
    recordProductEvent('recipe_cooked');
    setAuto(false);
    setFinished(true);
  };

  // One interval drives every step timer, so timers survive step navigation.
  useEffect(() => {
    const id = setInterval(() => {
      setTimers((t) => {
        let changed = false;
        const next = { ...t };
        for (const k of Object.keys(next)) {
          const v = next[k];
          if (v.running && v.left > 0) {
            const left = v.left - 1;
            next[k] = { left, running: left > 0 };
            if (left === 0) navigator.vibrate?.(300);
            changed = true;
          }
        }
        return changed ? next : t;
      });
      if (auto) setDwell((d) => d - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [auto]);

  // Hands-free: a timed step runs its timer out, everything else gets a read.
  useEffect(() => {
    if (!auto || finished) return;
    setDwell(s.timerMins ? s.timerMins * 60 : DWELL_SECONDS);
    if (s.timerMins) setTimers((t) => ({ ...t, [step]: { left: s.timerMins * 60, running: true } }));
  }, [auto, step, finished, s]);

  useEffect(() => {
    if (!auto || finished || dwell > 0) return;
    if (last) finish();
    else setStep((i) => i + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwell, auto, finished, last]);

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg)' }}>
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="press inline-flex items-center gap-1 text-[0.8125rem] font-extrabold" style={{ color: 'var(--muted)' }}>
            <X size={14} strokeWidth={2.6} /> Exit
          </button>
          <p className="text-[0.8125rem] font-extrabold truncate px-2">{recipe.name}</p>
          <span className="text-[0.8125rem] font-bold tabular-nums" style={{ color: 'var(--faint)' }}>
            {step + 1}/{recipe.steps.length}
          </span>
        </div>
        <div className="mt-3"><Meter value={step + 1} max={recipe.steps.length} /></div>
        {wakeState === 'active' && (
          <p className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
            <Lightbulb size={12} /> Screen stays awake while you cook
          </p>
        )}
      </div>

      {finished ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center rise">
          <PartyPopper size={56} strokeWidth={1.4} style={{ color: 'var(--accent)' }} />
          <h2 className="mt-4 text-[1.5rem] font-extrabold">Chef’s kiss!</h2>
          <p className="mt-2 text-[0.90625rem] font-semibold" style={{ color: 'var(--muted)' }}>
            +60 XP · cooking streak: {app.streak} days.<br />Nutrition logged to today’s totals.
          </p>

          {pantryEvent && (
            <Card className="mt-5 w-full !p-3 text-left" style={{ borderColor: pantryEvent.shortfalls?.length ? 'var(--warn)' : 'var(--line)' }}>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: pantryEvent.shortfalls?.length ? 'var(--warn)' : 'var(--faint)' }}>
                Pantry deduction
              </p>
              <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {pantryEvent.explanation}
              </p>
              {pantryEvent.shortfalls?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pantryEvent.shortfalls.map((shortfall) => (
                    <p key={shortfall.name} className="inline-flex items-start gap-1.5 text-[0.75rem] font-bold" style={{ color: 'var(--warn)' }}>
                      <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                      {shortfall.name}: {shortfall.short || 'amount not covered'} short
                    </p>
                  ))}
                </div>
              )}
              {pantryEvent.confirmationNeeded?.length > 0 && (
                <p className="mt-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {pantryEvent.confirmationNeeded.length} low-confidence item{pantryEvent.confirmationNeeded.length === 1 ? '' : 's'} need checking in the pantry.
                </p>
              )}
            </Card>
          )}

          {recipe.servings > 1 && (
            <Card className="mt-6 w-full !p-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1.5">
                  <Snowflake size={14} style={{ color: 'var(--muted)' }} /> Portions left over
                </p>
                <Stepper value={spare} onChange={setSpare} min={0} max={recipe.servings - 1} />
              </div>
              <button
                onClick={() => { app.saveLeftovers(recipe, spare); setSaved(true); }}
                disabled={saved || spare === 0}
                className="press mt-2.5 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50"
                style={saved ? { borderColor: 'var(--good)', color: 'var(--good)' } : { borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {saved
                  ? `${spare} portion${spare === 1 ? '' : 's'} in the fridge`
                  : `Save ${spare} portion${spare === 1 ? '' : 's'} for later`}
              </button>
            </Card>
          )}

          <button onClick={onClose} className="press mt-6 rounded-2xl px-8 py-3.5 font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            Back to my day
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col justify-center px-7 rise" key={step}>
            <p className="text-[0.8125rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Step {step + 1}</p>
            <p className="mt-3 text-[1.5rem] font-bold leading-snug">{s.text}</p>
            {s.timerMins && s.timerMins <= 90 && (
              <div>
                <Timer
                  mins={s.timerMins}
                  state={timers[step]}
                  onChange={(v) => setTimers((t) => ({ ...t, [step]: v }))}
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setAuto((v) => !v)}
                className="press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.78125rem] font-extrabold"
                style={auto
                  ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                  : { borderColor: 'var(--line)', color: 'var(--muted)' }}
              >
                <PlayCircle size={14} /> {auto ? `Hands-free · next in ${dwell}s` : 'Hands-free walkthrough'}
              </button>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.78125rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  <ExternalLink size={13} /> Watch the original
                </a>
              )}
            </div>
            <p className="mt-3 text-[0.78125rem] font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
              <Mic size={13} /> Voice mode: say “next” or swipe — hands-free.
            </p>
          </div>

          <div className="flex gap-3 px-5 pb-8 shrink-0">
            <button
              onClick={() => { setAuto(false); setStep(Math.max(0, step - 1)); }}
              disabled={step === 0}
              className="press flex-1 rounded-2xl py-4 font-extrabold disabled:opacity-35"
              style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
            >
              ‹ Back
            </button>
            <button
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="press flex-[2] rounded-2xl py-4 font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                {last && <Check size={16} strokeWidth={3} />}
                {last ? 'Finish & log meal' : 'Next ›'}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
