import { useMemo } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { guidanceFor } from '../lib/guidance.js';
import { Card, Pill } from './ui.jsx';

export default function GuidancePreview({ onOpen, onAction }) {
  const app = useApp();
  const item = useMemo(() => guidanceFor(app)[0], [app]);

  return (
    <Card className="!p-4">
      <button type="button" onClick={onOpen} className="press w-full text-left" aria-label="Open Guidance">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            What matters now
          </p>
          <span className="inline-flex items-center gap-1 text-[0.71875rem] font-bold" style={{ color: 'var(--muted)' }}>
            Guidance <ChevronRight size={13} />
          </span>
        </div>
        <p className="mt-1.5 text-[1rem] font-extrabold tracking-tight">{item.title}</p>
        <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          {item.reason}
        </p>
      </button>
      <div className="mt-3 grid gap-2.5">
        <div><Pill tone={item.tone || 'muted'}>{item.evidence}</Pill></div>
        <button
          type="button"
          onClick={() => onAction(item)}
          className="press inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[0.78125rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {item.actionLabel} <ArrowRight size={14} />
        </button>
      </div>
    </Card>
  );
}
