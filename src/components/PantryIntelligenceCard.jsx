import { useApp } from '../lib/store.jsx';
import { Card, Pill, Section } from './ui.jsx';

/**
 * The pantry's explainable position: what to use first, what needs buying, and
 * the evidence counts behind both. Renders nothing on an empty pantry — the
 * empty state already owns that screen — and lives in its own file so
 * PantryView stays inside the line boundary.
 */
export default function PantryIntelligenceCard({ onPlanItem } = {}) {
  const app = useApp();
  if (!app.pantry?.length) return null;
  const intelligence = app.pantryIntelligence || {};
  const useFirst = intelligence.useFirst || [];
  const buyingNeeds = intelligence.needsBuying || [];
  const pantryRestockNeeds = buyingNeeds.filter((row) => row.source === 'pantry');
  const wastePrediction = app.wastePrediction || {};
  const predictedWaste = wastePrediction.items || [];

  return (
    <Section title="Pantry intelligence" className="!px-0" aria-label="Pantry intelligence">
      <Card className="!p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [intelligence.stock?.total ?? app.pantry.length, 'tracked'],
            [useFirst.length, 'use first'],
            [buyingNeeds.length, 'need buying'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-xl px-2 py-2" style={{ background: 'var(--card-2)' }}>
              <p className="text-[1rem] font-extrabold">{value}</p>
              <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
            </div>
          ))}
        </div>
        {useFirst.length > 0 && (
          <div>
            <p className="text-[0.71875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>Use first</p>
            <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {useFirst.slice(0, 4).map((row) => row.item.name).join(' · ')}{useFirst.length > 4 ? ' · …' : ''}
            </p>
          </div>
        )}
        {predictedWaste.length > 0 && (
          <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.71875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--warn)' }}>Likely to go unused</p>
              <Pill tone={wastePrediction.highRisk > 0 ? 'warn' : 'muted'}>{predictedWaste.length}</Pill>
            </div>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{wastePrediction.summary}</p>
            <div className="space-y-1">
              {predictedWaste.slice(0, 3).map((row) => {
                const risk = row.likelihood === 'high' ? 'High risk' : 'Watch';
                const tone = row.likelihood === 'high' ? 'var(--warn)' : 'var(--muted)';
                // The row's advice is "plan a meal using this item" — with a
                // planner in reach it becomes the action: a tap hands the item
                // over so the generator can favour dishes that use it.
                const inner = (
                  <>
                    <span className="min-w-0 truncate">{row.name} · {row.qty}</span>
                    <span className="shrink-0 flex items-center gap-1" style={{ color: tone }}>
                      {risk}{onPlanItem ? <span aria-hidden="true">→</span> : null}
                    </span>
                  </>
                );
                return onPlanItem
                  ? (
                    <button
                      key={`${row.key}-${row.date || 'pack'}`}
                      type="button"
                      onClick={() => onPlanItem(row.name)}
                      aria-label={`Plan a meal using ${row.name}`}
                      className="press flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[0.75rem] font-bold"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      {inner}
                    </button>
                  )
                  : (
                    <div key={`${row.key}-${row.date || 'pack'}`} className="flex items-center justify-between gap-2 text-[0.75rem] font-bold">
                      {inner}
                    </div>
                  );
              })}
            </div>
            <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--accent)' }}>{predictedWaste[0].action}</p>
          </div>
        )}
        {buyingNeeds.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <p className="text-[0.71875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Needs buying</p>
            <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {buyingNeeds.slice(0, 4).map((row) => `${row.name}${row.qty ? ` · ${row.qty}` : ''}`).join(' · ')}{buyingNeeds.length > 4 ? ' · …' : ''}
            </p>
            {pantryRestockNeeds.length > 0 && (
              <button
                type="button"
                onClick={() => app.addToList(pantryRestockNeeds.map((row) => ({
                  name: row.name,
                  emoji: row.item?.emoji,
                  qty: row.qty,
                })))}
                className="press mt-2 rounded-xl border px-3 py-2 text-[0.71875rem] font-extrabold"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Add {pantryRestockNeeds.length} low item{pantryRestockNeeds.length === 1 ? '' : 's'} to the list
              </button>
            )}
          </div>
        )}
        {!useFirst.length && !buyingNeeds.length && (
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing needs using or buying from the evidence recorded so far.
          </p>
        )}
      </Card>
    </Section>
  );
}
