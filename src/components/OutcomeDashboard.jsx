import { useApp } from '../lib/store.jsx';
import { gbp } from '../lib/utils.js';
import { Card, Pill, Section } from './ui.jsx';

export default function OutcomeDashboard() {
  const app = useApp();
  const d = app.dashboard;
  if (!d || !d.ready) {
    return (
      <Section title="Your outcomes" className="rise">
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Record a shop, plan a meal, or bin something and this fills in with real spend, savings, waste and adherence — no estimates invented.
          </p>
        </Card>
      </Section>
    );
  }
  return (
    <Section title="Real outcomes — last 30 days" className="rise">
      <div className="space-y-3">
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Spend</p>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[1rem] font-extrabold">{gbp(d.spend.planned, { always: true })}</p>
              <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Planned list</p>
            </div>
            <div>
              <p className="text-[1rem] font-extrabold">{gbp(d.spend.actual, { always: true })}</p>
              <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Actual receipts</p>
            </div>
            <div>
              <p className="text-[1rem] font-extrabold">{gbp(d.savings.honest, { always: true })}</p>
              <p className="text-[0.65625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>Honest saving</p>
            </div>
          </div>
          <p className="mt-2 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{d.spend.assumption}</p>
          <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{d.savings.assumption}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Plan vs reality</p>
            <Pill tone={d.adherence.rate != null && d.adherence.rate >= 60 ? 'good' : 'muted'}>
              {d.adherence.rate == null ? 'no data' : `${d.adherence.rate}% cooked`}
            </Pill>
          </div>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {d.adherence.planned} planned · {d.adherence.cooked} cooked · {d.adherence.skipped} skipped · {d.adherence.substituted} substituted · {d.adherence.takeaway} takeaway
          </p>
          {d.adherence.topReason && <p className="mt-1 text-[0.75rem] font-bold" style={{ color: 'var(--warn)' }}>Top skip reason: {d.adherence.topReason}</p>}
          <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{d.adherence.suggestion}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Waste</p>
            <Pill tone={d.waste.rate != null && d.waste.rate <= 20 ? 'good' : d.waste.rate == null ? 'muted' : 'warn'}>
              {d.waste.rate == null ? 'no data' : `${d.waste.rate}% waste rate`}
            </Pill>
          </div>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {d.waste.count} binned · {gbp(d.waste.value, { always: true })} wasted · {d.waste.frequentlyDiscarded.slice(0, 2).map((r) => r.name).join(', ') || 'no repeat waste'}
          </p>
          <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{d.waste.assumption}</p>
        </Card>

        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Pantry accuracy & list completion</p>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Pantry: {d.pantryAccuracy.pctConfirmed == null ? '—' : `${d.pantryAccuracy.pctConfirmed}% confirmed`} · List: {d.shoppingCompletion.pct == null ? '—' : `${d.shoppingCompletion.pct}% checked`}
          </p>
          <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>{d.pantryAccuracy.assumption} · {d.shoppingCompletion.assumption}</p>
        </Card>

        {d.trend.some((w) => w.spend > 0) && (
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Spend trend (4 weeks)</p>
            <div className="mt-2 flex gap-2">
              {d.trend.map((w) => (
                <div key={w.week} className="flex-1 text-center rounded-xl py-2" style={{ background: 'var(--card-2)' }}>
                  <p className="text-[0.75rem] font-bold">{w.week}</p>
                  <p className="text-[0.875rem] font-extrabold">{gbp(w.spend, { always: true })}</p>
                  <p className="text-[0.65625rem] font-semibold" style={{ color: 'var(--muted)' }}>{w.trips} shops</p>
                </div>
              ))}
            </div>
          </Card>
        )}
        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          All figures are receipt-backed or explicitly estimated — community observations are never shown as live shelf prices.
        </p>
      </div>
    </Section>
  );
}
