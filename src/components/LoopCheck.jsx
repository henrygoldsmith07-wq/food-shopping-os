import { Repeat } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Card } from './ui.jsx';

/**
 * The drift guard on Home: where the loop has quietly come undone — pantry
 * not being spent, leftovers expiring unseen, shops never stocked — it says
 * so plainly and offers the one tap that puts it right.
 */
export default function LoopCheck({ goTab }) {
  const app = useApp();
  const issues = app.loopHealth?.issues || [];
  if (!issues.length) return null;

  const runFix = (fix) => {
    if (fix.kind === 'enable-pantry-use') app.set({ autoUsePantry: true });
    else if (fix.kind === 'bin-expired-leftovers') app.clearExpiredLeftovers();
    else if (fix.kind === 'reconcile-shops') fix.shopIds.forEach((id) => app.reconcileShopToPantry(id));
  };

  return (
    <section className="px-5 rise rise-1" aria-label="Loop check">
      <Card className="!p-4">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
          <Repeat size={12} /> Keep the loop closed
        </p>
        <div className="mt-2.5 space-y-3">
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.875rem] font-bold" style={issue.severity === 'warn' ? { color: 'var(--warn)' } : undefined}>
                  {issue.title}
                </p>
                <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{issue.detail}</p>
              </div>
              {issue.fix ? (
                <button
                  onClick={() => runFix(issue.fix)}
                  className="press shrink-0 rounded-xl border px-3 py-2 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  {issue.fix.label}
                </button>
              ) : issue.goTab ? (
                <button
                  onClick={() => goTab(issue.goTab)}
                  className="press shrink-0 rounded-xl border px-3 py-2 text-[0.71875rem] font-extrabold"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  Plan →
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
