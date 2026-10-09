import { useApp } from '../lib/store.jsx';
import { Card, Pill } from './ui.jsx';

/**
 * Forq learned — restrained, evidence-backed, correctable.
 * Only renders when there is enough evidence.
 */
export default function ForqLearned() {
  const app = useApp();
  const insights = app.householdInsights || [];
  if (!insights.length) return null;
  return (
    <section className="px-5" aria-label="What Forq learned">
      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        What Forq learned
      </p>
      <div className="space-y-2.5">
        {insights.map((item) => (
          <Card key={item.id} className="!p-4">
            <p className="text-[0.875rem] font-extrabold">Forq noticed — {item.title}</p>
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Evidence: {item.evidence}
            </p>
            <p className="mt-0.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              What I&apos;ll do: {item.consequence}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <Pill tone={item.confidence === 'high' ? 'good' : 'muted'}>{item.confidence} confidence</Pill>
              <button type="button" onClick={() => app.keepInsight?.(item.id)} className="press ml-auto rounded-xl border px-3 py-1.5 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
                Keep
              </button>
              <button type="button" onClick={() => app.dismissInsight?.(item.id)} className="press rounded-xl px-3 py-1.5 text-[0.75rem] font-bold" style={{ color: 'var(--muted)' }}>
                Don&apos;t use this
              </button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
