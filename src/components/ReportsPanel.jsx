import { useMemo, useState } from 'react';
import {
  CalendarDays, Clock, FileDown, Info, Printer, Scale, Target, TriangleAlert,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { prettyDate } from '../lib/utils.js';
import {
  adherenceReport, dailyReport, deficiencyAlerts, monthlyReport, monthlyTrend, timingReport,
  weeklyReport, weightChart,
} from '../lib/reports.js';
import {
  dailyCsv, entriesCsv, measurementsCsv, printableReport, printReport,
} from '../lib/report-export.js';
import { downloadFile } from '../lib/notify.js';
import { Bars, Card, Chip, Meter, Pill, Sparkline } from './ui.jsx';

const VIEWS = [
  ['day', 'Day', CalendarDays],
  ['week', 'Week', Target],
  ['month', 'Month', Scale],
  ['patterns', 'Patterns', Clock],
];

/** Every report leads with how many days it actually saw. */
const Coverage = ({ report }) => (
  <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
    {report.loggedDays} of {report.days} days logged ({report.coverage}%). Averages below are over
    those {report.loggedDays} day{report.loggedDays === 1 ? '' : 's'} only — a blank day is a day
    you didn’t record, not a day you didn’t eat.
  </p>
);

/* ---------- One day ---------- */

function DayView() {
  const app = useApp();
  const report = useMemo(() => dailyReport(app, app.day), [app]);

  if (!report.logged) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Nothing logged today, so there is nothing to report. This page fills itself in from your
          diary and from nowhere else.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{prettyDate(report.date)}</p>
        <p className="mt-0.5 text-[1.5rem] font-extrabold">{app.fmt.energy(report.totals.kcal)}</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {report.entries} item{report.entries === 1 ? '' : 's'}
          {report.first && ` · ${app.fmt.time(report.first)} to ${app.fmt.time(report.last)}`}
        </p>
        <div className="mt-3 space-y-2">
          {report.macros.map((m) => (
            <div key={m.key}>
              <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                <span>{m.label}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {m.key === 'kcal' ? app.fmt.energyValue(m.value).toLocaleString() : m.value}
                  {m.target ? ` / ${m.key === 'kcal' ? app.fmt.energyValue(m.target).toLocaleString() : m.target}` : ''}
                </span>
              </div>
              <Meter value={m.value} max={m.target || m.value || 1} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Where it came from</p>
        {report.byMeal.map((meal) => (
          <div key={meal.key} className="mb-2">
            <div className="flex justify-between text-[0.78125rem] font-bold mb-1">
              <span>{meal.label}</span>
              <span style={{ color: 'var(--muted)' }}>{app.fmt.energy(meal.kcal)} · {meal.share}%</span>
            </div>
            <Meter value={meal.kcal} max={report.totals.kcal || 1} height={4} />
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---------- A period ---------- */

function PeriodView({ report }) {
  const app = useApp();
  const bars = report.series.filter((d) => d.kcal !== null);
  const target = report.macros.find((m) => m.key === 'kcal')?.target || 0;

  if (!report.loggedDays) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          No days logged in this window. There is nothing here to average, so nothing is shown.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{report.label}</p>
        <p className="mt-0.5 text-[1.5rem] font-extrabold">
          {app.fmt.energy(report.avgKcal)} <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>a day</span>
        </p>
        <Coverage report={report} />
        {bars.length > 1 && (
          <div className="mt-3">
            <Bars
              data={bars.map((d) => ({ label: d.date.slice(8), value: d.kcal }))}
              highlight={target || undefined}
              format={(v) => app.fmt.energyValue(v).toLocaleString()}
            />
          </div>
        )}
      </Card>

      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Average against target</p>
        {report.macros.map((m) => (
          <div key={m.key} className="mb-2">
            <div className="flex justify-between text-[0.75rem] font-bold mb-1">
              <span>{m.label}</span>
              <span style={{ color: 'var(--muted)' }}>{m.avg}{m.target ? ` / ${m.target}` : ''}</span>
            </div>
            <Meter value={m.avg} max={m.target || m.avg || 1} />
          </div>
        ))}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-bold text-[0.875rem]">On target</p>
          <Pill tone={report.adherence >= 60 ? 'good' : 'muted'}>{report.adherence}%</Pill>
        </div>
        <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {report.onTargetDays} of {report.loggedDays} logged day{report.loggedDays === 1 ? '' : 's'} landed
          within 10% of {app.fmt.energy(target)}.
          {report.highest && ` Highest ${app.fmt.energy(report.highest.kcal)} on ${report.highest.date}; lowest ${app.fmt.energy(report.lowest.kcal)} on ${report.lowest.date}.`}
        </p>
      </Card>
    </>
  );
}

/* ---------- Month, with the longer view ---------- */

function MonthView() {
  const app = useApp();
  const report = useMemo(() => monthlyReport(app, app.day), [app]);
  const trend = useMemo(() => monthlyTrend(app, { today: app.day }), [app]);
  const weight = useMemo(() => weightChart(app, { today: app.day }), [app]);

  return (
    <>
      <PeriodView report={report} />

      {trend.length > 1 && (
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>Month by month</p>
          {trend.map((m) => (
            <div key={m.label} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
              <div>
                <p className="text-[0.8125rem] font-bold">{m.label}</p>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{m.loggedDays} days logged</p>
              </div>
              <p className="text-[0.84375rem] font-extrabold">{app.fmt.energy(m.avgKcal)}</p>
            </div>
          ))}
          <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Months with nothing logged aren’t listed — an empty month averaged in would drag every
            line towards zero and call it progress.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Scale size={15} /> Weight</p>
          {weight.readings > 0 && <Pill tone="muted">{weight.readings} reading{weight.readings === 1 ? '' : 's'}</Pill>}
        </div>
        {!weight.enough ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {weight.readings === 0
              ? 'No weight readings in the last 90 days. Log one under Health and a line appears here.'
              : 'One reading is a number, not a line. A second one gives this a direction.'}
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[1.375rem] font-extrabold">
              {app.fmt.weight(weight.to)}
              <span className="text-[0.8125rem] font-semibold ml-1.5" style={{ color: 'var(--muted)' }}>
                {weight.change > 0 ? '+' : ''}{weight.change} kg over {weight.readings} readings
              </span>
            </p>
            <div className="mt-2"><Sparkline points={weight.points.map((p) => p.value)} width={280} height={56} /></div>
            <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.fmt.weight(weight.min)} to {app.fmt.weight(weight.max)} across the window.
            </p>
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- Patterns ---------- */

function PatternsView() {
  const app = useApp();
  const timing = useMemo(() => timingReport(app, { today: app.day }), [app]);
  const adherence = useMemo(() => adherenceReport(app, { today: app.day }), [app]);
  const deficiency = useMemo(() => deficiencyAlerts(app, { today: app.day }), [app]);

  return (
    <>
      <Card>
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Clock size={15} /> When you eat</p>
        {!timing.meals.length ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing with a time on it yet. Meal times come from the clock on your own entries.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {timing.meals.map((m) => (
              <div key={m.key} className="flex items-center justify-between">
                <div>
                  <p className="text-[0.8125rem] font-bold">{m.label}</p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    usually {app.fmt.time(m.usualAt)} · {m.days} day{m.days === 1 ? '' : 's'}
                  </p>
                </div>
                <Pill tone={m.regular ? 'good' : 'muted'}>
                  {m.regular ? 'Regular' : `${Math.round(m.spreadMinutes / 60)} h spread`}
                </Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Target size={15} /> Goal adherence</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Over {adherence.loggedDays} logged day{adherence.loggedDays === 1 ? '' : 's'} in the last {adherence.days}.
        </p>
        {!adherence.loggedDays ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>Nothing logged in the window.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {adherence.rows.map((row) => (
              <div key={row.key}>
                <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                  <span>{row.label}</span>
                  <span style={{ color: 'var(--muted)' }}>{row.pct}% within 10%</span>
                </div>
                <Meter value={row.pct} max={100} />
                <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                  {row.under} day{row.under === 1 ? '' : 's'} under · {row.over} over · average {row.avg}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><TriangleAlert size={15} /> Coming up short</p>
        {!deficiency.ready ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{deficiency.reason}</p>
        ) : deficiency.alerts.length === 0 ? (
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing below 70% of its reference across your last {deficiency.loggedDays} logged days.
          </p>
        ) : (
          <>
            <div className="mt-2 space-y-2">
              {deficiency.alerts.map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                    <span>{row.label}</span>
                    <span style={{ color: 'var(--warn)' }}>{row.pct}% of {row.target}{row.unit}</span>
                  </div>
                  <Meter value={row.pct} max={100} color="var(--warn)" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
              <Info size={13} className="mt-0.5 shrink-0" /> {deficiency.caveat}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- Getting it out ---------- */

function ExportCard({ report }) {
  const app = useApp();
  const [said, setSaid] = useState(null);

  const save = (name, built) => {
    if (!built.rows) {
      setSaid('There are no rows to write yet.');
      return;
    }
    const ok = downloadFile(name, built.text, 'text/csv');
    setSaid(ok ? `${built.rows.toLocaleString()} row${built.rows === 1 ? '' : 's'} written to ${name}.` : 'This browser wouldn’t take the file.');
  };

  const print = () => {
    const ok = printReport(printableReport(report, { name: app.name }));
    setSaid(ok
      ? 'Opened in a new tab — choose “Save as PDF” in the print dialogue.'
      : 'Your browser blocked the pop-up. Allow pop-ups for this site and try again.');
  };

  return (
    <Card className="space-y-2.5">
      <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><FileDown size={15} /> Take it with you</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => save('forq-days.csv', dailyCsv(app, { today: app.day }))} className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
          Days CSV
        </button>
        <button onClick={() => save('forq-foods.csv', entriesCsv(app, { today: app.day }))} className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
          Every food CSV
        </button>
        <button onClick={() => save('forq-measurements.csv', measurementsCsv(app))} className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold" style={{ borderColor: 'var(--line)' }}>
          Measurements CSV
        </button>
        <button onClick={print} className="press rounded-2xl border py-2.5 text-[0.78125rem] font-extrabold" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
          <span className="inline-flex items-center gap-1.5"><Printer size={13} /> PDF</span>
        </button>
      </div>
      {said && <p className="text-[0.78125rem] font-semibold">{said}</p>}
      <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        The PDF is your browser’s own — Forq builds a clean printable page and hands it to the print
        dialogue, where “Save as PDF” does the rest. Shipping a PDF library to do that worse isn’t
        a download worth asking you for.
      </p>
    </Card>
  );
}

/**
 * Reports: the diary added up, over whatever span you asked for.
 *
 * Every figure is a sum or an average of what you logged, and every report
 * leads with how many days it actually saw — because an average that hides its
 * own sample size is a number designed to flatter.
 */
export default function ReportsPanel() {
  const app = useApp();
  const [view, setView] = useState('week');
  const week = useMemo(() => weeklyReport(app, app.day), [app]);
  const month = useMemo(() => monthlyReport(app, app.day), [app]);

  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {VIEWS.map(([key, label, Icon]) => (
          <Chip key={key} active={view === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>
      {view === 'day' && <DayView />}
      {view === 'week' && <PeriodView report={week} />}
      {view === 'month' && <MonthView />}
      {view === 'patterns' && <PatternsView />}
      <ExportCard report={view === 'month' ? month : week} />
    </div>
  );
}
