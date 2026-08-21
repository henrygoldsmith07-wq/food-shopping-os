import { useState } from 'react';
import { ArrowRight, Check, FlaskConical, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { DEMO_BANNER, DEMO_LABEL, DEMO_WALKTHROUGH } from '../data/exampleWeek.js';
import { weekDates } from '../lib/kitchen.js';
import { shoppingForPlan } from '../lib/mealplan.js';
import { Card } from './ui.jsx';

/**
 * Guided demo controls. Actions only mutate the isolated demo session.
 */
export default function DemoWalkthrough({ onNavigate }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [note, setNote] = useState('');
  const current = DEMO_WALKTHROUGH[step] || DEMO_WALKTHROUGH[0];

  if (!app.isDemoMode) return null;

  const runAction = (action) => {
    if (action === 'generateList') {
      const dates = weekDates(app.day);
      const items = shoppingForPlan(app.plan, dates, { pantry: app.pantry });
      app.addToList(items);
      setNote(`Added ${items.length} items to the demo list (pantry already deducted).`);
      return;
    }
    if (action === 'tickHalf') {
      const list = app.shoppingList || [];
      if (!list.length) {
        setNote('Generate the list first.');
        return;
      }
      list.slice(0, Math.ceil(list.length / 2)).forEach((item) => {
        if (!item.checked) app.toggleChecked(item.id);
      });
      setNote('Half the list ticked — as if you walked the first aisles.');
      return;
    }
    if (action === 'recordShop') {
      const bought = (app.shoppingList || []).filter((i) => i.checked);
      if (!bought.length) {
        // Tick remaining so the demo can complete
        (app.shoppingList || []).forEach((item) => {
          if (!item.checked) app.toggleChecked(item.id);
        });
      }
      const checked = (app.shoppingList || []).filter((i) => i.checked);
      if (!checked.length) {
        setNote('Add items to the list first.');
        return;
      }
      const total = checked.reduce((s, i) => s + (Number(i.price) || 0), 0);
      app.recordShop({
        store: 'Demo Market',
        total: total || checked.length * 1.5,
        toPantry: true,
        location: 'Cupboard',
      });
      setNote(`${checked.length} items recorded into the demo pantry. Your real kitchen is untouched.`);
    }
  };

  const next = () => {
    const s = DEMO_WALKTHROUGH[step];
    if (s?.action) runAction(s.action);
    if (s?.tab) onNavigate?.(s.tab);
    if (step < DEMO_WALKTHROUGH.length - 1) {
      setStep(step + 1);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pointer-events-none"
      role="region"
      aria-label={DEMO_LABEL}
    >
      <Card
        className="pointer-events-auto mx-auto max-w-lg !p-4 shadow-lg"
        style={{ borderColor: 'var(--warn)', background: 'var(--card)' }}
      >
        <div className="flex items-start gap-2">
          <FlaskConical size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--warn)' }} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>
              {DEMO_LABEL} · step {step + 1} of {DEMO_WALKTHROUGH.length}
            </p>
            <p className="mt-0.5 text-[0.9375rem] font-extrabold">{current.title}</p>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
              {current.blurb}
            </p>
            {note && (
              <p role="status" className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--accent)' }}>
                {note}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Exit example week"
            onClick={() => app.exitDemoMode()}
            className="press shrink-0 p-1"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => app.exitDemoMode()}
            className="press rounded-xl border px-3 py-2.5 text-[0.75rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Clear demo
          </button>
          <button
            type="button"
            onClick={next}
            className="press flex-1 rounded-xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              {step >= DEMO_WALKTHROUGH.length - 1 ? (
                <><Check size={14} strokeWidth={3} /> Finish tour</>
              ) : (
                <>Next <ArrowRight size={14} /></>
              )}
            </span>
          </button>
        </div>
        <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          {DEMO_BANNER}
        </p>
      </Card>
    </div>
  );
}

/** Compact top strip when demo is active. */
export function DemoBanner() {
  const app = useApp();
  if (!app.isDemoMode) return null;
  return (
    <div
      role="status"
      className="px-4 py-2 text-center text-[0.75rem] font-extrabold"
      style={{ background: 'color-mix(in srgb, var(--warn) 18%, var(--card))', color: 'var(--ink)' }}
    >
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical size={13} style={{ color: 'var(--warn)' }} />
        {DEMO_LABEL} — not saved · does not affect streaks, XP or analytics
        <button
          type="button"
          onClick={() => app.exitDemoMode()}
          className="tap press ml-2 underline"
        >
          Exit
        </button>
      </span>
    </div>
  );
}
