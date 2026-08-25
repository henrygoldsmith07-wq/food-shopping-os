import { useMemo, useState } from 'react';
import { Apple, CalendarRange, TriangleAlert } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { weekDates } from '../lib/kitchen.js';
import {
  dailyMicroReport, deficiencyAdvice, MICRO_GROUPS, statusLabel, topDeficiencies, weeklyMicroTrend,
} from '../lib/micronutrition.js';
import { formatAmount } from '../data/nutrients.js';
import { Card, Meter, Pill, Section } from './ui.jsx';
import { Glyph } from './icons.jsx';

const toneColour = (tone) => ({
  good: 'var(--good)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  faint: 'var(--faint)',
  muted: 'var(--muted)',
}[tone] || 'var(--accent)');

/** One nutrient today: what was eaten, against the reference intake. */
const MicroRow = ({ row }) => (
  <div className="py-2">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[0.8125rem] font-bold truncate">{row.label}</span>
      <span className="shrink-0 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {row.value === null ? '—' : formatAmount(row.key, row.value)}
        <span style={{ color: 'var(--faint)' }}> / {formatAmount(row.key, row.target)}</span>
      </span>
    </div>
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1">
        <Meter value={row.pct} max={100} color={toneColour(row.tone)} height={5} />
      </div>
      <span className="w-14 shrink-0 text-right text-[0.6875rem] font-bold" style={{ color: toneColour(row.tone) }}>
        {row.value === null ? 'no data' : `${row.pct}%`}
      </span>
    </div>
    {row.status === 'excess' && (
      <p className="mt-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--danger)' }}>
        Past the {formatAmount(row.key, row.upper)} upper level for a day.
      </p>
    )}
  </div>
);

/** A gap, and the food that would close it. Food only — never a supplement. */
const GapCard = ({ gap }) => (
  <Card className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <p className="font-extrabold text-[0.9375rem]">{gap.label}</p>
      <Pill tone={gap.tone}>{statusLabel(gap.status)} · {gap.pct}%</Pill>
    </div>
    <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
      {deficiencyAdvice(gap)}
    </p>
    {gap.shortDays > 1 && (
      <p className="text-[0.71875rem] font-bold" style={{ color: 'var(--warn)' }}>
        Short on {gap.shortDays} logged days this week.
      </p>
    )}
    {gap.sources.length > 0 && (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {gap.sources.map((source) => (
          <span
            key={source.id}
            className="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[0.71875rem] font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}
          >
            <Glyph e={source.emoji} size={14} style={{ color: 'var(--muted)' }} />
            {source.name}
            <span style={{ color: 'var(--accent)' }}>+{source.pct}%</span>
          </span>
        ))}
      </div>
    )}
  </Card>
);

/** Days of the week as a bar per day; an unlogged day is a gap, not a zero. */
const TrendRow = ({ nutrient }) => (
  <div className="py-2">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[0.8125rem] font-bold truncate">{nutrient.label}</span>
      <span className="shrink-0 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {nutrient.average === null
          ? 'nothing logged'
          : `${nutrient.averagePct}% average · short ${nutrient.shortDays}/${nutrient.loggedDays}`}
      </span>
    </div>
    <div className="mt-1.5 flex items-end gap-1" style={{ height: 26 }}>
      {nutrient.series.map((pct, index) => (
        <div
          key={nutrient.key + index}
          className="flex-1 rounded-t"
          title={pct === null ? 'nothing logged' : `${pct}% of the reference intake`}
          style={{
            height: pct === null ? 3 : `${Math.max(6, Math.min(100, pct))}%`,
            background: pct === null
              ? 'var(--line)'
              : pct >= 100 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)',
            opacity: pct === null ? 0.6 : 1,
          }}
        />
      ))}
    </div>
  </div>
);

/**
 * The deep micronutrient view: today against the reference intakes, the week's
 * recurring gaps, and the three worth doing something about.
 *
 * Every suggestion is a food you could buy and cook. Nothing here recommends a
 * supplement, and nothing treats "not logged" as "not eaten".
 */
export default function MicronutrientPanel() {
  const app = useApp();
  const [tab, setTab] = useState('today');

  const report = useMemo(
    () => dailyMicroReport(app.entries, app.targets),
    [app.entries, app.targets],
  );
  const trend = useMemo(
    () => weeklyMicroTrend(app.log, weekDates(app.day), app.targets),
    [app.log, app.day, app.targets],
  );
  // A recipe the household can't eat is not a suggestion — the same rules that
  // hide a recipe hide the food behind it.
  const excluded = useMemo(() => {
    const blocked = app.suitabilityFor;
    if (!blocked) return () => false;
    return (food) => blocked({ name: food.name, ingredients: [{ name: food.name }] })?.allowed === false;
  }, [app.suitabilityFor]);

  const gaps = useMemo(
    () => topDeficiencies(report, { trend, exclude: excluded, targets: app.targets }),
    [report, trend, excluded, app.targets],
  );

  return (
    <div className="px-5 pb-10 space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="good">{report.met.length} at target</Pill>
          {report.deficient.length > 0 && <Pill tone="danger">{report.deficient.length} well short</Pill>}
          {report.low.length > 0 && <Pill tone="warn">{report.low.length} a little short</Pill>}
          {report.excess.length > 0 && (
            <Pill tone="danger"><TriangleAlert size={11} /> {report.excess.length} over an upper level</Pill>
          )}
          {report.unmeasured.length > 0 && <Pill tone="faint">{report.unmeasured.length} not measured</Pill>}
        </div>
        <p className="mt-2.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {report.entryCount === 0
            ? 'Nothing logged today yet, so there is nothing to read. A blank diary is not a deficiency.'
            : 'Measured against adult UK/EU reference intakes. A nutrient no logged food reports reads as not measured, never as zero.'}
        </p>
      </Card>

      <div className="flex gap-2">
        {[['today', 'Today'], ['week', 'This week'], ['all', 'Every nutrient']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="press flex-1 rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold"
            style={tab === key
              ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }
              : { borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <Section title="Worth eating for" className="!px-0">
          {gaps.length === 0 ? (
            <Card>
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {report.entryCount === 0
                  ? 'Log a meal and the gaps worth closing will show up here with the food that closes them.'
                  : 'Nothing measured today fell short of its reference intake. Nothing to chase.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {gaps.map((gap) => <GapCard key={gap.key} gap={gap} />)}
              <p className="px-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                <Apple size={11} className="inline" /> Food sources only, ranked by an ordinary serving.
                Forq does not recommend supplements.
              </p>
            </div>
          )}
        </Section>
      )}

      {tab === 'week' && (
        <Section title={`Across the week · ${trend.loggedDays} day${trend.loggedDays === 1 ? '' : 's'} logged`} className="!px-0">
          {trend.loggedDays === 0 ? (
            <Card>
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Nothing logged this week yet. Trends need days behind them.
              </p>
            </Card>
          ) : (
            <>
              {trend.persistentGaps.length > 0 && (
                <Card className="mb-3">
                  <p className="flex items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                    <CalendarRange size={13} /> Keeps coming back
                  </p>
                  <p className="mt-1.5 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {trend.persistentGaps.slice(0, 4).map((n) => `${n.label} (${n.shortDays} of ${n.loggedDays} days)`).join(', ')}.
                  </p>
                </Card>
              )}
              <Card className="!py-2">
                {trend.nutrients.map((nutrient) => (
                  <TrendRow key={nutrient.key} nutrient={nutrient} />
                ))}
              </Card>
            </>
          )}
        </Section>
      )}

      {tab === 'all' && MICRO_GROUPS.map((group) => (
        <Section key={group.id} title={group.label} className="!px-0">
          <Card className="!py-2">
            {report.rows.filter((row) => group.keys.includes(row.key)).map((row) => (
              <MicroRow key={row.key} row={row} />
            ))}
          </Card>
        </Section>
      ))}
    </div>
  );
}
