import { useApp } from '../lib/store.jsx';
import { Card, Pill } from './ui.jsx';

/**
 * Shop decision — best-simple / cheapest / lowest-waste with trade-offs,
 * plus the one recommendation. Provenance stays honest: receipt-backed
 * history, confirm at the shelf, unknown stays unknown.
 */
export default function ShopDecision() {
  const app = useApp();
  const decision = app.shopDecision;
  if (!decision || decision.empty || !decision.options?.length) return null;
  const rec = decision.recommendation;
  return (
    <section className="px-5" aria-label="Best way to shop">
      <Card>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Best way to shop
        </p>
        {rec && (
          <p className="mt-1 text-[0.9375rem] font-extrabold">
            {rec.label}: {rec.store} · £{Number(rec.total).toFixed(2)}
          </p>
        )}
        <ul className="mt-2 space-y-1.5">
          {decision.options.map((o) => (
            <li key={o.id} className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              · {o.label} — {o.store} · £{Number(o.total).toFixed(2)}
              {o.id !== 'cheapest' && o.savingVsCheapest > 0 ? ` (+£${o.savingVsCheapest.toFixed(2)} vs cheapest)` : ''}
              {o.stores > 1 ? ` · ${o.stores} stores` : ' · one store'}
            </li>
          ))}
        </ul>
        {decision.options[0]?.budget?.over && (
          <p className="mt-1 text-[0.78125rem] font-bold" style={{ color: 'var(--warn-deep)' }}>
            £{decision.options[0].budget.overBy.toFixed(2)} over the money left this week.
          </p>
        )}
        {decision.uncertain?.length > 0 && (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            I think you still have {decision.uncertain.slice(0, 2).join(' and ')} — confirm before relying on it.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone="muted">Receipt-backed prices</Pill>
          <Pill tone="muted">Confirm at the shelf</Pill>
        </div>
      </Card>
    </section>
  );
}
