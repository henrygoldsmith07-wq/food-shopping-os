import { Check } from 'lucide-react';
import { Meter } from './ui.jsx';

export default function ShoppingProgress({ total, checked }) {
  const percent = total ? Math.round((checked / total) * 100) : 0;
  const done = total > 0 && checked === total;

  return (
    <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: done ? 'var(--good)' : 'var(--line)', background: 'var(--card-2)' }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Shopping progress</p>
        <p className="text-[0.75rem] font-extrabold tabular-nums" style={{ color: done ? 'var(--good)' : 'var(--ink)' }}>{checked}/{total}</p>
      </div>
      <div
        role="progressbar"
        aria-label="Shopping progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percent}
        aria-valuetext={`${checked} of ${total} items checked, ${percent}% complete`}
        className="mt-2"
      >
        <Meter value={checked} max={Math.max(total, 1)} color={done ? 'var(--good)' : 'var(--accent)'} height={7} />
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: done ? 'var(--good)' : 'var(--muted)' }}>
        {done ? <><Check size={13} /> Everything is ticked — finish when you’re ready.</> : `${percent}% complete`}
      </p>
    </div>
  );
}
