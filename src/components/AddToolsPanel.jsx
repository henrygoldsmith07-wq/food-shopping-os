import { Check, Plus } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  CORE_LOOP,
  OPTIONAL_TOOLS,
  TOOL_CATEGORIES,
} from '../data/optionalTools.js';
import { Card, Toggle } from './ui.jsx';

/**
 * Progressive disclosure control surface.
 * Default app is the core loop; secondary capabilities are opted into here.
 */
export default function AddToolsPanel() {
  const app = useApp();
  const enabled = new Set(app.enabledTools || []);

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Default experience
        </p>
        <p className="mt-1 text-[0.875rem] font-extrabold tracking-tight">
          Plan meals · list · shop · pantry · cook · repeat
        </p>
        <ol className="mt-3 space-y-1.5">
          {CORE_LOOP.map((step, index) => (
            <li key={step.id} className="flex gap-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              <span className="font-extrabold tabular-nums" style={{ color: 'var(--faint)' }}>{index + 1}.</span>
              <span>
                <span className="font-extrabold" style={{ color: 'var(--ink)' }}>{step.label}</span>
                {' — '}
                {step.summary}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Everything below is optional. Add a tool when you need it — nothing is removed from the app, only hidden until then.
        </p>
      </Card>

      {TOOL_CATEGORIES.map((cat) => {
        const tools = OPTIONAL_TOOLS.filter((t) => t.category === cat.id);
        if (!tools.length) return null;
        return (
          <section key={cat.id} aria-labelledby={`tools-${cat.id}`}>
            <h3 id={`tools-${cat.id}`} className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              {cat.label}
            </h3>
            <div className="space-y-2">
              {tools.map((tool) => {
                const on = enabled.has(tool.id);
                return (
                  <Card key={tool.id} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-extrabold text-[0.875rem] inline-flex items-center gap-1.5">
                          {on
                            ? <Check size={14} style={{ color: 'var(--accent)' }} />
                            : <Plus size={14} style={{ color: 'var(--muted)' }} />}
                          {tool.label}
                        </p>
                        <p className="mt-0.5 text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                          {tool.blurb}
                        </p>
                      </div>
                      <Toggle
                        label={`${on ? 'Disable' : 'Enable'} ${tool.label}`}
                        on={on}
                        onChange={() => app.toggleOptionalTool(tool.id)}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {(app.enabledTools || []).length > 0 && (
        <button
          type="button"
          onClick={app.resetOptionalTools}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          Back to core loop only
        </button>
      )}
    </div>
  );
}
