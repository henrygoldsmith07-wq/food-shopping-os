import { gbp } from '../lib/utils.js';
import { Pill } from './ui.jsx';

/**
 * One food item, every shop that sells it, and what it costs per unit.
 *
 * The per-unit column is the reason this table exists. "Tesco £1.45, Aldi
 * £0.85" says Aldi wins and is wrong: the Tesco bottle is 2.27L and the Aldi
 * one is 1.13L, so Tesco is 64p a litre against Aldi's 75p. A comparison
 * without pack sizes gets the answer backwards, and gets it backwards most
 * often on the products people buy every week.
 *
 * Where the two answers disagree, the table says so rather than leaving the
 * reader to notice. Where the sizes cannot be compared — six eggs against
 * 500g of eggs — nothing is ranked at all, because a number that mixes scales
 * is worse than no number.
 */
const unitLabel = (unit) => {
  if (!unit) return null;
  if (unit.dim === 'count') return `${gbp(unit.value, { always: true })} ${unit.unit}`;
  return `${gbp(unit.value, { always: true })} / ${unit.unit}`;
};

export default function ProductShops({ product }) {
  if (!product || product.shops < 2) return null;
  const { ranked, bestValue, cheapest, mixedScales, ticketMisleads } = product;

  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-[0.6875rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          Same item, {product.shops} shops
        </p>
        {product.lastSeen && (
          <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            read {product.lastSeen}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.6875rem]">
          <thead>
            <tr style={{ color: 'var(--faint)' }}>
              <th scope="col" className="pb-1 font-bold">Shop</th>
              <th scope="col" className="pb-1 font-bold">Amount</th>
              <th scope="col" className="pb-1 text-right font-bold">Price</th>
              <th scope="col" className="pb-1 text-right font-bold">Per amount</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const isBest = !mixedScales && bestValue?.retailerId === row.retailerId;
              return (
                <tr key={row.retailerId} className="align-baseline">
                  <th scope="row" className="py-1 pr-2 font-bold">
                    <span className="flex flex-wrap items-baseline gap-1.5">
                      {row.retailer}
                      {isBest && <Pill tone="good">best value</Pill>}
                    </span>
                    {row.productName && (
                      <span className="block font-semibold" style={{ color: 'var(--faint)' }}>
                        {row.productName}
                      </span>
                    )}
                  </th>
                  <td className="py-1 pr-2 font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                    {row.amount || '—'}
                  </td>
                  <td className="py-1 pr-2 text-right font-extrabold tabular-nums">
                    {gbp(row.price, { always: true })}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                    {unitLabel(row.unit) || 'no size given'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ticketMisleads && bestValue && cheapest && (
        <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--warn)' }}>
          {cheapest.retailer} has the cheaper ticket, but {bestValue.retailer} is better value per
          amount{product.margin ? ` by ${product.margin}%` : ''} — the sizes are different.
        </p>
      )}
      {mixedScales && (
        <p className="mt-1.5 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          These sizes are on different scales (by weight against by count), so they are listed by
          price and not ranked by value.
        </p>
      )}
    </div>
  );
}
