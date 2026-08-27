import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { gbp } from '../lib/utils.js';
import {
  bestPriceSeries, cheapestShopOverall, priceTrend, shopSeries,
} from '../lib/live-price-history.js';
import { Pill } from './ui.jsx';

const W = 320;
const H = 132;
const PAD = { top: 14, right: 12, bottom: 26, left: 44 };

const shortDate = (iso) => {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/** Pad the value range so a flat line does not sit welded to the axis. */
const extent = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.18 || Math.max(0.1, max * 0.1);
  return { lo: Math.max(0, min - pad), hi: max + pad };
};

/**
 * The item's cheapest price on each day it was checked.
 *
 * One series, so it carries no legend and no colour-coding: the heading names
 * it, which is the whole identity it needs.
 */
function BestPriceChart({ series }) {
  const prices = series.map((point) => point.price);
  const { lo, hi } = extent(prices);
  const span = hi - lo || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = series.length;

  const coords = series.map((point, index) => ({
    ...point,
    x: PAD.left + (n === 1 ? plotW / 2 : (index / (n - 1)) * plotW),
    y: PAD.top + plotH * (1 - (point.price - lo) / span),
  }));

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1).x.toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;
  const ticks = [lo, (lo + hi) / 2, hi].map((value) => ({
    value,
    y: PAD.top + plotH * (1 - (value - lo) / span),
    label: gbp(value, { always: true }),
  }));
  const xLabels = n <= 5 ? coords : [coords[0], coords[Math.floor(n / 2)], coords.at(-1)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto overflow-visible"
      role="img"
      aria-label={`Cheapest price across shops, ${n} checks from ${series[0].date} to ${series.at(-1).date}`}
    >
      <title>Cheapest price across shops, over time</title>
      {ticks.map((tick) => (
        <g key={tick.label}>
          <line
            x1={PAD.left} x2={W - PAD.right} y1={tick.y} y2={tick.y}
            stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" opacity="0.9"
          />
          <text x={PAD.left - 6} y={tick.y + 3} textAnchor="end" fontSize="8.5" fontWeight="700" fill="var(--faint)">
            {tick.label}
          </text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" opacity="0.08" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {xLabels.map((c) => (
        <text key={`x-${c.date}`} x={c.x} y={H - 8} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--faint)">
          {shortDate(c.date)}
        </text>
      ))}
      {coords.map((c) => (
        <g key={`dot-${c.date}`}>
          <circle cx={c.x} cy={c.y} r="7" fill="var(--accent)" opacity="0.14" />
          <circle cx={c.x} cy={c.y} r="3.6" fill="var(--accent)" stroke="var(--card)" strokeWidth="1.6" />
          <title>{`${shortDate(c.date)} · ${gbp(c.price, { always: true })}${c.shop ? ` · ${c.shop}` : ''}`}</title>
        </g>
      ))}
    </svg>
  );
}

/**
 * One small chart per shop rather than one chart with a line per shop.
 *
 * The app's chart ramp is three shades of ink on purpose — series are meant to
 * be identified by their labels, not their colour. Six overlapping lines in
 * three greys cannot be told apart however they are labelled, so each shop
 * gets its own captioned panel. That reads at any number of shops and needs no
 * palette at all.
 */
function ShopSparkline({ points }) {
  const width = 104;
  const height = 30;
  const prices = points.map((point) => point.price);
  const { lo, hi } = extent(prices);
  const span = hi - lo || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const y = (value) => 3 + (height - 6) * (1 - (value - lo) / span);

  if (points.length === 1) {
    return (
      <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
        <circle cx={width / 2} cy={height / 2} r="3.4" fill="var(--series-1)" />
      </svg>
    );
  }
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${y(point.price).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={(points.length - 1) * step}
        cy={y(prices.at(-1))}
        r="3.2"
        fill="var(--series-1)"
        stroke="var(--card)"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function LivePriceHistory({ entry }) {
  const best = useMemo(() => bestPriceSeries(entry), [entry]);
  const shops = useMemo(() => shopSeries(entry), [entry]);
  const trend = useMemo(() => priceTrend(entry), [entry]);
  const usual = useMemo(() => cheapestShopOverall(entry), [entry]);

  if (!best.length) return null;

  if (best.length === 1) {
    return (
      <p className="mt-2.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
        First check recorded at {gbp(best[0].price, { always: true })}. Check again another day and a price trend appears here.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
          <TrendingUp size={12} aria-hidden="true" /> Price over time
        </p>
        <Pill tone={trend.direction === 'up' ? 'danger' : trend.direction === 'down' ? 'good' : 'muted'}>
          {trend.label}
        </Pill>
      </div>

      <div className="mt-2">
        <BestPriceChart series={best} />
      </div>

      {usual && usual.of > 1 && (
        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {usual.retailer} has been cheapest {usual.wins} of {usual.of} checks.
        </p>
      )}

      {shops.length > 0 && (
        <>
          <p className="mt-3 mb-1.5 text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
            Each shop, cheapest average first
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {shops.map((shop) => (
              <div key={shop.retailerId} className="min-w-0">
                <p className="truncate text-[0.71875rem] font-bold">{shop.retailer}</p>
                <ShopSparkline points={shop.points} />
                <p className="text-[0.65625rem] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                  {gbp(shop.latest, { always: true })}
                  {shop.changePct !== null && shop.changePct !== 0 && (
                    <span style={{ color: shop.changePct > 0 ? 'var(--danger)' : 'var(--good)' }}>
                      {' '}{shop.changePct > 0 ? '▲' : '▼'} {Math.abs(shop.changePct)}%
                    </span>
                  )}
                  <span style={{ color: 'var(--faint)' }}> · avg {gbp(shop.average, { always: true })}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Every recorded check for this item: date, cheapest price, and the shop that had it.
          </caption>
          <thead>
            <tr className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
              <th className="px-2 py-1 font-bold">Date</th>
              <th className="px-2 py-1 font-bold">Cheapest</th>
              <th className="px-2 py-1 font-bold">Shop</th>
            </tr>
          </thead>
          <tbody className="text-[0.71875rem] font-semibold">
            {best.map((point) => (
              <tr key={point.date} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {shortDate(point.date)}<span className="sr-only"> {point.date}</span>
                </td>
                <td className="px-2 py-1.5 font-extrabold tabular-nums">{gbp(point.price, { always: true })}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--muted)' }}>{point.shop || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
