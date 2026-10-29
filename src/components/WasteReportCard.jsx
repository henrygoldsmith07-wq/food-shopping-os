import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { wasteReport } from '../lib/waste-report.js';
import { reasonLabel } from '../lib/plan-outcome.js';
import { gbp } from '../lib/utils.js';
import { Card } from './ui.jsx';

const TREND = { down: 'fewer than last week', up: 'more than last week', same: 'same as last week', none: '' };

/** Home card: last 7 days of binned food, the biggest cause and one thing to change. */
export default function WasteReportCard() {
  const app = useApp();
  const r = useMemo(() => wasteReport({ waste: app.waste, cooked: app.cooked, today: app.day }), [app.waste, app.cooked, app.day]);
  if (!r) return null;
  const headline = r.binned
    ? `Binned ${r.binned} item${r.binned === 1 ? '' : 's'} this week${r.cost !== null ? ` (${gbp(r.cost)})` : ''}`
    : 'Nothing binned this week';
  const trend = r.trend !== 'none' && r.binned !== r.lastWeek ? `${r.change} ${TREND[r.trend]}` : TREND[r.trend];
  return (
    <section className="px-5" aria-label="Weekly waste report">
      <Card className="!p-3 space-y-1.5" label="Weekly waste report">
        <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          <Trash2 size={13} /> Waste this week
        </p>
        <p className="text-[0.875rem] font-extrabold">{headline}{trend ? ` · ${trend}` : ''}</p>
        {r.topReason && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Mostly {String(reasonLabel(r.topReason.reason)).toLowerCase()} ({r.topReason.count}).
            {r.repeat ? ` ${r.repeat.name} went ${r.repeat.count} times.` : ''}
          </p>
        )}
        {r.tip && <p className="text-[0.75rem] font-bold">{r.tip}</p>}
      </Card>
    </section>
  );
}
