import { useMemo, useState } from 'react';
import {
  Bell, ChartNoAxesColumn, PiggyBank, Plus, Settings2, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { spendByMonth, weekDates } from '../lib/kitchen.js';
import { planStats } from '../lib/mealplan.js';
import { gbp } from '../lib/utils.js';
import { Bars, Card, Chip, Meter, Pill, Section } from './ui.jsx';

const PCT_CHOICES = [5, 10, 15, 20, 25, 30, 50];

export default function BudgetPanel() {
  const app = useApp();
  const [weekly, setWeekly] = useState(app.weeklyBudget || '');
  const [monthly, setMonthly] = useState(app.monthlyBudget || '');
  const [alertName, setAlertName] = useState('');
  const [alertTarget, setAlertTarget] = useState('');
  const spend = useMemo(() => spendByMonth(app.shops, 6, app.day), [app.shops, app.day]);
  const planned = planStats(app.plan, weekDates(app.day), { people: app.portions });
  const costPerMeal = planned.meals ? planned.cost / planned.meals : 0;
  const costPerServing = planned.meals ? planned.cost / planned.meals / app.portions : 0;
  const anomalies = app.priceAnomalies;

  const saveBudgets = () => app.set({
    weeklyBudget: Math.max(0, Number(weekly) || 0),
    monthlyBudget: Math.max(0, Number(monthly) || 0),
  });

  const addAlert = () => {
    app.addPriceAlert({ name: alertName, target: alertTarget });
    setAlertName('');
    setAlertTarget('');
  };

  return (
    <div className="pb-6 space-y-5">
      <Section className="rise rise-1" title="Grocery budgets">
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Weekly budget</span>
              <input
                type="number"
                min="0"
                step="5"
                value={weekly}
                onChange={(event) => setWeekly(event.target.value)}
                aria-label="Weekly grocery budget"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            <label>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Monthly budget</span>
              <input
                type="number"
                min="0"
                step="10"
                value={monthly}
                onChange={(event) => setMonthly(event.target.value)}
                aria-label="Monthly grocery budget"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
          </div>
          <button
            onClick={saveBudgets}
            className="press w-full rounded-2xl py-2.5 text-[0.8125rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Save budgets
          </button>
          <div className="space-y-3">
            {app.weeklyBudget > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-[0.75rem] font-semibold">
                  <span>This week</span><span>{gbp(app.spentThisWeek, { always: true })} of {gbp(app.weeklyBudget)}</span>
                </div>
                <Meter value={app.spentThisWeek} max={app.weeklyBudget} color={app.spentThisWeek > app.weeklyBudget ? 'var(--danger)' : 'var(--accent)'} />
              </div>
            )}
            {app.monthlyBudget > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-[0.75rem] font-semibold">
                  <span>This month</span><span>{gbp(app.spentThisMonth, { always: true })} of {gbp(app.monthlyBudget)}</span>
                </div>
                <Meter value={app.spentThisMonth} max={app.monthlyBudget} color={app.spentThisMonth > app.monthlyBudget ? 'var(--danger)' : 'var(--accent)'} />
              </div>
            )}
          </div>
        </Card>
      </Section>

      <Section className="rise rise-2" title="Spending trends">
        <Card>
          {spend.some((month) => month.spend > 0) ? (
            <Bars data={spend.map((month) => ({ label: month.label, value: month.spend }))} format={(value) => gbp(value, { always: true })} />
          ) : (
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Record completed shops to build a monthly trend.
            </p>
          )}
        </Card>
      </Section>

      <Section className="rise rise-2" title="Cost of this week’s plan">
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="text-center !p-3">
            <p className="text-[1.125rem] font-extrabold">{planned.meals ? gbp(costPerMeal, { always: true }) : '—'}</p>
            <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>per household meal</p>
          </Card>
          <Card className="text-center !p-3">
            <p className="text-[1.125rem] font-extrabold">{planned.meals ? gbp(costPerServing, { always: true }) : '—'}</p>
            <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>per serving</p>
          </Card>
        </div>
      </Section>

      <Section className="rise rise-2" title="Inflation & savings">
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="!p-3">
            <TrendingUp size={16} style={{ color: 'var(--muted)' }} />
            <p className="mt-1 text-[1.125rem] font-extrabold">
              {app.inflation.items ? `${app.inflation.percent > 0 ? '+' : ''}${app.inflation.percent}%` : '—'}
            </p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Like-for-like across {app.inflation.items} repeated item{app.inflation.items === 1 ? '' : 's'}.
            </p>
          </Card>
          <Card className="!p-3">
            <PiggyBank size={16} style={{ color: 'var(--muted)' }} />
            <p className="mt-1 text-[1.125rem] font-extrabold">{gbp(app.savings.saved, { always: true })}</p>
            <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Recorded coupon savings across {app.savings.trips} shop{app.savings.trips === 1 ? '' : 's'}.
            </p>
          </Card>
        </div>
      </Section>

      {/* Receipt-only price rises & bargains — honest, 15% default, tunable */}
      <Section className="rise rise-2" title="Price rises & bargains · receipt-only">
        <Card className="space-y-3">
          <div className="flex items-start gap-2">
            <Settings2 size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
            <p className="text-[0.75rem] font-semibold leading-snug" style={{ color: 'var(--muted)' }}>
              From your receipts only — latest price vs median of earlier buys. <strong style={{ color: 'var(--ink)' }}>15% recommended</strong>, tunable globally and per item. No live feed, no retailer guess. Need 2 receipts per item.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--faint)' }}><TrendingUp size={11} /> Rise alert</span>
              <select
                value={anomalies.config.risePct}
                onChange={(e) => app.setPriceAlertConfig({ risePct: Number(e.target.value) })}
                aria-label="Rise threshold"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                {PCT_CHOICES.map((n) => <option key={n} value={n}>{n}% above median</option>)}
              </select>
            </label>
            <label>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--faint)' }}><TrendingDown size={11} /> Bargain alert</span>
              <select
                value={anomalies.config.bargainPct}
                onChange={(e) => app.setPriceAlertConfig({ bargainPct: Number(e.target.value) })}
                aria-label="Bargain threshold"
                className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                {PCT_CHOICES.map((n) => <option key={n} value={n}>{n}% below median</option>)}
              </select>
            </label>
          </div>

          {anomalies.rises.length === 0 && anomalies.bargains.length === 0 ? (
            <p className="rounded-2xl border px-3 py-3 text-[0.78125rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)', background: 'var(--card-2)' }}>
              {app.shops.length < 2 ? 'Record at least two shops with the same item to spot rises or bargains.' : 'No item is 15% above or below its earlier median yet. Adjust the thresholds or keep shopping.'}
              {anomalies.summary.watchable > 0 && ` · ${anomalies.summary.watchable} item${anomalies.summary.watchable === 1 ? '' : 's'} watched.`}
            </p>
          ) : (
            <div className="space-y-3">
              {anomalies.rises.length > 0 && (
                <div>
                  <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--danger)' }}><TrendingUp size={12} /> {anomalies.rises.length} price rise{anomalies.rises.length === 1 ? '' : 's'}</p>
                  <div className="mt-2 space-y-2">
                    {anomalies.rises.map((r) => (
                      <div key={r.name} className="rounded-2xl border px-3 py-2.5 flex items-center gap-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                        <span className="text-[1.125rem] leading-none">{r.emoji || '🛒'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[0.8125rem] truncate">{r.name} <span className="font-semibold" style={{ color: 'var(--danger)' }}>+{r.pct}%</span></p>
                          <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                            {gbp(r.baseline, { always: true })} → {gbp(r.latest, { always: true })} median → latest{r.store ? ` · ${r.store}` : ''}{r.date ? ` · ${r.date}` : ''} · {r.provenance}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Chip active={false} onClick={() => {}}><span className="text-[0.6875rem]">Rise {r.risePct}%</span></Chip>
                            <select
                              value={r.risePct}
                              onChange={(e) => app.setPriceAlertOverride(r.name, 'rise', Number(e.target.value))}
                              className="rounded-full border px-2 py-1 text-[0.6875rem] font-semibold"
                              style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}
                              aria-label={`Rise threshold for ${r.name}`}
                            >
                              {PCT_CHOICES.map((n) => <option key={n} value={n}>{n}%</option>)}
                            </select>
                            {app.priceAnomalies.config.overrides[r.name.toLowerCase()]?.risePct && (
                              <button onClick={() => app.clearPriceAlertOverride(r.name, 'rise')} className="text-[0.6875rem] font-semibold underline" style={{ color: 'var(--muted)' }}>Reset</button>
                            )}
                          </div>
                        </div>
                        <Pill tone="danger">rise</Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {anomalies.bargains.length > 0 && (
                <div>
                  <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--good)' }}><TrendingDown size={12} /> {anomalies.bargains.length} bargain{anomalies.bargains.length === 1 ? '' : 's'}</p>
                  <div className="mt-2 space-y-2">
                    {anomalies.bargains.map((b) => (
                      <div key={b.name} className="rounded-2xl border px-3 py-2.5 flex items-center gap-2.5" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                        <span className="text-[1.125rem] leading-none">{b.emoji || '🛒'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[0.8125rem] truncate">{b.name} <span className="font-semibold" style={{ color: 'var(--good)' }}>{b.pct}%</span></p>
                          <p className="text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
                            {gbp(b.baseline, { always: true })} → {gbp(b.latest, { always: true })}{b.store ? ` · ${b.store}` : ''}{b.date ? ` · ${b.date}` : ''} · {b.provenance}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                            <select
                              value={b.bargainPct}
                              onChange={(e) => app.setPriceAlertOverride(b.name, 'bargain', Number(e.target.value))}
                              className="rounded-full border px-2 py-1 text-[0.6875rem] font-semibold"
                              style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}
                              aria-label={`Bargain threshold for ${b.name}`}
                            >
                              {PCT_CHOICES.map((n) => <option key={n} value={n}>{n}%</option>)}
                            </select>
                            {app.priceAnomalies.config.overrides[b.name.toLowerCase()]?.bargainPct && (
                              <button onClick={() => app.clearPriceAlertOverride(b.name, 'bargain')} className="text-[0.6875rem] font-semibold underline" style={{ color: 'var(--muted)' }}>Reset</button>
                            )}
                          </div>
                        </div>
                        <Pill tone="good">bargain</Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </Section>

      <Section className="rise rise-2" title="Your £ targets">
        <Card className="space-y-3">
          <div className="flex items-start gap-2">
            <Bell size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              A £ target you set — also checked when you record another shop. Receipt-only, never a live price.
            </p>
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <input
              value={alertName}
              onChange={(event) => setAlertName(event.target.value)}
              placeholder="Product"
              aria-label="Price alert product"
              className="rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <input
              type="number"
              min="0"
              step="0.1"
              value={alertTarget}
              onChange={(event) => setAlertTarget(event.target.value)}
              placeholder="£ target"
              aria-label="Target price"
              className="rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
          </div>
          <button
            onClick={addAlert}
            disabled={alertName.trim().length < 2 || Number(alertTarget) <= 0}
            className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold disabled:opacity-40"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Add price alert</span>
          </button>
          {app.priceAlertStatus.map((alert) => (
            <div key={alert.id} className="flex items-center gap-3 border-t pt-2.5" style={{ borderColor: 'var(--line)' }}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[0.8125rem] truncate">{alert.name}</p>
                <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  Target {gbp(alert.target, { always: true })}
                  {alert.latest !== null && ` · best current ${gbp(alert.latest, { always: true })}${alert.store ? ` at ${alert.store}` : ''}`}
                </p>
              </div>
              {alert.hit && <Pill tone="good">target hit</Pill>}
              <button
                onClick={() => app.removePriceAlert(alert.id)}
                aria-label={`Remove price alert for ${alert.name}`}
                className="press p-1"
                style={{ color: 'var(--faint)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      </Section>

      <Section className="rise rise-2">
        <Card className="flex items-center gap-3 !p-3">
          <ChartNoAxesColumn size={17} style={{ color: 'var(--muted)' }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Store comparison, cheapest basket and full price history are under Prices. Coupons & rewards are in your list’s Offers vault.
          </p>
        </Card>
      </Section>
    </div>
  );
}
