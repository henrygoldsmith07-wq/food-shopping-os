/**
 * What the paid rung earned, counted locally.
 *
 * The Monid balance says what the rung cost; this says what it bought. Every
 * run stamps each item it asked Monid about with an outcome — rows back, or
 * the miss's reason — so folding those stamps into a trailing-week tally
 * answers the only question that matters before spending more: of the gaps
 * the shops left, how many did Monid actually fill?
 *
 * Deliberately on-device beside the price history: these tallies are tied to
 * this household's shopping list and never need to leave the device. One
 * tally per day, the trailing seven kept — a rollup older than that has
 * stopped being an answer to "is this earning its keep lately".
 */

const STORAGE_KEY = 'forq.monidRollup.v1';
/** Days kept. A trailing week, then the oldest falls off. */
const MAX_DAYS = 7;

const today = (date = new Date()) => date.toISOString().slice(0, 10);

const read = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const write = (store) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or private browsing. A tally nobody can keep is not a promise broken.
  }
};

/**
 * Fold one checked run into the daily tally.
 *
 * `byKey` is what `checkLivePricesForList` produces; the stamps that matter
 * are the `monid` fields on each entry. Counts are of items, not rows —
 * "Monid filled the milk" is the fact a shopper acts on, whatever number of
 * prices came back for it.
 */
export const recordMonidOutcomes = (byKey = {}, { date = today() } = {}) => {
  const tally = { filled: 0, missed: 0, failed: 0, paused: 0 };
  for (const entry of Object.values(byKey)) {
    if (!entry?.monid) continue; // Monid was never asked — not part of the story
    if (entry.monid.status === 'ok' && (entry.monid.rows || 0) > 0) tally.filled += 1;
    else if (entry.monid.paused) tally.paused += 1;
    else if (entry.monid.status === 'ok' || entry.monid.status === 'no-match') tally.missed += 1;
    else tally.failed += 1; // error, timeout, disabled mid-run — the rung's fault, not the catalogue's
  }
  if (!tally.filled && !tally.missed && !tally.failed && !tally.paused) return read();

  const store = read();
  const day = store[date] || { filled: 0, missed: 0, failed: 0, paused: 0 };
  // Same day accumulates across runs: two shops in one day are one week's story.
  store[date] = {
    filled: day.filled + tally.filled,
    missed: day.missed + tally.missed,
    failed: day.failed + tally.failed,
    paused: day.paused + tally.paused,
  };
  const cutoff = new Date(Date.now() - MAX_DAYS * 86400000).toISOString().slice(0, 10);
  for (const key of Object.keys(store)) {
    if (key < cutoff) delete store[key];
  }
  write(store);
  return store;
};

/** The trailing week's tally, oldest day first. Empty when nothing was asked. */
export const monidRollup = ({ date = new Date() } = {}) => {
  const store = read();
  const days = [];
  for (let offset = MAX_DAYS - 1; offset >= 0; offset -= 1) {
    const key = today(new Date(date.getTime() - offset * 86400000));
    days.push({ date: key, ...(store[key] || { filled: 0, missed: 0, failed: 0, paused: 0 }) });
  }
  const totals = days.reduce(
    (sum, day) => ({
      filled: sum.filled + day.filled,
      missed: sum.missed + day.missed,
      failed: sum.failed + day.failed,
      paused: sum.paused + day.paused,
    }),
    { filled: 0, missed: 0, failed: 0, paused: 0 },
  );
  return { days, totals };
};

export const clearMonidRollup = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear is the same outcome as a cleared store.
  }
};
