/**
 * Adaptation suppression — the memory that a household said "not for me".
 *
 * When Forq adapts something (a quantity, the portions) and the household
 * undoes it, that reversal must survive list regeneration: the same change
 * silently reappearing on the next refresh is the fastest way to lose
 * trust. This module is the authoritative reading of "which adaptations are
 * currently held back, and why".
 *
 * Two questions, one rejection store:
 *
 *   - REJECTION-HELD (the trust rule): a single explicit rejection holds
 *     the adaptation for a holding period. Forq does not get to re-litigate
 *     the household's "no" on the next refresh.
 *   - INFLUENCE-SUPPRESSED (the influence rule): two rejections inside the
 *     window mean the change loses influence entirely — it is not applied,
 *     not proposed, and not shown as a live change on the adaptation card.
 *
 * Rejections are counted as whole events inside a recency window — never a
 * decayed weight, which once made two real corrections sum to 1.99 and miss
 * a threshold of 2 by accident.
 *
 * Recovery comes only from the rejection's own clock (it ages out) or from
 * genuinely new, contradictory evidence arriving through the normal
 * learning — never from the mere passage of list regenerations.
 *
 * Import-free by design: the list builder, the portions decision and the
 * eval layer all read this module; it must never reach back into them.
 */

/** Rejections inside the window before a change loses influence entirely. */
export const ADAPTATION_SUPPRESS_THRESHOLD = 2;
/** How far back a rejection still counts for influence suppression, in days. */
export const ADAPTATION_SUPPRESSION_WINDOW_DAYS = 28;
/** How long one explicit rejection holds an adaptation back, in days. */
export const ADAPTATION_REJECTION_HOLD_DAYS = 7;

const NOON = 'T12:00:00';

const dayOf = (value) => String(value || '').slice(0, 10);

const daysBetween = (from, to) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayOf(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(dayOf(to))) return null;
  return Math.round((new Date(`${dayOf(to)}${NOON}`) - new Date(`${dayOf(from)}${NOON}`)) / 86400000);
};

/**
 * Read the ledger rejections that bear on each adaptation key, plus the
 * explicit suppression stamps the undo command writes. Returns
 * `Map<key, { rejections: string[], latestDay: string|null }>` where
 * `rejections` are rejection days, oldest first.
 *
 * Two sources, one meaning:
 *   - `RecommendationRejected` ledger events with
 *     `context.kind === 'adaptation'` and a `context.key` — every undo path
 *     writes these;
 *   - `state.adaptationSuppression[key].rejections` — the explicit stamp,
 *     written alongside the ledger event so suppression survives even where
 *     a caller filters the ledger.
 */
export const adaptationRejections = (state = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const byKey = new Map();
  const entryFor = (key) => {
    let entry = byKey.get(key);
    if (!entry) {
      entry = { rejections: [], latestDay: null };
      byKey.set(key, entry);
    }
    return entry;
  };
  for (const event of ledger) {
    if (event?.type !== 'RecommendationRejected') continue;
    const context = event.context;
    if (context?.kind !== 'adaptation' || !context.key) continue;
    const entry = entryFor(String(context.key));
    const day = dayOf(event.day || event.at);
    if (day && !entry.rejections.includes(day)) entry.rejections.push(day);
  }
  // Explicit stamps merge with the ledger (dedup by day) — the stamp is the
  // backstop, not a second truth.
  const stamps = state.adaptationSuppression && typeof state.adaptationSuppression === 'object'
    ? state.adaptationSuppression
    : {};
  for (const [key, stamp] of Object.entries(stamps)) {
    if (!stamp || typeof stamp !== 'object') continue;
    const entry = entryFor(String(key));
    for (const day of Array.isArray(stamp.rejections) ? stamp.rejections : []) {
      const d = dayOf(day);
      if (d && !entry.rejections.includes(d)) entry.rejections.push(d);
    }
  }
  for (const entry of byKey.values()) entry.rejections.sort();
  return byKey;
};

/**
 * The holding state for one key, or null when no rejection stands against
 * it. Non-null whenever the key has any recorded rejection (the caller
 * decides recency); `{ key, rejections, latest }` with days oldest first.
 */
export const rejectionHoldFor = (state = {}, key) => {
  if (!key) return null;
  const entry = adaptationRejections(state).get(String(key));
  if (!entry || !entry.rejections.length) return null;
  return { key: String(key), rejections: entry.rejections.slice(), latest: entry.rejections[entry.rejections.length - 1] };
};

/**
 * Is this adaptation currently held back by an unexpired rejection? One
 * explicit rejection holds the change for ADAPTATION_REJECTION_HOLD_DAYS;
 * influence-suppressed keys (see suppressionFor) are held for as long as
 * their rejections stay inside the longer window.
 */
export const isAdaptationHeld = (state = {}, key, { today = state?.day || null } = {}) => {
  if (suppressionFor(state, key, { today })) return true;
  const hold = rejectionHoldFor(state, key);
  if (!hold || !today) return Boolean(hold);
  const age = daysBetween(hold.latest, today);
  return age != null && age >= 0 && age <= ADAPTATION_REJECTION_HOLD_DAYS;
};

/**
 * The influence-suppression record for one key, or null. Suppressed when at
 * least ADAPTATION_SUPPRESS_THRESHOLD rejections fall inside the recency
 * window ending `today`. The record carries the surviving rejection days so
 * a caller can explain WHY the change lost influence.
 */
export const suppressionFor = (state = {}, key, { today = state?.day || null } = {}) => {
  if (!key) return null;
  const entry = adaptationRejections(state).get(String(key));
  if (!entry || !entry.rejections.length) return null;
  const rejections = today
    ? entry.rejections.filter((day) => {
      const age = daysBetween(day, today);
      return age != null && age >= 0 && age <= ADAPTATION_SUPPRESSION_WINDOW_DAYS;
    })
    : entry.rejections;
  if (rejections.length < ADAPTATION_SUPPRESS_THRESHOLD) return null;
  return {
    key: String(key),
    threshold: ADAPTATION_SUPPRESS_THRESHOLD,
    rejections,
    latestDay: rejections[rejections.length - 1],
  };
};

/**
 * Every currently influence-suppressed key, as `Map<key, suppression
 * record>`. This is what the adaptation card reads to hold back changes the
 * household keeps undoing.
 */
export const suppressedAdaptations = (state = {}, { today = state?.day || null } = {}) => {
  const result = new Map();
  for (const key of adaptationRejections(state).keys()) {
    const record = suppressionFor(state, key, { today });
    if (record) result.set(String(key), record);
  }
  return result;
};

/**
 * The keys any active rejection or suppression currently holds back — the
 * set list generation must honour before applying an automatic change.
 * With a `today`, one rejection holds for ADAPTATION_REJECTION_HOLD_DAYS
 * and influence suppression for the full window; a key qualifies while
 * either applies. This is the household's "not for me" outliving every
 * refresh.
 */
export const heldAdaptationKeys = (state = {}, { today = state?.day || null } = {}) => {
  const held = new Set();
  for (const [key, entry] of adaptationRejections(state)) {
    if (suppressionFor(state, key, { today })) {
      held.add(key);
      continue;
    }
    if (!today) {
      // No clock: stay conservative — any recorded rejection holds.
      held.add(key);
      continue;
    }
    for (const day of entry.rejections) {
      const age = daysBetween(day, today);
      if (age != null && age >= 0 && age <= ADAPTATION_REJECTION_HOLD_DAYS) {
        held.add(key);
        break;
      }
    }
  }
  return held;
};
