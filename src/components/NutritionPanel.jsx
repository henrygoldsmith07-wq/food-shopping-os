import { useState } from 'react';
import { Check, Info, RotateCcw, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { YOUTH_COPY } from '../lib/youth.js';
import {
  alcoholUnits, nutrientAlerts, nutrientRows, saltEquivalent,
} from '../lib/nutrition.js';
import { NUTRIENT_GROUPS, formatAmount } from '../data/nutrients.js';
import { Card, Meter, Pill, Ring, Section } from './ui.jsx';
import WaterGlasses from './WaterGlasses.jsx';

const TONE_COLOR = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  muted: 'var(--series-1)',
  faint: 'var(--series-3)',
};

/** One nutrient: measured amount, target, coverage — never pretends missing is zero. */
const NutrientRow = ({ row, editing, onTarget }) => (
  <div className="py-2.5">
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-[0.8125rem] font-bold">{row.label}</span>
      {editing ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            value={row.target}
            onChange={(e) => onTarget(row.key, e.target.value)}
            aria-label={`${row.label} target`}
            className="w-20 rounded-xl border px-2 py-1 text-[0.8125rem] font-bold text-right outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
          <span className="text-[0.6875rem] font-bold" style={{ color: 'var(--faint)' }}>{row.unit}</span>
        </span>
      ) : (
        <span className="text-[0.75rem] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
          {formatAmount(row.key, row.value)}
          <span style={{ color: 'var(--faint)' }}> / {formatAmount(row.key, row.target)}</span>
        </span>
      )}
    </div>
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Meter
          value={row.value === null ? 0 : Math.min(row.display, row.target)}
          max={row.target}
          color={TONE_COLOR[row.tone]}
          height={5}
        />
      </div>
      <span className="w-10 text-right text-[0.6875rem] font-bold tabular-nums" style={{ color: TONE_COLOR[row.tone] }}>
        {row.value === null ? '—' : `${row.pct}%`}
      </span>
    </div>
    {(row.estimated > 0 || row.unknownCount > 0) && (
      <p className="mt-1 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
        {row.known > 0 && <>{formatAmount(row.key, row.known)} known</>}
        {row.known > 0 && row.estimated > 0 && ' · '}
        {row.estimated > 0 && <>{formatAmount(row.key, row.estimated)} estimated</>}
        {(row.known > 0 || row.estimated > 0) && row.unknownCount > 0 && ' · '}
        {row.unknownCount > 0 && (
          <>{row.unknownCount} entr{row.unknownCount === 1 ? 'y' : 'ies'} unmeasured</>
        )}
        {' · '}
        {row.confidence} confidence
      </p>
    )}
  </div>
);

/** Water: the eight glasses, plus anything drunk that the diary already knows about. */
const WaterCard = () => {
  const app = useApp();
  const { fromDrinks, fromGlasses, total } = app.hydration;
  const target = app.targets.water;
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Water intake</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {total.toLocaleString()} / {target.toLocaleString()} ml
        </p>
      </div>
      <div className="mt-2.5"><WaterGlasses size={20} /></div>
      <div className="mt-3"><Meter value={total} max={target} height={6} /></div>
      <div className="mt-3 flex gap-2">
        {[250, 500, 750].map((ml) => (
          <button
            key={ml}
            onClick={() => app.addWaterMl(ml)}
            className="press flex-1 rounded-2xl border py-2 text-[0.78125rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            +{ml} ml
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {fromGlasses.toLocaleString()} ml tracked ({app.water} glass{app.water === 1 ? '' : 'es'}
        {app.waterExtraMl ? ` + ${app.waterExtraMl} ml` : ''}) · {fromDrinks.toLocaleString()} ml from
        food and drinks in your diary
      </p>
    </Card>
  );
};

/**
 * The full nutrition picture for today: all 24 tracked nutrients against their
 * daily reference intakes, grouped, with every target editable.
 * Missing nutrient data is shown as unknown — never as zero intake.
 */
export default function NutritionPanel() {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const totals = { ...app.totals, water: app.hydration.total };
  const targets = app.targets;
  const rows = nutrientRows(totals, targets)
    .filter((row) => app.youth.alcohol || row.key !== 'alcohol');
  const alerts = nutrientAlerts(totals, targets);
  const kcal = rows.find((r) => r.key === 'kcal');
  const units = alcoholUnits(totals.alcohol);
  const salt = saltEquivalent(totals.sodium);
  const saltTarget = saltEquivalent(targets.sodium);
  const quality = app.totals.dataQuality || app.coverage;

  return (
    <div className="px-5 pb-10 space-y-5">
      {/* Headline */}
      <Card>
        <div className="flex items-center gap-5">
          <Ring
            value={totals.kcal}
            max={targets.kcal}
            size={86}
            stroke={9}
            color="var(--series-2)"
            label={totals.kcal.toLocaleString()}
            sub={`of ${targets.kcal.toLocaleString()}`}
          />
          <div className="flex-1 space-y-1.5">
            <p className="text-[0.8125rem] font-bold">
              {kcal?.value === null ? 'No measured energy yet' : `${kcal.pct}% of your energy target`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="good"><Check size={11} strokeWidth={3} /> {alerts.hit.length} targets hit</Pill>
              {alerts.over.length > 0 && (
                <Pill tone="danger"><TriangleAlert size={11} /> {alerts.over.length} over limit</Pill>
              )}
              {alerts.low.length > 0 && <Pill tone="warn">{alerts.low.length} running low</Pill>}
            </div>
          </div>
        </div>
        {(alerts.over.length > 0 || alerts.low.length > 0) && (
          <p className="mt-3 pt-3 border-t text-[0.78125rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
            {alerts.over.length > 0 && <>Over: {alerts.over.map((r) => r.label).join(', ')}. </>}
            {alerts.low.length > 0 && <>Short on: {alerts.low.slice(0, 4).map((r) => r.label).join(', ')}.</>}
          </p>
        )}
      </Card>

      {/* Data quality — known vs estimated vs unknown */}
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Nutrient data quality
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[0.75rem] font-semibold">
          <div>
            <p style={{ color: 'var(--faint)' }}>Known amount</p>
            <p className="font-bold">{(quality.knownAmount ?? 0).toLocaleString()} kcal</p>
          </div>
          <div>
            <p style={{ color: 'var(--faint)' }}>Estimated amount</p>
            <p className="font-bold">{(quality.estimatedAmount ?? 0).toLocaleString()} kcal</p>
          </div>
          <div>
            <p style={{ color: 'var(--faint)' }}>Data coverage</p>
            <p className="font-bold">{quality.coverage ?? app.coverage.pct}%</p>
          </div>
          <div>
            <p style={{ color: 'var(--faint)' }}>Confidence</p>
            <p className="font-bold capitalize">{quality.confidence || app.coverage.confidence || '—'}</p>
          </div>
        </div>
        {(quality.unknownEntries > 0 || app.coverage.unknownEntries > 0) && (
          <p className="mt-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {quality.unknownEntries ?? app.coverage.unknownEntries} diary entr
            {(quality.unknownEntries ?? app.coverage.unknownEntries) === 1 ? 'y has' : 'ies have'} no measured energy —
            unknown amount is not counted as zero.
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Salt equivalent</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Converted from tracked sodium</p>
          </div>
          <p className="text-[0.8125rem] font-bold tabular-nums">{salt} g / {saltTarget} g</p>
        </div>
        <div className="mt-2">
          <Meter
            value={Math.min(salt, saltTarget)}
            max={saltTarget}
            color={salt > saltTarget ? 'var(--danger)' : 'var(--series-1)'}
            height={5}
          />
        </div>
      </Card>

      {/* Honesty about where the numbers come from */}
      <div className="flex items-start gap-2 rounded-2xl border p-3" style={{ borderColor: 'var(--line)' }}>
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--faint)' }} />
        <p className="text-[0.71875rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
          Micronutrients are carried by {app.coverage.pct}% of today’s measured calories.
          Missing fields stay unknown — they are never treated as zero. Quick-adds only
          contribute the macros you typed.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setEditing((v) => !v)}
          className="press flex-1 rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
          style={editing
            ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' }
            : { borderColor: 'var(--line)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal size={14} /> {editing ? 'Done editing targets' : 'Edit daily targets'}
          </span>
        </button>
        {editing && (
          <button
            onClick={app.resetTargets}
            aria-label="Reset targets"
            className="press rounded-2xl border px-4"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            <RotateCcw size={15} />
          </button>
        )}
      </div>

      {NUTRIENT_GROUPS.map((group) => (
        <Section key={group.id} title={group.label} className="!px-0">
          {group.id === 'other' && <div className="mb-3"><WaterCard /></div>}
          <Card className="!py-2">
            {rows.filter((r) => r.group === group.id).map((row) => (
              <NutrientRow
                key={row.key}
                row={row}
                editing={editing}
                onTarget={app.setTarget}
              />
            ))}
            {group.id === 'other' && app.youth.alcohol && totals.alcohol > 0 && (
              <p className="pb-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {units} UK unit{units === 1 ? '' : 's'} today · guidance is under 14 a week.
              </p>
            )}
            {group.id === 'other' && app.youth.on && (
              <p className="pb-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {YOUTH_COPY.caffeine}
              </p>
            )}
          </Card>
        </Section>
      ))}
    </div>
  );
}
