import { Receipt } from 'lucide-react';
import { gbp, prettyDate } from '../lib/utils.js';
import { Card, Section } from './ui.jsx';

/**
 * The shops you have actually recorded.
 *
 * This list is the source for spending, budget streaks, price comparison and
 * the route round each store, which is why the empty state explains what
 * finishing a shop unlocks rather than just saying there is nothing here.
 */
export default function ShopHistory({ shops }) {
  return (
    <Section className="rise rise-1" title="Shops you’ve recorded">
      {shops.length === 0 ? (
        <Card className="text-center py-10">
          <Receipt size={30} className="mx-auto mb-2" style={{ color: 'var(--faint)' }} />
          <p className="font-bold">No shops recorded</p>
          <p className="mt-1 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Tick items off as you shop, then hit “Finish shop”. Spending, budget streaks,
            price comparison and your route round each shop all come from these.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {[...shops].reverse().map((s) => (
            <Card key={s.id} className="flex items-center justify-between !p-3.5">
              <div className="min-w-0">
                <p className="font-bold text-[0.90625rem] truncate">
                  {s.store}
                  {s.imported && (
                    <span
                      className="ml-2 inline-block rounded-full px-1.5 align-middle text-[0.625rem] font-bold"
                      style={{ background: 'var(--card-2)', color: 'var(--muted)' }}
                    >
                      Imported
                    </span>
                  )}
                </p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {prettyDate(s.date)} · {s.items.length} item{s.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <p className="font-extrabold text-[1rem] shrink-0">{gbp(s.total, { always: true })}</p>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
