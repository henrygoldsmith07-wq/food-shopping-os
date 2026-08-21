import { useMemo, useState } from 'react';
import {
  Activity, Beaker, Droplets, Info, Leaf, ListChecks, Timer, Upload,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { prettyDate } from '../lib/utils.js';
import {
  CAPABILITIES, REGISTER_INTRO, STATUS_LABELS,
} from '../data/capabilities.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { FOOTPRINT_CAVEAT, FOOTPRINT_SOURCE, UK_DAILY_AVERAGE_CO2 } from '../data/sustainability.js';
import { BLOOD_CAVEAT, BLOOD_MARKERS, bloodCategory } from '../data/health.js';
import { equivalents } from '../lib/footprint.js';
import { optimiseMicros } from '../lib/micro-optimise.js';
import { currentFast, FAST_PLANS } from '../lib/fasting.js';
import { dayResponses, daySummary, importSpan, parseCgmCsv } from '../lib/cgm.js';
import { adherenceReport } from '../lib/reports.js';
import { YOUTH_COPY } from '../lib/youth.js';
import { Card, Chip, Meter, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';
import { NumberField } from './FoodDetail.jsx';

const VIEWS = [
  ['planet', 'Planet', Leaf],
  ['micros', 'Gaps', ListChecks],
  ['fasting', 'Fasting', Timer],
  ['results', 'Results', Beaker],
  ['register', 'What it can’t', Info],
];

/* ---------- Footprint ---------- */

function PlanetView() {
  const app = useApp();
  const report = app.footprint;
  const swaps = app.footprintSwaps;

  if (!report.loggedDays) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Nothing logged this week, so there is no footprint to compute. This reads the grams in
          your diary — it doesn’t estimate a diet for you.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Your food, this week</p>
        <p className="mt-0.5 text-[1.5rem] font-extrabold">
          {report.perDay} <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>kg CO₂e a day</span>
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Pill tone={report.tone}>{report.band}</Pill>
          <span className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {report.vsAverage}% of the UK average ({UK_DAILY_AVERAGE_CO2} kg)
          </span>
        </div>
        <p className="mt-1.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Over {report.loggedDays} logged day{report.loggedDays === 1 ? '' : 's'}, from{' '}
          <strong>{report.coverage}% of what you logged</strong> — {report.unmatched} item
          {report.unmatched === 1 ? '' : 's'} the table couldn’t place {report.unmatched === 1 ? 'is' : 'are'} left out
          rather than counted as nothing.
        </p>
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Water: {report.water.toLocaleString()} litres. Roughly{' '}
          {equivalents(report.co2).map((e) => `${e.amount.toLocaleString()} ${e.label}`).join(', ')}.
        </p>
      </Card>

      {report.byCategory.length > 0 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>What’s driving it</p>
          {report.byCategory.slice(0, 6).map((row) => (
            <div key={row.id} className="mb-2">
              <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                <span>{row.label}</span>
                <span style={{ color: 'var(--muted)' }}>{row.co2} kg · {(row.grams / 1000).toFixed(1)} kg food</span>
              </div>
              <Meter value={row.co2} max={report.co2 || 1} height={4} />
            </div>
          ))}
        </Card>
      )}

      {swaps.length > 0 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--faint)' }}>What would move it</p>
          {swaps.map((swap) => (
            <p key={swap.line} className="text-[0.8125rem] font-semibold mb-1">
              {swap.line} — <strong>{swap.saved} kg</strong> off the week
              <span style={{ color: 'var(--faint)' }}> ({swap.share}% of your total comes from it)</span>
            </p>
          ))}
        </Card>
      )}

      <Card className="!p-3">
        <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
          <Info size={13} className="mt-0.5 shrink-0" /> {FOOTPRINT_CAVEAT}
        </p>
        <p className="mt-1.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>Source: {FOOTPRINT_SOURCE}</p>
      </Card>
    </>
  );
}

/* ---------- Micronutrient gaps ---------- */

function MicrosView() {
  const app = useApp();
  const result = useMemo(() => {
    const report = adherenceReport(app, { today: app.day });
    const averages = {};
    // Averages over the logged days only, the same rule the reports use.
    const dates = Object.keys(app.log).filter((d) => (app.log[d] || []).length);
    for (const key of Object.keys(app.targets)) {
      const totals = dates.map((d) => (app.log[d] || []).reduce(
        (sum, e) => sum + ((Number(e.per100?.[key]) || 0) * (Number(e.grams) || 0)) / 100, 0,
      ));
      averages[key] = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    }
    return optimiseMicros(averages, app.targets, app.catalogue, {
      prefs: app.prefs, minDays: 5, loggedDays: report.loggedDays,
    });
  }, [app]);

  if (!result.ready) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{result.reason}</p>
      </Card>
    );
  }
  if (!result.picks.length) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{result.reason}</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Running short on</p>
        {result.gaps.slice(0, 6).map((gap) => (
          <div key={gap.key} className="mb-2">
            <div className="flex justify-between text-[0.75rem] font-bold mb-1">
              <span>{gap.label}</span>
              <span style={{ color: 'var(--warn)' }}>{gap.pct}% of {gap.need}{gap.unit}</span>
            </div>
            <Meter value={gap.pct} max={100} color="var(--warn)" />
          </div>
        ))}
      </Card>

      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
          What would close the most of it
        </p>
        {result.picks.map((pick) => (
          <div key={pick.id} className="mb-2.5 rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
            <p className="text-[0.84375rem] font-extrabold inline-flex items-center gap-1.5">
              <Glyph e={pick.emoji || '🍽️'} size={14} /> {pick.name}
              <span className="font-semibold" style={{ color: 'var(--muted)' }}>· {pick.grams} g</span>
            </p>
            <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {pick.closes.map((c) => `${c.pctOfGap}% of your ${c.label.toLowerCase()} gap`).join(' · ')}
            </p>
          </div>
        ))}
        {result.stillShort.length > 0 && (
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Still short after all of those: {result.stillShort.map((s) => `${s.label} (${s.left}${s.unit})`).join(', ')}.
          </p>
        )}
      </Card>

      <p className="text-[0.75rem] font-semibold px-1 inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
        <Info size={13} className="mt-0.5 shrink-0" /> {result.caveat}
      </p>
    </>
  );
}

/* ---------- Fasting ---------- */

function FastingView() {
  const app = useApp();
  const summary = app.fasting;
  const running = currentFast(app.fast);

  return (
    <>
      <Card className="space-y-2.5">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          {running.running ? 'Fasting now' : 'Start a fast'}
        </p>
        {running.running ? (
          <>
            <p className="text-[1.625rem] font-extrabold">{running.label}</p>
            {running.target && (
              <>
                <Meter value={running.pct} max={100} />
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {running.done ? `Past your ${running.target} hours.` : `${running.pct}% of ${running.target} hours.`}
                </p>
              </>
            )}
            <button
              onClick={app.endFast}
              className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              End the fast
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {FAST_PLANS.map((p) => (
                <Chip key={p.id} active={app.fastPlan === p.id} onClick={() => app.setFastPlan(p.id)}>{p.label}</Chip>
              ))}
            </div>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {FAST_PLANS.find((p) => p.id === app.fastPlan)?.blurb}. A window you chose — Forq isn’t
              recommending one.
            </p>
            <button
              onClick={() => app.startFast(app.fastPlan)}
              className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Start now
            </button>
          </>
        )}
      </Card>

      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>From your diary</p>
        {!summary.ready ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{summary.reason}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[1.375rem] font-extrabold">
              {summary.avgHours} h <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>overnight, on average</span>
            </p>
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {summary.shortest}–{summary.longest} h across {summary.nights} night{summary.nights === 1 ? '' : 's'} the diary can bound
              {summary.target ? ` · ${summary.met} reached ${summary.target} h` : ''}
            </p>
            <div className="mt-2 space-y-1">
              {summary.history.slice(0, 5).map((f) => (
                <p key={f.date} className="text-[0.78125rem] font-semibold">
                  {prettyDate(f.date)} · <span style={{ color: 'var(--muted)' }}>{f.from} to {f.to} — {f.hours} h</span>
                </p>
              ))}
            </div>
            <p className="mt-2 text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
              <Info size={13} className="mt-0.5 shrink-0" /> {summary.caveat}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- Bloods and CGM ---------- */

function BloodsCard() {
  const app = useApp();
  const [values, setValues] = useState({});
  const latest = app.bloods[app.bloods.length - 1];

  const save = () => {
    app.addBloods({ values });
    setValues({});
  };

  return (
    <Card className="space-y-3">
      <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Beaker size={15} /> Blood results</p>
      <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        No lab has an API a web page can call, so nothing is fetched — you type in what your report
        says, and it’s banded and kept so you can see a trend.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {BLOOD_MARKERS.map((m) => (
          <NumberField
            key={m.key}
            label={`${m.label} (${m.unit})`}
            value={values[m.key] ?? ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [m.key]: v }))}
            step={0.1}
          />
        ))}
      </div>
      <button
        onClick={save}
        disabled={!Object.values(values).some((v) => Number(v) > 0)}
        className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Save this panel
      </button>

      {latest && (
        <div className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--faint)' }}>
            {prettyDate(latest.date)}
          </p>
          {Object.entries(latest.values).map(([key, value]) => {
            const band = bloodCategory(key, value);
            return (
              <div key={key} className="flex items-center justify-between py-0.5">
                <span className="text-[0.78125rem] font-semibold">{BLOOD_MARKERS.find((m) => m.key === key)?.label}</span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-[0.78125rem] font-bold">{value}</span>
                  {band && <Pill tone={band.tone}>{band.label}</Pill>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
        <Info size={13} className="mt-0.5 shrink-0" /> {BLOOD_CAVEAT}
      </p>
    </Card>
  );
}

function GlucoseCard() {
  const app = useApp();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const span = importSpan(app.glucose);
  const today = daySummary(app.glucose, app.day);
  const responses = useMemo(() => dayResponses(app.glucose, app.log, app.day), [app.glucose, app.log, app.day]);

  return (
    <Card className="space-y-3">
      <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Droplets size={15} /> Glucose</p>
      <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
        Dexcom and Libre use vendor OAuth APIs that Forq’s backend does not currently integrate with.
        Import their CSV instead and the trace gets lined up against what you logged eating. {PRIVACY_COPY.cgm}
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
        rows={4}
        placeholder="Device Timestamp,Historic Glucose mmol/L"
        aria-label="Glucose export"
        className="w-full rounded-2xl border px-3 py-2.5 text-[0.75rem] font-mono outline-none"
        style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <div className="flex gap-2">
        <button
          onClick={() => setResult(parseCgmCsv(text))}
          disabled={!text.trim()}
          className="press flex-1 rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Read it</span>
        </button>
        {span.days > 0 && (
          <button onClick={app.clearGlucose} className="press rounded-2xl border px-4 py-2.5 text-[0.8125rem] font-extrabold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
            Clear
          </button>
        )}
      </div>

      {result?.error && <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--danger)' }}>{result.error}</p>}
      {result?.readings?.length > 0 && (
        <>
          <p className="text-[0.8125rem] font-semibold">
            {result.readings.length.toLocaleString()} readings
            {result.skipped > 0 && `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped`}.
          </p>
          <button
            onClick={() => { app.importGlucose(result.readings); setResult(null); setText(''); }}
            className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Add them
          </button>
        </>
      )}

      {span.days > 0 && (
        <div className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
          <p className="text-[0.78125rem] font-semibold">
            {span.readings.toLocaleString()} readings across {span.days} day{span.days === 1 ? '' : 's'} ({span.from} to {span.to}).
          </p>
          {today.readings > 0 && (
            <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Today: average {today.avg}, range {today.min}–{today.max} mmol/L, {today.coverage}% of the day covered.
            </p>
          )}
        </div>
      )}

      {responses.length > 0 && (
        <>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Around today’s meals</p>
          {responses.map((r) => (
            <p key={`${r.time}-${r.name}`} className="text-[0.78125rem] font-semibold">
              {r.time} {r.name} · <span style={{ color: 'var(--muted)' }}>
                {r.baseline} → {r.peak} mmol/L, peak {r.peakAfterMinutes} min after
              </span>
            </p>
          ))}
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Reported, not graded. Glucose responses are individual and vary day to day — a rise after
            eating is what eating does, and Forq isn’t going to call a food good or bad from one.
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------- The register ---------- */

function RegisterView() {
  const [filter, setFilter] = useState('all');
  const shown = CAPABILITIES.filter((c) => filter === 'all' || c.status === filter);

  return (
    <>
      <p className="text-[0.78125rem] font-semibold px-1" style={{ color: 'var(--muted)' }}>{REGISTER_INTRO}</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[['all', 'Everything'], ...Object.entries(STATUS_LABELS).map(([k, v]) => [k, v.label])].map(([key, label]) => (
          <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>{label}</Chip>
        ))}
      </div>
      {shown.map((c) => (
        <Card key={c.id} className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-[0.875rem]">{c.name}</p>
            <Pill tone={STATUS_LABELS[c.status].tone}>{STATUS_LABELS[c.status].label}</Pill>
          </div>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{c.detail}</p>
          {c.instead && (
            <p className="text-[0.78125rem] font-semibold rounded-2xl p-2.5" style={{ background: 'var(--card-2)' }}>
              <span className="font-extrabold">Instead: </span>{c.instead}
            </p>
          )}
        </Card>
      ))}
    </>
  );
}

/**
 * The advanced surfaces, and the register of what this app won't pretend to do.
 *
 * Everything on the first four tabs is computed from your own records or from
 * a file you imported. The last tab is the part most apps leave out: the list
 * of things a browser cannot do, and the one thing that could be built and
 * shouldn't be.
 */
export default function AdvancedPanel() {
  const app = useApp();
  const [view, setView] = useState('planet');
  // Under 18 fasting isn't a tab you can reach, not a tab that says no.
  const views = app.youth.fasting ? VIEWS : VIEWS.filter(([key]) => key !== 'fasting');
  const current = views.some(([key]) => key === view) ? view : 'planet';
  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {views.map(([key, label, Icon]) => (
          <Chip key={key} active={current === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>
      {current === 'planet' && <PlanetView />}
      {current === 'micros' && <MicrosView />}
      {current === 'fasting' && app.youth.fasting && <FastingView />}
      {current === 'results' && <><BloodsCard /><GlucoseCard /></>}
      {current === 'register' && <RegisterView />}
      {!app.youth.fasting && (
        <p className="px-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {YOUTH_COPY.fasting}
        </p>
      )}
    </div>
  );
}
