/**
 * Does the price scraper actually work?
 *
 * Runs the shipped code against the real retailers and prints what happened,
 * shop by shop. It answers the question the unit tests cannot: those prove the
 * logic is right against a mocked fetch, which is a different claim from
 * "a real supermarket will give us a price".
 *
 * It is a report, not a test — nothing here fails a build. Run it, read it,
 * and you will know where the feature actually stands:
 *
 *   npm run check:scraper
 *   npm run check:scraper -- --query "baked beans" --retailer tesco
 *
 * It honours robots.txt exactly as the app does, because it calls the same
 * permission gate. A shop that declines is reported as declining and is not
 * fetched — that is the ceiling on this feature, and it is set by the
 * retailers, not by the parser.
 */

import { RETAILERS } from '../src/data/retailers.js';
import { isScrapeAllowed, looksIntercepted } from '../src/server/robots.js';
import { USER_AGENT, availableStrategies, runStrategy } from '../src/server/crawler.js';
import { deterministicPass } from '../src/server/price-scraper.js';
import { isMatch, searchQueries } from '../src/server/search-terms.js';
import { activeProvider, rankedFreeModels } from '../src/server/openrouter.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const query = arg('query', 'baked beans');
const only = arg('retailer', null);
const shops = only ? RETAILERS.filter((r) => r.id === only) : RETAILERS;

const pad = (value, width) => String(value).padEnd(width);
const line = (char = '-') => console.log(char.repeat(78));

const ladder = searchQueries(query).slice(0, 2);

console.log(`\nScraper reality check — searching for "${query}"`);
console.log(`Query ladder: ${ladder.map((rung) => `"${rung}"`).join(' → ')}`);
console.log(`User agent: ${USER_AGENT}`);
console.log(`Fetch strategies available: ${availableStrategies().join(' → ') || '(none)'}`);
line('=');

const tally = { declined: 0, blocked: 0, unreachable: 0, empty: 0, priced: 0, network: 0 };

/**
 * Can this machine reach the open web at all?
 *
 * Without this the report is worse than useless. Every shop's robots.txt goes
 * through the same connection, so a blocked network produces nine identical
 * refusals and a headline of "Priced: 0" — which reads as "the scraper does
 * not work" when it means "this machine cannot reach anything". A control
 * host that is nobody's retailer settles which of the two is true before a
 * single shop is judged.
 */
const reachable = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.text().then((text) => text.slice(0, 2000)).catch(() => '');
    if (response.ok) return { ok: true };
    return {
      ok: false,
      status: response.status,
      intercepted: looksIntercepted(body, response),
      note: body.replace(/\s+/g, ' ').trim().slice(0, 140),
    };
  } catch (error) {
    return { ok: false, status: null, intercepted: false, note: error.message };
  }
};

const control = await reachable('https://example.com/');
if (!control.ok) {
  console.log('NO OUTBOUND NETWORK FROM THIS MACHINE');
  console.log(`  Control host example.com answered ${control.status ?? 'nothing'}: ${control.note}`);
  console.log(control.intercepted
    ? '  That is a proxy, firewall or egress policy answering — not the shops.'
    : '  The request never completed.');
  console.log('');
  console.log('  Every shop below would report the same failure for the same reason,');
  console.log('  so no hit rate is measured. Run this again from a machine with');
  console.log('  ordinary internet access to get a real one.');
  line('=');
  process.exit(0);
}

for (const retailer of shops) {
  const url = retailer.search(query);
  process.stdout.write(`${pad(retailer.name, 16)} `);

  // 1. Permission. A refusal here is final: no strategy is a way around it.
  let permission;
  try {
    permission = await isScrapeAllowed(url, { userAgent: USER_AGENT });
  } catch (error) {
    console.log(`robots check threw — ${error.message}`);
    tally.unreachable += 1;
    continue;
  }
  if (permission.reason === 'network-blocked') {
    console.log('BLOCKED BY THIS NETWORK (not by the shop)');
    tally.network += 1;
    continue;
  }
  if (!permission.allowed) {
    console.log(`DECLINED by robots.txt (${permission.reason})`);
    tally.declined += 1;
    continue;
  }

  // 2. Walk both ladders — query, then fetch strategy — exactly as the app
  //    does, and count only rows that actually answer the search. Counting
  //    every parsed row was the flattering version of this report: a page of
  //    recommendations reads as "12 rows" and prices nothing.
  let priced = false;
  for (const rung of ladder) {
    const rungUrl = retailer.search(rung);
    for (const strategy of availableStrategies()) {
      try {
        const page = await runStrategy(strategy, rungUrl);
        const parsed = deterministicPass(page, rung);
        const relevant = parsed.rows.filter((row) => isMatch(row.name, query));
        const size = (page.html || page.markdown || '').length;
        if (relevant.length) {
          const cheapest = [...relevant].sort((a, b) => a.price - b.price)[0];
          const widened = rung === ladder[0] ? '' : ` (widened to "${rung}")`;
          console.log(`OK via ${strategy}${widened} — ${relevant.length} match(es), cheapest £${cheapest.price.toFixed(2)} "${cheapest.name.slice(0, 40)}" [${cheapest.method}]`);
          priced = true;
          break;
        }
        process.stdout.write(`${strategy}: ${Math.round(size / 1024)}KB, ${parsed.rows.length} row(s), 0 matching; `);
      } catch (error) {
        process.stdout.write(`${strategy}: ${error.code || error.message}; `);
      }
    }
    if (priced) break;
  }
  if (priced) {
    tally.priced += 1;
  } else {
    console.log('no match');
    tally.empty += 1;
  }
}

line('=');
const asked = tally.priced + tally.declined + tally.empty + tally.unreachable;
console.log(`Priced: ${tally.priced}  ·  Declined by robots: ${tally.declined}  ·  No match: ${tally.empty}  ·  Errors: ${tally.unreachable}`
  + (tally.network ? `  ·  Blocked by this network: ${tally.network}` : ''));
if (asked > 0) {
  // The hit rate counts shops that were actually asked. Counting shops this
  // machine could not reach would make a broken connection look like a broken
  // scraper, which is the specific lie this report exists to avoid.
  console.log(`Hit rate: ${Math.round((tally.priced / asked) * 100)}% of the ${asked} shop(s) actually reached.`);
} else {
  console.log('Hit rate: not measured — no shop was reached from this machine.');
}

// 3. The AI ladder — are the model ids real?
line();
const provider = activeProvider();
if (!provider) {
  console.log('AI fallback: no provider configured.');
} else {
  console.log(`AI provider: ${provider.id} (${provider.base})`);
  const models = await rankedFreeModels();
  if (!models.length) {
    console.log('  Catalogue returned nothing — check the key and the base URL.');
  } else {
    console.log(`  ${models.length} chat-capable models. Top of the ladder:`);
    models.slice(0, 6).forEach((id, index) => console.log(`   ${index + 1}. ${id}`));
    // The ladder is only meaningful if the named tiers actually matched.
    const named = ['nemotron', 'deepseek', 'glm', 'kimi', 'minimax', 'mistral', 'gpt-oss', 'laguna'];
    const hit = named.filter((token) => models.some((id) => id.toLowerCase().includes(token)));
    console.log(`  Named tiers present: ${hit.join(', ') || 'NONE — the ranking is falling through to the generic tail'}`);
  }
}
console.log('');
