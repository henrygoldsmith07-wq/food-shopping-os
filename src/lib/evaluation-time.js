/**
 * Evaluation time policy — the ONE clock and window every accuracy metric shares.
 *
 * "How accurate was the advice?" is only answerable inside a time frame both
 * sides of the comparison can see. Quantity accuracy, spend accuracy and
 * basket reconciliation previously each rolled their own date guard (some
 * silently ignoring the supplied `today`, some never checking it at all), so
 * a future-dated record could score in one metric and be invisible in
 * another. This module is the shared policy:
 *
 *   - `evaluationToday({ today })` — resolve THE clock once. A malformed
 *     `today` is a hard failure of the evaluation frame: metrics that use
 *     it must exclude rather than fall back to the real system date, which
 *     would make a backtest a lie. The default is the real day only when
 *     the caller genuinely supplies nothing.
 *   - `signedAgeDays(day, today)` — today − day, in whole days. Negative
 *     means the record is in the future.
 *   - `gateRecordDay(day, today, windowDays)` — the one decision every
 *     dated record passes through: malformed → 'malformed-day', future →
 *     'future', outside the window → 'outside-window', otherwise 'ok'.
 *
 * Metrics must not re-derive these rules; a sample excluded by one metric
 * is excluded by all of them, with the same reason vocabulary.
 */

import { dayStamp } from './kitchen-dates.js';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isCanonicalDay = (value) => DAY_RE.test(String(value || '').slice(0, 10));

export const canonicalDay = (value) => {
  const stamp = String(value || '').slice(0, 10);
  return DAY_RE.test(stamp) ? stamp : null;
};

/**
 * The evaluation clock. `null` today means "no usable clock was supplied":
 * callers keep their existing behaviour for a truly missing argument (the
 * real day) but MUST treat an explicit malformed `today` as no clock —
 * silently substituting the system date inside a backtest would answer a
 * different question than the one asked.
 */
export const evaluationToday = ({ today } = {}) => canonicalDay(today);

/** Signed age in whole days: today − day (noon-anchored, timezone-safe). */
export const signedAgeDays = (day, today) => {
  const from = canonicalDay(day);
  const to = canonicalDay(today);
  if (!from || !to) return null;
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
};

/**
 * Gate one dated record for evaluation. Returns one of:
 *   'ok' | 'malformed-day' | 'future' | 'outside-window'
 * with `today: null` (no usable clock) records score only if undated rules
 * say so — dated evaluation needs a clock, so dated records are gated out
 * as 'no-evaluation-today' rather than guessed against the system date.
 */
export const gateRecordDay = (day, today, { windowDays = Infinity } = {}) => {
  const stamp = canonicalDay(day);
  if (!stamp) return 'malformed-day';
  if (!today) return 'no-evaluation-today';
  const age = signedAgeDays(stamp, today);
  if (age == null) return 'malformed-day';
  if (age < 0) return 'future';
  if (Number.isFinite(windowDays) && age > windowDays) return 'outside-window';
  return 'ok';
};

/** Convenience wrapper: the real day, only when the caller passed nothing at all. */
export const defaultToday = () => dayStamp();
