/**
 * Running the shipped scraper against the real web, and reporting what it met.
 *
 * The unit suite proves the parsing logic is right against a mocked fetch.
 * That is a different claim from "a real supermarket will give us a price",
 * and no amount of mocking closes the gap. This closes it by running the
 * actual shipped code — the same robots gate, the same fetch ladder, the same
 * matching rule — against the actual retailers, and reporting shop by shop
 * what happened.
 *
 * It exists because the development sandbox has no outbound network, so
 * everything about the scraper's real-world behaviour was, until this ran
 * somewhere with a connection, an assumption. Including the assumption that
 * the shops refuse: that is what robots.txt is *expected* to say, and expected
 * is not the same as read.
 *
 * Two rules keep the report honest:
 *
 *  - **Prove the machine can reach the web before judging a single shop.**
 *    Every robots.txt goes through the same connection, so a blocked network
 *    produces one identical refusal per shop and a hit rate of zero — which
 *    reads as "the scraper does not work" when it means "this machine cannot
 *    reach anything".
 *  - **Count only shops actually reached.** Putting unreachable shops in the
 *    denominator is what makes a broken connection look like a broken
 *    scraper.
 */

import { RETAILERS, retailerById } from '../data/retailers.js';
import { isScrapeAllowed, looksIntercepted } from './robots.js';
import { USER_AGENT, availableStrategies, runStrategy } from './crawler.js';
import { deterministicPass } from './price-scraper.js';
import { isMatch, searchQueries } from './search-terms.js';
import { brandedQueries } from './branded-queries.js';

/** A host that is nobody's retailer, so its failure means the connection. */
export const CONTROL_URL = 'https://example.com/';

/**
 * Can this machine reach the open web?
 *
 * `ok` false with `intercepted` true means something answered on the shops'
 * behalf — a proxy, firewall, VPN or egress policy — and nothing below it is
 * a measurement of anything.
 */
export const probeControl = async ({ fetchImpl = fetch, url = CONTROL_URL, timeoutMs = 10000 } = {}) => {
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text().then((text) => text.slice(0, 2000)).catch(() => '');
    if (response.ok) return { ok: true, url };
    return {
      ok: false,
      url,
      status: response.status,
      intercepted: looksIntercepted(body, response),
      note: body.replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  } catch (error) {
    return { ok: false, url, status: null, intercepted: false, note: error?.message || 'request failed' };
  }
};

/** The query ladder this item would actually be searched with. */
export const ladderFor = (query) => [
  ...searchQueries(query).slice(0, 2),
  ...brandedQueries(query, { limit: 1 }),
];

/**
 * One shop, walked exactly as the app walks it, with every rung reported.
 *
 * Deliberately reports rows *parsed* alongside rows *matching*. A page that
 * parses twelve products and matches none is a completely different problem
 * from a page that parses nothing, and collapsing the two into "no price" is
 * what made earlier versions of this report useless.
 */
export const diagnoseRetailer = async (retailer, query, {
  fetchImpl = fetch, strategies = null, signal,
} = {}) => {
  const ladder = ladderFor(query);
  const attempts = [];
  const base = { retailerId: retailer.id, retailer: retailer.name, ladder };

  for (const rung of ladder) {
    const url = retailer.search(rung);
    if (!url) return { ...base, status: 'no-search-url', attempts };

    const permission = await isScrapeAllowed(url, { userAgent: USER_AGENT, fetchImpl }).catch(
      (error) => ({ allowed: false, reason: `robots-error:${error?.message || 'unknown'}` }),
    );
    if (!permission.allowed) {
      // Reported per rung because the answer is the same for all of them: a
      // shop that refuses the first query refuses the rest.
      return {
        ...base,
        url,
        status: permission.reason === 'network-blocked' ? 'network-blocked' : 'declined',
        robots: permission.reason,
        crawlDelay: permission.crawlDelay ?? null,
        attempts,
      };
    }

    for (const strategy of strategies || availableStrategies()) {
      if (signal?.aborted) return { ...base, url, status: 'aborted', attempts };
      try {
        const page = await runStrategy(strategy, url, { fetchImpl, signal });
        const parsed = deterministicPass(page, rung);
        const matching = parsed.rows.filter((row) => isMatch(row.name, query));
        const bytes = (page.html || page.markdown || '').length;
        attempts.push({
          rung, strategy, ok: true, bytes, parsed: parsed.rows.length, matching: matching.length,
        });
        if (matching.length) {
          const cheapest = [...matching].sort((a, b) => a.price - b.price)[0];
          return {
            ...base,
            url,
            status: 'ok',
            robots: permission.reason,
            via: strategy,
            searched: rung,
            broadened: rung !== ladder[0],
            price: cheapest.price,
            product: cheapest.name,
            method: cheapest.method,
            attempts,
          };
        }
      } catch (error) {
        attempts.push({ rung, strategy, ok: false, code: error?.code || error?.name || 'error' });
      }
    }
  }
  // Every rung, every strategy, no match. Whether the page was empty or full
  // of the wrong products is in `attempts`, which is the useful part.
  const reached = attempts.some((attempt) => attempt.ok);
  return {
    ...base,
    status: reached ? 'no-match' : 'unreachable',
    attempts,
  };
};

const COUNTED = new Set(['ok', 'no-match', 'declined', 'unreachable']);

/**
 * The whole report: control probe, then every shop, then an honest rate.
 *
 * `hitRate` is over shops actually reached. A shop this machine could not
 * speak to says nothing about whether the scraper works, and putting it in
 * the denominator would be the same lie the control probe exists to prevent.
 */
export const diagnoseScraper = async (query, {
  retailerIds = [], fetchImpl = fetch, signal, deadlineMs = null, controlUrl = CONTROL_URL,
} = {}) => {
  const startedAt = Date.now();
  const control = await probeControl({ fetchImpl, url: controlUrl });
  const shops = retailerIds.length
    ? retailerIds.map((id) => retailerById(id)).filter(Boolean)
    : RETAILERS;

  if (!control.ok) {
    return {
      query,
      checkedAt: new Date().toISOString(),
      control,
      networkBlocked: true,
      shops: [],
      skipped: shops.map((shop) => shop.name),
      hitRate: null,
      reached: 0,
      note: control.intercepted
        ? 'Something on this network answered instead of the shops — a proxy, firewall, VPN or egress policy. No shop was contacted, so nothing here measures the scraper.'
        : 'This machine could not reach a control host, so no shop was contacted.',
    };
  }

  const results = [];
  const skipped = [];
  for (const shop of shops) {
    if (signal?.aborted || (deadlineMs && Date.now() - startedAt > deadlineMs)) {
      skipped.push(shop.name);
      continue;
    }
    results.push(await diagnoseRetailer(shop, query, { fetchImpl, signal }));
  }

  const counted = results.filter((row) => COUNTED.has(row.status));
  const priced = counted.filter((row) => row.status === 'ok');
  const tally = {};
  for (const row of results) tally[row.status] = (tally[row.status] || 0) + 1;

  return {
    query,
    checkedAt: new Date().toISOString(),
    control,
    networkBlocked: false,
    ladder: ladderFor(query),
    strategies: availableStrategies(),
    shops: results,
    skipped,
    reached: counted.length,
    priced: priced.length,
    // Null rather than zero when nothing was reached: no measurement is not
    // the same as a measurement of nought.
    hitRate: counted.length ? Math.round((priced.length / counted.length) * 100) : null,
    broadened: priced.filter((row) => row.broadened).length,
    tally,
    elapsedMs: Date.now() - startedAt,
  };
};
