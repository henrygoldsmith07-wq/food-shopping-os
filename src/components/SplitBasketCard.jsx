import { useMemo } from 'react';
import { Split } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { splitBasket } from '../lib/split-basket.js';
import { Card } from './ui.jsx';

/** Worth a second shop? Shows the list split by cheapest store, only when it saves real money. */
export default function SplitBasketCard({ rows = [] }) {
  const split = useMemo(() => splitBasket(rows), [rows]);
  if (!split.worthIt) return null;
  return (
    <Card className="!p-3.5 mt-2.5 space-y-2" label="Split across shops">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
        <Split size={12} /> Split the shop
      </p>
      <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Buying each item where it is cheapest comes to {gbp(split.total, { always: true })}, about {gbp(split.saving, { always: true })} less than all at {split.single.store} ({gbp(split.single.total, { always: true })}).
      </p>
      <ul className="space-y-1.5">
        {split.stops.map((stop) => (
          <li key={stop.store} className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            <span className="font-extrabold" style={{ color: 'var(--ink)' }}>{stop.store} · {gbp(stop.subtotal, { always: true })}</span>
            {stop.fee > 0 ? ` + ${gbp(stop.fee, { always: true })} travel/delivery` : ''}
            <span className="block">{stop.items.map((i) => i.name).join(', ')}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Priced from your checks and receipts only. It is a second trip, so it is your call.
      </p>
    </Card>
  );
}
