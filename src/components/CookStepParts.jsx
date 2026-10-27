import { Pause, Play, Timer as TimerIcon, X } from 'lucide-react';
import { stepSegments } from '../lib/step-markup.js';

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The step as written, with its durations as timer buttons and its
 * ingredients showing their amounts in place (src/lib/step-markup.js).
 */
export function StepText({ text, ingredients, onStartTimer }) {
  return (
    <p className="mt-3 text-[1.5rem] font-bold leading-snug" data-testid="cook-step-text">
      {stepSegments(text, ingredients).map((segment, index) => {
        if (segment.type === 'time') {
          return (
            <button
              key={index}
              type="button"
              onClick={() => onStartTimer(segment)}
              className="press mx-0.5 inline-flex items-center gap-1 rounded-xl px-2 py-0.5 align-baseline font-extrabold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}
              aria-label={`Start a ${segment.text} timer`}
            >
              <TimerIcon size={16} /> {segment.text}
            </button>
          );
        }
        if (segment.type === 'ingredient') {
          return (
            <span key={index} className="font-extrabold" style={{ color: 'var(--ink)' }}>
              {segment.text}
              {segment.qty && (
                <span className="ml-1 rounded-lg px-1.5 py-0.5 align-middle text-[0.75rem] font-extrabold" style={{ background: 'var(--card-2)', color: 'var(--muted)' }}>
                  {segment.qty}
                </span>
              )}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </p>
  );
}

/**
 * Every timer started from a step's text, kept running across steps (the
 * Crouton tray). Tap to pause or resume; a finished timer can be cleared.
 */
export function TimerTray({ timers, onToggle, onDismiss }) {
  const entries = Object.entries(timers).filter(([key]) => key.startsWith('x:'));
  if (!entries.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Running timers" data-testid="timer-tray">
      {entries.map(([key, timer]) => {
        const done = timer.left === 0;
        return (
          <li key={key} className="inline-flex items-center gap-1 rounded-full border pl-1 pr-1" style={{ borderColor: done ? 'var(--good)' : 'var(--line)', background: 'var(--card)' }}>
            <button
              type="button"
              onClick={() => onToggle(key)}
              disabled={done}
              className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.78125rem] font-extrabold tabular-nums"
              style={{ color: done ? 'var(--good)' : 'var(--ink)' }}
              aria-label={done ? `${timer.label} timer done` : `${timer.running ? 'Pause' : 'Resume'} ${timer.label} timer, ${clock(timer.left)} left`}
            >
              {done ? 'Done' : timer.running ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              {timer.label} · {clock(timer.left)}
            </button>
            <button type="button" onClick={() => onDismiss(key)} className="press grid h-6 w-6 place-items-center rounded-full" aria-label={`Clear the ${timer.label} timer`} style={{ color: 'var(--muted)' }}>
              <X size={12} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The step after this one, dimmed, so the next move is never a surprise (the Mela pattern). */
export function NextStepPreview({ text }) {
  if (!text) return null;
  return (
    <p className="mt-6 text-[0.9375rem] font-semibold leading-snug" style={{ color: 'var(--faint)', opacity: 0.7 }} data-testid="cook-next-step">
      <span className="mr-1.5 text-[0.71875rem] font-extrabold uppercase tracking-wide">Next</span>
      {text}
    </p>
  );
}
