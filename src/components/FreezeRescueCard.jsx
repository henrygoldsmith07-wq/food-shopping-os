import { useMemo, useState } from 'react';
import { Check, Snowflake } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { freezeCandidates } from '../lib/freeze-rescue.js';
import { FROZEN_DAYS } from '../lib/kitchen.js';
import { Card } from './ui.jsx';

/** Plan tab card: food going off within two days that can go in the freezer instead of the bin. */
export default function FreezeRescueCard() {
  const app = useApp();
  const [done, setDone] = useState({});
  const rows = useMemo(
    () => freezeCandidates({ pantry: app.pantry || [], day: app.day }).slice(0, 4),
    [app.pantry, app.day],
  );
  const shown = [...rows.map((r) => r.item), ...Object.values(done).filter((d) => !rows.some((r) => r.item.id === d.id))];
  if (!shown.length) return null;
  const when = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  return (
    <div className="px-5">
      <Card className="!p-3 space-y-2" label="Freeze before it goes off">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <Snowflake size={13} /> Freeze before it goes off
        </p>
        <ul className="space-y-1.5">
          {shown.map((item) => {
            const frozen = Boolean(done[item.id]);
            const left = rows.find((r) => r.item.id === item.id)?.daysLeft;
            return (
              <li key={item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{item.name}</span>
                  <span className="block truncate text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {frozen ? 'In the freezer' : `Goes off ${when(left)} · keeps about ${FROZEN_DAYS[item.cat] ?? 90} days frozen`}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={frozen}
                  onClick={() => { app.freezePantryItem(item.id); setDone((d) => ({ ...d, [item.id]: item })); }}
                  className="press min-h-[44px] shrink-0 rounded-xl border px-3 text-[0.75rem] font-extrabold"
                  style={{ borderColor: 'var(--line)' }}
                  aria-label={frozen ? `${item.name} frozen` : `Freeze ${item.name}`}
                >
                  {frozen ? <span className="inline-flex items-center gap-1"><Check size={13} /> Frozen</span> : 'Freeze it'}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
