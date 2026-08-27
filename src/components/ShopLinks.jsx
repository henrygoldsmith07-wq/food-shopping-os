import { ExternalLink, Search } from 'lucide-react';
import { gbp } from '../lib/utils.js';

/**
 * Somewhere to go for this food item, at every shop — priced or not.
 *
 * The scraper's job is to save the trip. When it cannot — and for several
 * shops it never will, because their robots.txt refuses automated readers —
 * the next best thing is the trip made short. A shop that declines to be read
 * by this app has no objection to the person holding the phone opening the
 * same page, so the link is kept rather than only the apology.
 *
 * Two kinds of link, never blurred: the product's own page where the shop
 * published one, and that shop's search results otherwise. "The thing" and "a
 * list of maybes" are different promises, and a row that looks like the first
 * while being the second is how someone ends up on a page of tinned tomatoes
 * looking for milk.
 */
export default function ShopLinks({ links = [], name }) {
  if (!links.length) return null;
  const direct = links.filter((link) => link.isProductLink).length;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
        Open {name} at {links.length} shop{links.length === 1 ? '' : 's'}
        {direct > 0 ? ` · ${direct} straight to the product` : ''}
      </summary>
      <ul className="mt-1.5 space-y-1">
        {links.map((link) => (
          <li key={link.retailerId} className="flex items-baseline justify-between gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 items-baseline gap-1.5 text-[0.6875rem] font-bold"
              style={{ color: 'var(--accent)' }}
            >
              {link.isProductLink
                ? <ExternalLink size={11} className="shrink-0" aria-hidden="true" />
                : <Search size={11} className="shrink-0" aria-hidden="true" />}
              <span className="truncate">{link.retailer}</span>
              <span className="sr-only">
                {link.isProductLink
                  ? `— open ${link.productName || name} on ${link.retailer}`
                  : `— search ${link.retailer} for ${name}`}
              </span>
            </a>
            <span className="shrink-0 text-[0.6875rem] font-semibold tabular-nums" style={{ color: 'var(--faint)' }}>
              {link.price !== null
                ? gbp(link.price, { always: true })
                : link.isProductLink ? 'product page' : 'search'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[0.65625rem] font-semibold" style={{ color: 'var(--faint)' }}>
        Search links go to the shop’s own results, which may list more than one thing.
        Shops that declined to be read still open normally in a browser.
      </p>
    </details>
  );
}
