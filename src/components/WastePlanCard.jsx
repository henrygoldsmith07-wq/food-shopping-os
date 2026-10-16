import { Card, Pill } from './ui.jsx';

const wasteMetric = (value) => value === null || value === undefined ? '—' : `${Math.round(value)}%`;

/** The generator's waste-minimising summary: score, utilisation and what to buy. */
export default function WastePlanCard({ wastePlan }) {
  return (
    <Card className="!p-3 space-y-3" style={{ background: 'var(--card-2)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Waste-minimising plan</p>
          <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {wastePlan.expectedUnusedCount === 0
              ? 'No expected unused ingredients from the known quantities.'
              : `${wastePlan.expectedUnusedCount} ingredient${wastePlan.expectedUnusedCount === 1 ? '' : 's'} may be left over.`}
          </p>
        </div>
        <Pill tone={wastePlan.score >= 80 ? 'good' : wastePlan.score >= 60 ? 'accent' : 'muted'}>{wastePlan.score}/100</Pill>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.pantryUtilisation)}</p>
          <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Pantry</p>
        </div>
        <div>
          <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.perishableUtilisation)}</p>
          <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Perishables</p>
        </div>
        <div>
          <p className="text-[0.9375rem] font-extrabold">{wasteMetric(wastePlan.packUtilisation)}</p>
          <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Packs</p>
        </div>
      </div>
      {wastePlan.purchaseRows?.length > 0 && (
        <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Buy: {wastePlan.purchaseRows.slice(0, 3).map((row) => row.packs
            ? `${row.packs} ${row.packUnit || 'pack'} of ${row.name}`
            : `${row.qty} ${row.name}`).join(' · ')}.
        </p>
      )}
      {wastePlan.recommendations?.length > 0 && (
        <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {wastePlan.recommendations.slice(0, 2).join(' ')}
        </p>
      )}
    </Card>
  );
}
