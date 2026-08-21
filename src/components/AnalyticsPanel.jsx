import { useState } from 'react';
import {
  Apple, Banknote, CalendarDays, Gauge, Leaf, Package, ShoppingCart, Store, Tag, Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  calendarAnalyticsReport, carbonAnalytics, nutritionAnalytics, pantryDashboard,
  measurementAnalytics, shoppingAnalytics, wasteAnalytics,
} from '../lib/analytics.js';
import { gbp } from '../lib/utils.js';
import { ANALYTICS_VIEW_TOOL } from '../data/optionalTools.js';
import { Bars, Card, Chip, Meter, Pill } from './ui.jsx';

const VIEWS = [
  ['spend', 'Spend', Banknote],
  ['nutrition', 'Nutrition', Apple],
  ['pantry', 'Pantry', Package],
  ['waste', 'Waste', Trash2],
  ['habits', 'Habits', ShoppingCart],
  ['measurement', 'Measurement', Gauge],
  ['impact', 'Impact', Leaf],
  ['reports', 'Reports', CalendarDays],
];

const NUTRIENT_LABELS = {
  kcal: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fibre: 'Fibre',
};

const Stat = ({ label, value, detail }) => (
  <Card className="!p-3">
    <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
    <p className="mt-0.5 text-[1.1875rem] font-extrabold">{value}</p>
    {detail && <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{detail}</p>}
  </Card>
);

const Empty = ({ children }) => (
  <Card className="py-8 text-center">
    <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>{children}</p>
  </Card>
);

function SpendingView({ report }) {
  const months = report.monthly.slice(-6);
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Spending dashboard</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Only completed shops you recorded are counted.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="This month" value={gbp(report.spent.month, { always: true })} />
        <Stat label="This year" value={gbp(report.spent.year, { always: true })} />
        <Stat label="Avg basket" value={report.trips ? gbp(report.averageBasket, { always: true }) : '—'} />
      </div>
      {report.trips ? (
        <>
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Monthly spend</p>
            <Bars data={months.map((row) => ({ label: row.label, value: row.spend }))} format={(value) => `£${Math.round(value)}`} />
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Store size={15} /> Favourite stores</p>
              <Pill tone="muted">by visits</Pill>
            </div>
            <div className="mt-2 space-y-2">
              {report.stores.slice(0, 5).map((store, index) => (
                <div key={store.name} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-bold truncate">{index + 1}. {store.name}</p>
                    <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {store.trips} trip{store.trips === 1 ? '' : 's'} · {gbp(store.average, { always: true })} average
                    </p>
                  </div>
                  <p className="text-[0.8125rem] font-extrabold">{gbp(store.spent, { always: true })}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : <Empty>Record a completed shop and spending trends will start here.</Empty>}
      <Card>
        <p className="font-bold text-[0.875rem]">Savings dashboard</p>
        <p className="mt-0.5 text-[1.5rem] font-extrabold">{gbp(report.savings.total, { always: true })}</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Recorded offer savings across {report.savings.trips} shop{report.savings.trips === 1 ? '' : 's'} · {gbp(report.savings.month, { always: true })} this month.
        </p>
      </Card>
    </>
  );
}

function NutritionView({ report }) {
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Nutrition dashboard</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {report.loggedDays} of {report.days} days logged ({report.coverage}%). Averages exclude unlogged days.
        </p>
      </Card>
      {!report.loggedDays ? <Empty>Log food on at least one day to see nutrition averages.</Empty> : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Calories" value={Math.round(report.averages.kcal).toLocaleString()} detail="daily average" />
            <Stat label="Protein" value={`${report.averages.protein}g`} detail="daily average" />
            <Stat label="Fibre" value={`${report.averages.fibre}g`} detail="daily average" />
          </div>
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Average against target</p>
            <div className="space-y-3">
              {report.nutrients.map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                    <span>{NUTRIENT_LABELS[row.key]}</span>
                    <span style={{ color: 'var(--muted)' }}>
                      {row.average}{row.key === 'kcal' ? ' kcal' : 'g'}{row.target ? ` / ${row.target}` : ''}
                    </span>
                  </div>
                  <Meter value={row.average} max={row.target || row.average || 1} />
                </div>
              ))}
            </div>
          </Card>
          {report.rows.length > 1 && (
            <Card>
              <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Logged-day calories</p>
              <Bars
                data={report.rows.slice(-7).map((row) => ({ label: row.date.slice(8), value: row.kcal }))}
                color="var(--series-2)"
                format={(value) => Math.round(value).toLocaleString()}
              />
            </Card>
          )}
        </>
      )}
    </>
  );
}

const Breakdown = ({ title, rows }) => (
  <Card>
    <p className="font-bold text-[0.875rem]">{title}</p>
    {rows.length ? (
      <div className="mt-2 space-y-2.5">
        {rows.slice(0, 6).map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-[0.75rem] font-bold mb-1">
              <span>{row.label}</span>
              <span style={{ color: 'var(--muted)' }}>{row.count} · {gbp(row.value, { always: true })}</span>
            </div>
            <Meter value={row.count} max={rows[0].count || 1} height={5} />
          </div>
        ))}
      </div>
    ) : <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>No inventory rows yet.</p>}
  </Card>
);

function PantryDashboard({ report }) {
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Pantry dashboard</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>A live view of what is currently in your household inventory.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Items" value={report.total} />
        <Stat label="Value" value={gbp(report.value, { always: true })} />
        <Stat label="Dated" value={`${report.datedCoverage}%`} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Use soon" value={report.useSoon} detail="within three days" />
        <Stat label="Running low" value={report.low} detail="marked by you" />
      </div>
      <Breakdown title="By location" rows={report.byLocation} />
      <Breakdown title="By category" rows={report.byCategory} />
    </>
  );
}

function WasteView({ report }) {
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Waste dashboard</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Based on pantry items you marked as thrown away.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="This month" value={gbp(report.month.cost, { always: true })} detail={`${report.month.count} item${report.month.count === 1 ? '' : 's'}`} />
        <Stat label="This year" value={gbp(report.year.cost, { always: true })} detail={`${report.year.count} items`} />
        <Stat label="Waste rate" value={report.month.rate === null ? '—' : `${report.month.rate}%`} detail="of recorded spend" />
      </div>
      {report.total.count ? (
        <>
          <Card>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Food waste analytics</p>
            <Bars data={report.monthly.map((row) => ({ label: row.label, value: row.cost }))} color="var(--warn)" format={(value) => `£${Math.round(value)}`} />
          </Card>
          <Card>
            <p className="font-bold text-[0.875rem]">Most wasted</p>
            <div className="mt-2 space-y-2">
              {report.top.slice(0, 5).map((row) => (
                <div key={row.name} className="flex justify-between text-[0.78125rem] font-bold">
                  <span>{row.name} · {row.count}</span>
                  <span style={{ color: 'var(--muted)' }}>{gbp(row.cost, { always: true })}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : <Empty>Mark a pantry item as thrown away to start waste analytics.</Empty>}
    </>
  );
}

function HabitsView({ report }) {
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Shopping habits</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Patterns come from your completed shops and food diary.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Trips" value={report.trips} />
        <Stat label="Items/trip" value={report.trips ? report.averageItems : '—'} />
        <Stat label="Usual day" value={report.favouriteDay?.name?.slice(0, 3) || '—'} />
      </div>
      <Card>
        <p className="font-bold text-[0.875rem]">Frequently bought</p>
        {report.products.length ? (
          <div className="mt-2 space-y-2">
            {report.products.slice(0, 8).map((row) => (
              <div key={row.name} className="flex justify-between text-[0.78125rem] font-bold">
                <span>{row.name}</span><Pill tone="muted">{row.times}×</Pill>
              </div>
            ))}
          </div>
        ) : <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>No bought products recorded yet.</p>}
      </Card>
      <Card>
        <p className="font-bold text-[0.875rem] inline-flex items-center gap-1.5"><Tag size={15} /> Favourite brands</p>
        {report.brands.length ? (
          <div className="mt-2 space-y-2">
            {report.brands.slice(0, 8).map((row) => (
              <div key={row.name} className="flex justify-between text-[0.78125rem] font-bold">
                <span>{row.name}</span><span style={{ color: 'var(--muted)' }}>{row.times} logged</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Brands appear when branded foods are logged.</p>}
      </Card>
    </>
  );
}

const changeValue = (trend) => {
  if (!trend || trend.reductionPct === null) return '—';
  const direction = trend.reductionPct >= 0 ? '↓' : '↑';
  return `${direction} ${Math.abs(trend.reductionPct)}%`;
};

const changeDetail = (metric, unit = 'recorded trips') => {
  if (!metric.readyForTrend) return `${metric.minimumTrips} dated trips needed for a baseline`;
  if (!metric.trend || metric.trend.reductionPct === null) return `No earlier ${unit} signal to compare`;
  return `latest half vs earlier half · ${unit}`;
};

function MeasurementView({ report }) {
  const time = report.householdTimeSaved;
  const emergency = report.emergencyShopReduction;
  const duplicate = report.duplicatePurchaseReduction;
  const waste = report.foodWasteReduction;
  const meals = report.plannedMealCompletion;
  const pantry = report.pantryConfirmationBurden;
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Household outcome measurement</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Recorded actions only. Reductions compare the earlier and latest halves of dated shop history; a blank reduction means the baseline is not ready.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat
          label="Household time saved"
          value={time.estimatedMinutes === null ? '—' : `~${time.estimatedMinutes} min`}
          detail={time.estimatedMinutes === null ? 'No list-saving signal yet' : `${time.consolidatedLines} consolidated lines · proxy estimate`}
        />
        <Stat
          label="Emergency shop reduction"
          value={changeValue(emergency.trend)}
          detail={emergency.trend ? changeDetail(emergency) : `${emergency.rate ?? '—'}% small-shop rate currently`}
        />
        <Stat
          label="Duplicate purchase reduction"
          value={changeValue(duplicate.trend)}
          detail={duplicate.trend ? `${changeDetail(duplicate, 'item lines')} · ${duplicate.recentPurchaseWarnings} active warnings` : `${duplicate.recentPurchaseWarnings} recent-purchase warning${duplicate.recentPurchaseWarnings === 1 ? '' : 's'}`}
        />
        <Stat
          label="Food waste reduction"
          value={changeValue(waste.trend)}
          detail={waste.trend ? `${changeDetail(waste, 'waste cost per shop')} · £${waste.window.cost.toFixed(2)} in 30 days` : `£${waste.observedCost.toFixed(2)} observed waste`}
        />
        <Stat
          label="Planned meal completion"
          value={meals.completionPct === null ? '—' : `${meals.completionPct}%`}
          detail={`${meals.completed} of ${meals.planned} planned meals cooked · 30 days`}
        />
        <Stat
          label="Pantry confirmation burden"
          value={pantry.burdenPct === null ? '—' : `${pantry.burdenPct}%`}
          detail={pantry.consumptionEvents ? `${pantry.confirmationRequests} confirmation request${pantry.confirmationRequests === 1 ? '' : 's'} across ${pantry.consumptionEvents} cooks` : 'No pantry consumption events yet'}
        />
      </div>
      <Card>
        <p className="font-bold text-[0.875rem]">How to read this</p>
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Emergency shops mean two or fewer named items. Duplicate purchases are a seven-day repeat-purchase proxy. Time saved estimates two minutes per consolidated list line and one minute per recent-purchase warning; it is not a stopwatch measurement.
        </p>
        {pantry.openConflicts > 0 && (
          <p className="mt-2 text-[0.75rem] font-bold" style={{ color: 'var(--warn)' }}>
            {pantry.openConflicts} pantry conflict{pantry.openConflicts === 1 ? '' : 's'} still need a household decision.
          </p>
        )}
      </Card>
    </>
  );
}

function ImpactView({ report }) {
  const categories = report.food.byCategory || [];
  return (
    <>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">Carbon footprint</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Estimated from logged food names and published category factors; it is not a product-level lifecycle assessment.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Food · 30 days" value={`${report.food.co2} kg`} detail={`${report.food.loggedDays} logged days`} />
        <Stat label="Shopping · 30 days" value={`${report.shopping.co2} kg`} detail={`${report.shopping.shops} recorded trips`} />
      </div>
      {categories.length ? (
        <Card>
          <p className="font-bold text-[0.875rem]">Food footprint by category</p>
          <div className="mt-2 space-y-2.5">
            {categories.slice(0, 6).map((row) => (
              <div key={row.id}>
                <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                  <span>{row.label}</span><span style={{ color: 'var(--muted)' }}>{row.co2} kg CO₂e</span>
                </div>
                <Meter value={row.co2} max={categories[0].co2 || 1} color="var(--good)" height={5} />
              </div>
            ))}
          </div>
        </Card>
      ) : <Empty>Log foods with recognisable ingredient names to estimate their footprint.</Empty>}
      <Card>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Shopping estimates assume 500g per recorded item because receipts do not contain reliable weights. The assumption is shown rather than hidden.
        </p>
      </Card>
    </>
  );
}

function ReportsView({ month, year }) {
  const [period, setPeriod] = useState('month');
  const report = period === 'month' ? month : year;
  return (
    <>
      <div className="flex gap-2">
        <Chip active={period === 'month'} onClick={() => setPeriod('month')}>Month</Chip>
        <Chip active={period === 'year'} onClick={() => setPeriod('year')}>Year</Chip>
      </div>
      <Card>
        <p className="font-extrabold text-[0.9375rem]">{period === 'month' ? 'Monthly report' : 'Yearly report'}</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{report.label} to date · recorded data only.</p>
      </Card>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Spend" value={gbp(report.spend, { always: true })} detail={`${report.trips} trips`} />
        <Stat label="Saved" value={gbp(report.saved, { always: true })} detail="offers recorded" />
        <Stat label="Waste" value={gbp(report.wasteCost, { always: true })} detail={`${report.wasteItems} items`} />
      </div>
      <Card>
        <p className="font-bold text-[0.875rem]">Nutrition</p>
        <p className="mt-0.5 text-[1.375rem] font-extrabold">{report.nutrition.kcal.toLocaleString()} kcal</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Daily average across {report.loggedDays} logged day{report.loggedDays === 1 ? '' : 's'} · {report.nutrition.protein}g protein · {report.nutrition.fibre}g fibre.
        </p>
      </Card>
      <Card>
        <p className="font-bold text-[0.875rem]">Footprint</p>
        <p className="mt-0.5 text-[1.375rem] font-extrabold">{report.carbon.co2} kg CO₂e</p>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Estimate across {report.carbon.loggedDays} logged day{report.carbon.loggedDays === 1 ? '' : 's'} in this period.
        </p>
      </Card>
    </>
  );
}

export default function AnalyticsPanel() {
  const app = useApp();
  const views = VIEWS.filter(([key]) => {
    const toolId = ANALYTICS_VIEW_TOOL[key];
    return !toolId || app.hasTool(toolId);
  });
  const [view, setView] = useState('spend');
  const active = views.some(([key]) => key === view) ? view : (views[0]?.[0] || 'spend');
  const shopping = shoppingAnalytics(app, app.day);
  const nutrition = nutritionAnalytics(app, { days: 30, today: app.day });
  const pantry = pantryDashboard(app, app.day);
  const waste = wasteAnalytics(app, app.day);
  const measurement = measurementAnalytics(app, app.day);
  const carbon = carbonAnalytics(app, app.day);
  const month = calendarAnalyticsReport(app, 'month', app.day);
  const year = calendarAnalyticsReport(app, 'year', app.day);

  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {views.map(([key, label, Icon]) => (
          <Chip key={key} active={active === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>
      {active === 'spend' && <SpendingView report={shopping} />}
      {active === 'nutrition' && <NutritionView report={nutrition} />}
      {active === 'pantry' && <PantryDashboard report={pantry} />}
      {active === 'waste' && <WasteView report={waste} />}
      {active === 'habits' && <HabitsView report={shopping} />}
      {active === 'measurement' && <MeasurementView report={measurement} />}
      {active === 'impact' && <ImpactView report={carbon} />}
      {active === 'reports' && <ReportsView month={month} year={year} />}
    </div>
  );
}
