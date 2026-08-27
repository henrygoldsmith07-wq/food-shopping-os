/**
 * Does the scraper actually work against the real web?
 *
 * The unit suite proves the parsing logic is right against a mocked fetch.
 * That is a different claim from "a real supermarket will give us a price",
 * and no amount of mocking closes the gap.
 *
 * This runs the shipped code — the same robots gate, the same fetch ladder,
 * the same matching rule — against the real retailers, and reports shop by
 * shop what it met. It shares every line of that logic with the `?diagnose=`
 * mode on the deployed app, so the two cannot drift into disagreeing about
 * what the scraper does.
 *
 *   npm run check:scraper
 *   npm run check:scraper -- --query "2 pints semi-skimmed milk"
 *   npm run check:scraper -- --retailer tesco --json
 *
 * If this machine cannot reach the open web — a corporate proxy, a VPN, a
 * sandbox egress policy — it says so and measures nothing, rather than
 * reporting nine identical failures as nine retailers refusing you.
 */

import { diagnoseScraper } from '../src/server/scrape-diagnostics.js';
import { activeProvider, rankedFreeModels } from '../src/server/openrouter.js';
import { USER_AGENT } from '../src/server/crawler.js';

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const query = arg('query', 'baked beans');
const retailer = arg('retailer');
const pad = (value, width) => String(value).padEnd(width);
const line = (char = '-') => console.log(char.repeat(78));

const report = await diagnoseScraper(query, {
  retailerIds: retailer ? [retailer] : [],
});

if (flag('json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`\nScraper reality check — searching for "${query}"`);
console.log(`User agent: ${USER_AGENT}`);
line('=');

if (report.networkBlocked) {
  console.log('NO OUTBOUND NETWORK FROM THIS MACHINE');
  console.log(`  Control host ${report.control.url} answered ${report.control.status ?? 'nothing'}`);
  if (report.control.note) console.log(`  ${report.control.note}`);
  console.log('');
  console.log(`  ${report.note}`);
  console.log('  Run this again from a machine with ordinary internet access, or open');
  console.log('  /api/integrations/scrape-prices?diagnose=baked+beans on the deployed app.');
  line('=');
  process.exit(0);
}

console.log(`Query ladder: ${report.ladder.map((rung) => `"${rung}"`).join(' → ')}`);
console.log(`Fetch strategies: ${report.strategies.join(' → ') || '(none)'}`);
line('=');

for (const shop of report.shops) {
  process.stdout.write(`${pad(shop.retailer, 16)} `);
  if (shop.status === 'ok') {
    const widened = shop.broadened ? ` (widened to "${shop.searched}")` : '';
    console.log(`OK via ${shop.via}${widened} — £${shop.price.toFixed(2)} "${String(shop.product).slice(0, 44)}" [${shop.method}]`);
  } else if (shop.status === 'declined') {
    console.log(`DECLINED by robots.txt (${shop.robots})`);
  } else if (shop.status === 'network-blocked') {
    console.log('BLOCKED BY THIS NETWORK (not by the shop)');
  } else if (shop.status === 'no-match') {
    // The useful distinction: a page full of the wrong products is not an
    // empty page, and the two need completely different work to fix.
    const best = shop.attempts.filter((a) => a.ok).sort((a, b) => b.parsed - a.parsed)[0];
    console.log(best
      ? `NO MATCH — best attempt ${best.strategy} read ${Math.round(best.bytes / 1024)}KB, parsed ${best.parsed} product(s), 0 matching`
      : 'NO MATCH');
  } else {
    const codes = shop.attempts.filter((a) => !a.ok).map((a) => a.code).join(', ');
    console.log(`${shop.status.toUpperCase()}${codes ? ` — ${codes}` : ''}`);
  }
}

line('=');
console.log(Object.entries(report.tally).map(([k, v]) => `${k}: ${v}`).join('  ·  '));
console.log(report.hitRate === null
  ? 'Hit rate: not measured — no shop was reached.'
  : `Hit rate: ${report.hitRate}% of the ${report.reached} shop(s) actually reached`
    + (report.broadened ? ` · ${report.broadened} needed a widened search` : ''));
if (report.skipped.length) console.log(`Skipped for time: ${report.skipped.join(', ')}`);

line();
console.log(`AI provider: ${activeProvider().name} (${activeProvider().baseUrl})`);
try {
  const models = await rankedFreeModels();
  if (!models.length) console.log('  Catalogue returned nothing — check the key and the base URL.');
  else {
    console.log(`  ${models.length} chat-capable models. Top of the ladder:`);
    for (const model of models.slice(0, 5)) console.log(`    ${model}`);
  }
} catch (error) {
  console.log(`  Could not read the catalogue: ${error.message}`);
}
line();
