import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { rankAutopilotActions } from '../lib/autopilot.js';
import { Card, Pill } from './ui.jsx';
import { confidenceSummary, confidenceTone } from '../lib/confidence.js';

export default function AutopilotCard({ onOpenPantry, goTab }) {
  const app = useApp();
  const actions = rankAutopilotActions(app);
  const primary = actions[0] || {
    id: 'steady', priority: 'normal', title: 'Your kitchen is in a good rhythm',
    reason: 'Forq is ready to learn from your first plan, shop, or meal.',
    evidence: 'Ready when you are', actionLabel: 'Open plan', action: { kind: 'tab', target: 'plan' },
  };

  const run = (item) => {
    if (item.action.kind === 'pantry') return onOpenPantry();
    goTab(item.action.target);
  };

  return (
    <section className="px-5 rise rise-1" aria-labelledby="autopilot-title">
      <Card className="!p-4" style={{ borderColor: primary.priority === 'high' ? 'var(--accent)' : 'var(--line)' }}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Bot size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p id="autopilot-title" className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Forq autopilot</p>
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="mt-1 text-[1rem] font-extrabold tracking-tight">{primary.title}</h2>
            <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>{primary.reason}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone={primary.priority === 'high' ? 'warn' : 'muted'}>{primary.evidence}</Pill>
              {primary.confidenceEvidence && (
                <Pill tone={confidenceTone(primary.confidenceEvidence.level)}>
                  {confidenceSummary(primary.confidenceEvidence)}
                </Pill>
              )}
              <button type="button" onClick={() => run(primary)} className="press ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[0.75rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                {primary.actionLabel} <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
        {actions.length > 1 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Next useful thing</p>
            <button type="button" onClick={() => run(actions[1])} className="press flex w-full items-center gap-2 text-left">
              <span className="min-w-0 flex-1 text-[0.78125rem] font-extrabold">{actions[1].title}</span>
              <ArrowRight size={13} className="shrink-0" style={{ color: 'var(--faint)' }} />
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}
