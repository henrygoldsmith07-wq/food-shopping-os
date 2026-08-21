import { useMemo, useState } from 'react';
import { TrendingUp, Store, Info } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import { Card, Section, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';

const CHART_W = 320;
const CHART_H = 140;
const PAD = { top: 16, right: 14, bottom: 28, left: 44 };

function extent(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || Math.max(0.5, max * 0.12);
  return { lo: Math.max(0, min - pad), hi: max + pad };
}

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function PriceTimeline({ points }) {
  if (!points || points.length === 0) {
    return <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>No points.</p>;
  }
  if (points.length === 1) {
    const p = points[0];
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border px-3 py-8 text-center" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
          <p className="font-extrabold text-[1.125rem]">{gbp(p.price, { always: true })}</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {formatDateShort(p.date)}{p.store ? ` · ${p.store}` : ''} — one receipt so far. Add another shop to see a trend.
          </p>
        </div>
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const { lo, hi } = extent(prices);
  const span = hi - lo || 1;
  const chartW = CHART_W - PAD.left - PAD.right;
  const chartH = CHART_H - PAD.top - PAD.bottom;
  const n = points.length;

  const coords = points.map((p, i) => {
    const x = PAD.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const y = PAD.top + chartH * (1 - (p.price - lo) / span);
    return { ...p, x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[n - 1].x.toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${coords[0].x.toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;

  const yTicks = [lo, (lo + hi) / 2, hi].map((v) => ({
    v,
    y: PAD.top + chartH * (1 - (v - lo) / span),
    label: gbp(v, { always: true }),
  }));

  const xLabels = n <= 6 ? coords : [coords[0], coords[Math.floor(n / 2)], coords[n - 1]];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`Price over time: ${points.length} receipts from ${points[0].date} to ${points[n - 1].date}`}
      >
        <title>Price over time — your receipts only</title>
        {/* grid + y labels */}
        {yTicks.map((t) => (
          <g key={t.label}>
            <line x1={PAD.left} x2={CHART_W - PAD.right} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" opacity="0.9" />
            <text x={PAD.left - 6} y={t.y + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="var(--faint)">{t.label}</text>
          </g>
        ))}
        {/* area */}
        <path d={areaPath} fill="var(--accent)" opacity="0.08" />
        {/* line */}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {/* x labels */}
        {xLabels.map((c) => (
          <text key={c.date + c.price} x={c.x} y={CHART_H - 8} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--faint)">
            {formatDateShort(c.date)}
          </text>
        ))}
        {/* dots + store hint */}
        {coords.map((c) => (
          <g key={`${c.date}-${c.price}-${c.store}`}>
            <circle cx={c.x} cy={c.y} r="7" fill="var(--accent)" opacity="0.14" />
            <circle cx={c.x} cy={c.y} r="3.6" fill="var(--accent)" stroke="var(--card)" strokeWidth="1.6" />
            <title>{`${formatDateShort(c.date)} · ${gbp(c.price, { always: true })}${c.store ? ` · ${c.store}` : ''}`}</title>
          </g>
        ))}
      </svg>
      {/* accessible table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left border-collapse">
          <caption className="sr-only">Receipts for this product — date, price, shop. Your receipts only.</caption>
          <thead>
            <tr className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              <th className="px-2 py-1 font-bold">Date</th>
              <th className="px-2 py-1 font-bold">Price</th>
              <th className="px-2 py-1 font-bold">Shop</th>
            </tr>
          </thead>
          <tbody className="text-[0.78125rem] font-semibold">
            {points.map((p) => (
              <tr key={`${p.date}-${p.price}-${p.store}`} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatDateShort(p.date)}<span className="sr-only"> {p.date}</span></td>
                <td className="px-2 py-1.5 font-extrabold">{gbp(p.price, { always: true })}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--muted)' }}>{p.store || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceByShop({ points }) {
  const byStore = useMemo(() => {
    const map = new Map();
    for (const p of points) {
      const s = p.store || 'Unknown shop';
      const row = map.get(s) || { store: s, prices: [], count: 0 };
      row.prices.push(p.price);
      row.count += 1;
      row.latest = p.price;
      row.latestDate = p.date;
      map.set(s, row);
    }
    return [...map.values()].map((r) => {
      const min = Math.min(...r.prices);
      const max = Math.max(...r.prices);
      const avg = r.prices.reduce((a, b) => a + b, 0) / r.prices.length;
      return { ...r, min, max, avg: Math.round(avg * 100) / 100 };
    }).sort((a, b) => a.avg - b.avg);
  }, [points]);

  if (byStore.length === 0) return null;
  if (byStore.length === 1) {
    const r = byStore[0];
    return (
      <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Only bought at <strong style={{ color: 'var(--ink)' }}>{r.store}</strong> so far ({r.count} receipt{r.count === 1 ? '' : 's'} · avg {gbp(r.avg, { always: true })}). Buy it elsewhere to compare shops.
        </p>
      </div>
    );
  }

  const maxAvg = Math.max(...byStore.map((r) => r.avg)) || 1;
  const cheapest = byStore[0];

  return (
    <div className="space-y-2.5">
      <div className="space-y-2">
        {byStore.map((row) => {
          const pct = Math.max(18, (row.avg / maxAvg) * 100);
          const isCheapest = row.store === cheapest.store;
          return (
            <div key={row.store} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.78125rem] font-bold truncate">{row.store}</span>
                <span className="text-[0.78125rem] font-extrabold shrink-0">
                  {gbp(row.avg, { always: true })} <span className="font-semibold" style={{ color: 'var(--muted)' }}>avg</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex items-center" style={{ background: 'var(--line)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: isCheapest ? 'var(--good)' : 'var(--accent)',
                    opacity: isCheapest ? 0.95 : 0.9,
                    transition: 'width 500ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              </div>
              <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {row.count} receipt{row.count === 1 ? '' : 's'} · {gbp(row.min, { always: true })}–{gbp(row.max, { always: true })} · latest {gbp(row.latest, { always: true })}
                {isCheapest && <span className="ml-1.5 inline-flex align-middle"><Pill tone="good">cheapest avg</Pill></span>}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Bars compare average price you actually paid at each shop — not a live price. Narrow range = shop prices were steady.
      </p>
    </div>
  );
}

export default function PriceGraphs({ history }) {
  const options = useMemo(() => history.slice().sort((a, b) => b.times - a.times).slice(0, 12), [history]);
  const [selected, setSelected] = useState(() => options[0]?.name || '');
  const [showGraphs, setShowGraphs] = useState(false);

  const entry = useMemo(() => history.find((h) => h.name === selected) || options[0] || null, [history, selected, options]);
  const points = entry?.points || [];

  if (history.length === 0) {
    return (
      <Section title="Price graphs — your receipts only">
        <Card className="text-center py-8">
          <TrendingUp size={26} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
          <p className="font-bold">No price history yet</p>
          <p className="mt-1 text-[0.8125rem] font-semibold max-w-[32ch] mx-auto" style={{ color: 'var(--muted)' }}>
            Put a price against items when you finish a shop. Forq only graphs what you actually paid — single purchases stay as a dot until you buy again.
          </p>
        </Card>
      </Section>
    );
  }

  return (
    <Section className="rise rise-2">
      <button
        type="button"
        onClick={() => setShowGraphs((value) => !value)}
        aria-expanded={showGraphs}
        className="press flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left"
        style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
      >
        <span>
          <span className="block text-[0.9375rem] font-bold tracking-tight">Price graphs — your receipts only</span>
          <span className="mt-0.5 block text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>Open dated trends and shop comparisons</span>
        </span>
        <span className="shrink-0 text-[0.71875rem] font-extrabold" style={{ color: 'var(--accent)' }}>{showGraphs ? 'Hide' : 'Show'}</span>
      </button>

      {showGraphs && (
        <>
          <p className="mt-3 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Every point is a receipt you recorded. No shop feed, no estimates — missing dates stay missing.
          </p>

          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-5 px-5">
            {options.map((p) => (
              <Chip key={p.name} active={p.name === entry.name} onClick={() => setSelected(p.name)}>
                <span className="inline-flex items-center gap-1.5"><Glyph e={p.emoji} size={12} /> {p.name}</span>
              </Chip>
            ))}
          </div>

          {entry && (
            <div className="mt-3 space-y-3">
              <Card>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[0.9375rem] flex items-center gap-1.5"><Glyph e={entry.emoji} size={16} /> {entry.name}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {entry.times} receipt{entry.times === 1 ? '' : 's'} · latest {gbp(entry.latest, { always: true })}
                      {entry.change !== null && entry.times > 1 && (
                        <span className="ml-1.5 font-bold" style={{ color: entry.change > 0 ? 'var(--danger)' : entry.change < 0 ? 'var(--good)' : 'var(--faint)' }}>
                          {entry.change > 0 ? `▲ ${gbp(entry.change, { always: true })}` : entry.change < 0 ? `▼ ${gbp(-entry.change, { always: true })}` : '· flat'} vs previous
                        </span>
                      )}
                      {entry.bestStore && ` · cheapest ${gbp(entry.best, { always: true })} at ${entry.bestStore}`}
                    </p>
                  </div>
                  {entry.prices.length > 1 && <span className="hidden sm:inline-flex"><Pill tone={entry.change > 0 ? 'danger' : entry.change < 0 ? 'good' : 'muted'}>{entry.times} points</Pill></span>}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: 'var(--faint)' }}>
                      <TrendingUp size={12} /> Over time
                    </p>
                    <PriceTimeline points={points} />
                  </div>

                  <div className="pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                    <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide flex items-center gap-1.5 mb-2.5" style={{ color: 'var(--faint)' }}>
                      <Store size={12} /> By shop
                    </p>
                    <PriceByShop points={points} />
                  </div>
                </div>
              </Card>

              {entry.times === 1 && (
                <Card className="flex gap-2.5 !py-3">
                  <Info size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    One dot is all we have for {entry.name} — buy it again (any shop) and the line and shop comparison unlock.
                  </p>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
