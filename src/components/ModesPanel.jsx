/**
 * Choosing what you're here for.
 *
 * Two things this screen has to do, and the second matters more than the
 * first: let you narrow the app to the job you actually came for, and make it
 * obvious that narrowing it destroys nothing. Every hidden module is listed by
 * name, with what it is still holding, so "hidden" can never be mistaken for
 * "gone".
 */
import { Check, Eye, RotateCcw } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { MODE_CAVEAT, PRODUCT_MODES, moduleBy } from '../data/modes.js';
import { Card } from './ui.jsx';

export default function ModesView() {
  const app = useApp();
  const chosen = app.modes;
  const hidden = app.hiddenModules;

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          What are you using Forq for?
        </p>
        <p className="mt-0.5 text-[1.375rem] font-extrabold">
          {chosen.length
            ? `${hidden.length} module${hidden.length === 1 ? '' : 's'} hidden`
            : 'Everything is shown'}
        </p>
        <p className="mt-1.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {chosen.length
            ? 'Pick more than one and the app widens again — each adds back what it needs.'
            : 'Choose one or more and the modules they don’t need come off the tab bar and Home.'}
        </p>
      </Card>

      <div className="grid gap-2.5">
        {PRODUCT_MODES.map((mode) => {
          const on = chosen.includes(mode.id);
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={on}
              onClick={() => app.toggleMode(mode.id)}
              className="press w-full rounded-2xl border p-3.5 text-left"
              style={{
                background: on ? 'var(--accent-soft)' : 'var(--card)',
                borderColor: on ? 'var(--accent)' : 'var(--line)',
              }}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-extrabold">{mode.label}</span>
                  <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {mode.blurb}
                  </span>
                </span>
                {on && <Check size={16} strokeWidth={3} style={{ color: 'var(--accent)' }} />}
              </span>
              <span className="mt-2 block text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                Uses {mode.needs.map((id) => moduleBy[id]?.label || id).join(' · ')}
              </span>
            </button>
          );
        })}
      </div>

      {chosen.length > 0 && (
        <Card className="space-y-2">
          <p className="text-[0.8125rem] font-extrabold inline-flex items-center gap-1.5">
            <Eye size={14} /> Hidden, and still here
          </p>
          {hidden.length === 0 ? (
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Between them, the modes you picked use every module — nothing is hidden.
            </p>
          ) : (
            <ul className="space-y-1">
              {hidden.map((module) => (
                <li key={module.id} className="flex items-baseline justify-between gap-3 text-[0.78125rem] font-semibold">
                  <span>{module.label}</span>
                  <span style={{ color: 'var(--muted)' }}>{module.records || 'nothing recorded yet'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <button
        onClick={app.clearModes}
        disabled={!chosen.length}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-50"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        <span className="inline-flex items-center gap-2"><RotateCcw size={14} /> Show every module again</span>
      </button>

      <p className="text-[0.75rem] font-semibold px-1" style={{ color: 'var(--muted)' }}>
        {MODE_CAVEAT}
      </p>
    </>
  );
}
