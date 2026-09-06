import { X } from 'lucide-react';
import { Card } from './ui.jsx';

/**
 * Tonight's picker opened onto a filled dinner slot. Before any dish can be
 * picked, the existing dinner is surfaced and the user chooses: replace it,
 * or keep it and back out. A casual tap on a prediction row must never
 * silently overwrite an already-planned meal.
 */
export default function TonightSlotGuard({ existing, item = '', onReplace, onKeep }) {
  return (
    <div className="px-5 pb-10 space-y-3">
      <Card className="!p-4 space-y-3 text-center">
        <p className="text-[0.75rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>
          Tonight's dinner is already set
        </p>
        <p className="text-[1.0625rem] font-extrabold leading-snug">{existing}</p>
        <p className="text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          {item ? <>You came to plan something with <span className="font-extrabold" style={{ color: 'var(--ink)' }}>{item}</span>.</> : null}{' '}
          Picking a dish will replace {existing} — or keep it and plan for another night.
        </p>
        <button
          type="button"
          onClick={onReplace}
          className="press w-full rounded-2xl py-3 text-[0.84375rem] font-extrabold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Replace with something else
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          <span className="inline-flex items-center gap-1.5"><X size={14} /> Keep {existing}</span>
        </button>
      </Card>
    </div>
  );
}
