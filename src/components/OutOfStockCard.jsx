import { PackageX } from 'lucide-react';
import { outOfStockLine, outOfStockRows, substituteChoices } from '../lib/out-of-stock.js';

/** In-store card: each missing item with one-tap substitutes or "keep for next shop". */
export default function OutOfStockCard({ list, verifiedFor = () => [], onSwap, onClear }) {
  const rows = outOfStockRows(list);
  if (!rows.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {rows.map((row) => {
        const choices = substituteChoices(row, verifiedFor(row));
        return (
          <div key={row.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--warn)', background: 'var(--card-2)' }}>
            <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-bold"><PackageX size={14} /> {outOfStockLine(row)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {choices.map((option) => (
                <button key={option.name} type="button" onClick={() => onSwap(row.id, option)} className="press rounded-xl px-3 py-2 text-[0.75rem] font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  Swap for {option.name}
                </button>
              ))}
              <button type="button" onClick={() => onClear(row.id)} className="press rounded-xl border px-3 py-2 text-[0.75rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
                Keep for next shop
              </button>
            </div>
            {!choices.length && <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>No verified substitute for this one.</p>}
          </div>
        );
      })}
    </div>
  );
}
