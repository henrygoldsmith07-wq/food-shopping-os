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
import { isScrapeAllowed } from '../src/server/robots.js';
import { USER_AGENT, availableStrategies, runStrategy } from '../src/server/crawler.js';
import { deterministicPass } from '../src/server/price-scraper.js';
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

console.log(`\nScraper reality check — searching for "${query}"`);
console.log(`User agent: ${USER_AGENT}`);
console.log(`Fetch strategies available: ${availableStrategies().join(' → ') || '(none)'}`);
line('=');

const tally = { declined: 0, blocked: 0, unreachable: 0, empty: 0, priced: 0 };

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
  if (!permission.allowed) {
    console.log(`DECLINED by robots.txt (${permission.reason})`);
    tally.declined += 1;
    continue;
  }

  // 2. Walk the ladder, reporting each rung rather than only the outcome.
  let priced = false;
  for (const strategy of availableStrategies()) {
    try {
      const page = await runStrategy(strategy, url);
      const parsed = deterministicPass(page, query);
      const size = (page.html || page.markdown || '').length;
      if (parsed.rows.length) {
        const cheapest = [...parsed.rows].sort((a, b) => a.price - b.price)[0];
        console.log(`OK via ${strategy} — ${parsed.rows.length} row(s), cheapest £${cheapest.price.toFixed(2)} "${cheapest.name.slice(0, 40)}" [${cheapest.method}]`);
        priced = true;
        break;
      }
      process.stdout.write(`${strategy}: fetched ${Math.round(size / 1024)}KB but no prices; `);
    } catch (error) {
      process.stdout.write(`${strategy}: ${error.code || error.message}; `);
    }
  }
  if (priced) {
    tally.priced += 1;
  } else {
    console.log('no price');
    tally.empty += 1;
  }
}

line('=');
console.log(`Priced: ${tally.priced}  ·  Declined by robots: ${tally.declined}  ·  No price: ${tally.empty}  ·  Errors: ${tally.unreachable}`);

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
