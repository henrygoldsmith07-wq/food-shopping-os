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
 * Rejections are counted as UNIQUE EVENTS inside a recency window — never a
 * decayed weight, which once made two real corrections sum to 1.99 and miss
 * a threshold of 2 by accident, and never mere unique days, which used to
 * let two distinct same-day corrections collapse into one. Every rejection
 * event carries its ledger id; the undo command's suppression stamp records
 * those ids, so the same rejection is never counted twice through the two
 * routes (ledger + stamp) that both describe it.
 *
 * Recovery is evidence-aware, in one explainable model:
 *
 *   rejection → hold → new contradictory evidence → cautiously eligible
 *
 * A rejection holds for its holding period. It ends early only when
 * genuinely new evidence about the same ingredient arrives AFTER the
 * rejection (more of it binned, cooked, corrected) — enough events to meet
 * EVIDENCE_RECOVERY_THRESHOLD make the key eligible again. Eligibility is
 * not reapplication: the ordinary learning thresholds still decide whether
 * any new adaptation is earned, now with the fresh evidence in hand. The
 * mere passage of list regenerations clears nothing. Every decision names
 * its state and the counts behind it, so callers can explain the answer.
 *
 * Import-free by design: the list builder, the portions decision and the
 * eval layer all read this module; it must never reach back into them.
 * (One deliberate exception: `canonicalName` from aliases.js, which itself
 * imports nothing — the recovery-evidence matcher must speak the same
 * ingredient language as the ledger without importing the modules that
 * read this one.)
 */

/** Rejections inside the window before a change loses influence entirely. */
export const ADAPTATION_SUPPRESS_THRESHOLD = 2;
/** How far back a rejection still counts for influence suppression, in days. */
export const ADAPTATION_SUPPRESSION_WINDOW_DAYS = 28;
/** How long one explicit rejection holds an adaptation back, in days. */
export const ADAPTATION_REJECTION_HOLD_DAYS = 7;
/** Distinct new evidence events after a rejection that earn reconsideration. */
export const EVIDENCE_RECOVERY_THRESHOLD = 2;

/** Ledger events that count as new evidence about an ingredient. */
const EVIDENCE_EVENT_TYPES = ['IngredientWasted', 'MealCooked', 'PantryCorrected'];

import { canonicalName } from './aliases.js';

const NOON = 'T12:00:00';

const dayOf = (value) => String(value || '').slice(0, 10);

const daysBetween = (from, to) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayOf(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(dayOf(to))) return null;
  return Math.round((new Date(`${dayOf(to)}${NOON}`) - new Date(`${dayOf(from)}${NOON}`)) / 86400000);
};

/**
 * Read the ledger rejections that bear on each adaptation key, plus the
 * explicit suppression stamps the undo command writes. Returns
 * `Map<key, entry>` where entry is:
 *
 *   { events: [{ id, day }],        // unique rejection events, oldest first
 *     rejections: string[],          // their unique days, oldest first
 *     rejectionCount: number,        // unique EVENTS — the counting rule
 *     latestDay: string|null }
 *
 * Two sources, one meaning:
 *   - `RecommendationRejected` ledger events with
 *     `context.kind === 'adaptation'` and a `context.key` — every undo path
 *     writes these; each event's own id is its identity;
 *   - `state.adaptationSuppression[key]` — the explicit stamp, written
 *     alongside the ledger event so suppression survives even where a caller
 *     filters the ledger. The stamp carries the same event ids where the
 *     writer knew them; stamp days no ledger event covers become synthetic
 *     `stamp:` events, so legacy stamps still count once — never twice.
 */
export const adaptationRejections = (state = {}) => {
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const byKey = new Map();
  const entryFor = (key) => {
    let entry = byKey.get(key);
    if (!entry) {
      entry = { events: [] };
      byKey.set(key, entry);
    }
    return entry;
  };
  const addEvent = (entry, id, day) => {
    if (!day) return;
    if (entry.events.some((e) => e.id === id)) return; // one event, one count
    entry.events.push({ id: String(id), day });
  };
  for (const event of ledger) {
    if (event?.type !== 'RecommendationRejected') continue;
    const context = event.context;
    if (context?.kind !== 'adaptation' || !context.key) continue;
    const entry = entryFor(String(context.key));
    addEvent(entry, event.id || `ledger:${event.at}`, dayOf(event.day || event.at));
  }
  // Explicit stamps merge with the ledger — the stamp is the backstop, not a
  // second truth. Stamp events carry their own ids (one rejection = one
  // event, even two on the same day); a legacy stamp records days only, so
  // each uncovered day becomes one synthetic event — counted once, never
  // twice.
  const stamps = state.adaptationSuppression && typeof state.adaptationSuppression === 'object'
    ? state.adaptationSuppression
    : {};
  for (const [key, stamp] of Object.entries(stamps)) {
    if (!stamp || typeof stamp !== 'object') continue;
    const entry = entryFor(String(key));
    for (const stamped of Array.isArray(stamp.events) ? stamp.events : []) {
      if (!stamped?.day) continue;
      addEvent(entry, String(stamped.id || `stamp:${key}:${dayOf(stamped.day)}`), dayOf(stamped.day));
    }
    for (const day of Array.isArray(stamp.rejections) ? stamp.rejections : []) {
      const d = dayOf(day);
      if (!d) continue;
      if (entry.events.some((e) => e.day === d)) continue; // the day is already covered by a known event
      addEvent(entry, `stamp:${key}:${d}`, d);
    }
  }
  for (const entry of byKey.values()) {
    entry.events.sort((a, b) => a.day.localeCompare(b.day));
    entry.rejections = [...new Set(entry.events.map((e) => e.day))];
    entry.rejectionCount = entry.events.length;
    entry.latestDay = entry.events.length ? entry.events[entry.events.length - 1].day : null;
  }
  return byKey;
};

/**
 * New contradictory evidence about an ingredient, AFTER its latest
 * rejection: waste events (it kept being binned anyway), cooked meals and
 * pantry corrections — behaviour that contradicts the rejection rather than
 * confirming it. Each event counts once (unique ledger ids).
 */
export const recoveryEvidenceFor = (state = {}, key, { today = null } = {}) => {
  if (!key) return { events: 0, latestDay: null };
  const entry = adaptationRejections(state).get(String(key));
  const since = entry?.latestDay || null;
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const aliasMemory = state.aliasMemory || {};
  // Both sides resolve through the same alias table the rest of the app
  // speaks: "Chickpeas (tins)" binned after rejecting "chickpeas" is the
  // same conversation.
  const canonical = canonicalName(key, aliasMemory) || String(key).trim().toLowerCase();
  const names = new Set([String(key).trim().toLowerCase(), canonical]);
  const seen = new Set();
  let latestDay = null;
  for (const event of ledger) {
    if (!EVIDENCE_EVENT_TYPES.includes(event?.type)) continue;
    const raw = String(event?.name || event?.payload?.name || '').trim();
    const subject = (canonicalName(raw, aliasMemory) || raw.toLowerCase());
    if (!subject || !names.has(subject)) continue;
    if (since && dayOf(event.day || event.at) <= since) continue; // before the rejection: not new
    if (today) {
      const age = daysBetween(dayOf(event.day || event.at), dayOf(today));
      if (age == null || age < 0) continue; // future events are not evidence yet
    }
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const day = dayOf(event.day || event.at);
    if (day && (!latestDay || day > latestDay)) latestDay = day;
  }
  return { events: seen.size, latestDay };
};

/**
 * The full, explainable suppression decision for one key — the single
 * function callers can quote when asked "why is this change not applied?".
 * Returns `{ state, ... }` where state is one of:
 *
 *   - 'clear'                — no rejection stands; nothing held.
 *   - 'rejected'             — inside the rejection hold; days left named.
 *   - 'suppressed'           — influence removed for the window; rejections
 *                              named.
 *   - 'recovery-eligible'    — the hold would still run, but enough new
 *                              contradictory evidence arrived after the
 *                              rejection to earn reconsideration. This is
 *                              ELIGIBILITY, not reapplication: the ordinary
 *                              learning thresholds still decide whether any
 *                              new adaptation is actually earned.
 */
export const suppressionDecision = (state = {}, key, { today = state?.day || null } = {}) => {
  const entry = adaptationRejections(state).get(String(key));
  const rejections = entry?.rejections || [];
  if (!rejections.length) return { state: 'clear', key: String(key) };
  const latest = entry.latestDay;
  const holdActive = today
    ? (() => {
      const age = daysBetween(latest, today);
      return age != null && age >= 0 && age <= ADAPTATION_REJECTION_HOLD_DAYS;
    })()
    : true; // no clock: stay conservative
  const influenceSuppressed = Boolean(suppressionFor(state, key, { today }));
  const evidence = recoveryEvidenceFor(state, key, { today });
  const recovered = evidence.events >= EVIDENCE_RECOVERY_THRESHOLD;
  if (influenceSuppressed) {
    return {
      state: recovered ? 'recovery-eligible' : 'suppressed',
      key: String(key),
      rejections,
      rejectionCount: entry.rejectionCount,
      latestRejection: latest,
      recoveryEvidence: evidence.events,
      recoveryEvidenceNeeded: EVIDENCE_RECOVERY_THRESHOLD,
      recoveryLatestDay: evidence.latestDay,
    };
  }
  if (!holdActive) return { state: 'clear', key: String(key), rejections, rejectionCount: entry.rejectionCount, note: 'rejection hold expired' };
  if (recovered) {
    return {
      state: 'recovery-eligible',
      key: String(key),
      rejections,
      rejectionCount: entry.rejectionCount,
      latestRejection: latest,
      recoveryEvidence: evidence.events,
      recoveryEvidenceNeeded: EVIDENCE_RECOVERY_THRESHOLD,
      recoveryLatestDay: evidence.latestDay,
    };
  }
  const age = today ? daysBetween(latest, today) : null;
  return {
    state: 'rejected',
    key: String(key),
    rejections,
    rejectionCount: entry.rejectionCount,
    latestRejection: latest,
    holdDaysLeft: age == null ? null : Math.max(0, ADAPTATION_REJECTION_HOLD_DAYS - age),
    recoveryEvidence: evidence.events,
    recoveryEvidenceNeeded: EVIDENCE_RECOVERY_THRESHOLD,
    recoveryLatestDay: evidence.latestDay,
  };
};

/**
 * Is this adaptation currently held back — an unexpired rejection, or full
 * influence suppression — without enough new evidence to earn
 * reconsideration? One explicit rejection holds the change for
 * ADAPTATION_REJECTION_HOLD_DAYS; influence-suppressed keys (see
 * suppressionFor) are held for as long as their rejections stay inside the
 * longer window. Genuinely new contradictory evidence ends the hold early.
 */
export const isAdaptationHeld = (state = {}, key, { today = state?.day || null } = {}) => {
  const decision = suppressionDecision(state, key, { today });
  return decision.state === 'rejected' || decision.state === 'suppressed';
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
  if (!entry || !entry.events.length) return null;
  // Unique EVENTS inside the window — two corrections on the same day are
  // two rejections, and the threshold is met by exactly that many events.
  const events = today
    ? entry.events.filter((e) => {
      const age = daysBetween(e.day, today);
      return age != null && age >= 0 && age <= ADAPTATION_SUPPRESSION_WINDOW_DAYS;
    })
    : entry.events;
  if (events.length < ADAPTATION_SUPPRESS_THRESHOLD) return null;
  return {
    key: String(key),
    threshold: ADAPTATION_SUPPRESS_THRESHOLD,
    events,
    rejectionCount: events.length,
    rejections: [...new Set(events.map((e) => e.day))],
    latestDay: events[events.length - 1].day,
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
  for (const [key] of adaptationRejections(state)) {
    const { state: decision } = suppressionDecision(state, key, { today });
    // 'recovery-eligible' is deliberately NOT held: enough new contradictory
    // evidence has arrived to earn reconsideration — holding the row would
    // make the recovery a lie.
    if (decision === 'rejected' || decision === 'suppressed') held.add(key);
  }
  return held;
};
