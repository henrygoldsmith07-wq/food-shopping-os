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
 *   rejection → held → evidence accumulated → reconsideration eligible
 *
 * A rejection holds for its holding period. It ends early only when
 * genuinely new, ATTRIBUTABLE evidence about the same subject arrives
 * AFTER the rejection — enough events to meet EVIDENCE_RECOVERY_THRESHOLD
 * make the key eligible again. Eligibility is not reapplication: the
 * ordinary learning thresholds still decide whether any new adaptation is
 * earned, now with the fresh evidence in hand. The mere passage of list
 * regenerations clears nothing. Every decision names its state, its
 * recovery stage and the counts behind it, so callers can explain the
 * answer.
 *
 * Attribution is domain-specific, because evidence that cannot be tied to
 * the suppressed adaptation is noise, not recovery:
 *
 *   - ingredient quantity adaptations recover on the ingredient's own
 *     record: further waste events for it, purchase outcomes that name it,
 *     pantry corrections resolved to it BY ID, and direct shopping-quantity
 *     corrections for it. A MealCooked names a recipe, never an ingredient,
 *     so it NEVER counts as recovery evidence for an ingredient key;
 *   - the learned-portions adaptation recovers on portion evidence: cooked
 *     meals that actually recorded a portion count, and explicit household
 *     portion corrections.
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
 * The portion adaptation's key — the one recovery subject that is not an
 * ingredient. Its evidence speaks portions, not ingredient names.
 */
const PORTIONS_KEY = 'portions';

/**
 * The calendar day of any dated record. Writers differ: ledger events carry
 * `day` (and an ISO `at`), prediction corrections carry `date` and a
 * NUMERIC `at` (epoch millis). All three must resolve to YYYY-MM-DD or the
 * event says nothing about when it happened.
 */
const eventDay = (event) => {
  const day = dayOf(event?.day || event?.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const at = event?.at;
  if (typeof at === 'number' && Number.isFinite(at)) return new Date(at).toISOString().slice(0, 10);
  const stamp = dayOf(at);
  return /^\d{4}-\d{2}-\d{2}$/.test(stamp) ? stamp : '';
};

/**
 * Does this ingredient-named event speak about `key`? Both sides resolve
 * through the same alias table the rest of the app speaks: "Chickpeas
 * (tins)" binned after rejecting "chickpeas" is the same conversation.
 */
const namesIngredient = (raw, names, aliasMemory) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  const subject = canonicalName(trimmed, aliasMemory) || trimmed.toLowerCase();
  return subject && names.has(subject);
};

/**
 * New contradictory evidence for one suppressed adaptation, AFTER its
 * latest rejection — only events that can be RELIABLY ATTRIBUTED to the
 * adaptation's subject count. Each event counts once (unique ledger ids).
 *
 * Ingredient keys accept: IngredientWasted naming the ingredient,
 * IngredientPurchased outcomes naming it, PantryCorrected events whose
 * correction ids resolve through `state.pantry` to the ingredient (id-based
 * attribution — the event payload carries ids, not names), and direct
 * 'shopping-qty' prediction corrections for it. MealCooked names a recipe,
 * never an ingredient, and is deliberately NOT ingredient evidence.
 *
 * The 'portions' key accepts: MealCooked events that actually recorded a
 * portion count (a cook without a recorded portion says nothing about
 * portions), and explicit household portion corrections.
 *
 * Future events (relative to `today`) are not evidence yet.
 */
export const recoveryEvidenceFor = (state = {}, key, { today = null } = {}) => {
  if (!key) return { events: 0, latestDay: null, kinds: {} };
  const entry = adaptationRejections(state).get(String(key));
  const since = entry?.latestDay || null;
  const ledger = Array.isArray(state.householdLedger) ? state.householdLedger : [];
  const aliasMemory = state.aliasMemory || {};
  const isPortions = String(key) === PORTIONS_KEY;
  // Both sides meet on the canonical name so a raw key still matches its row.
  const canonical = isPortions ? PORTIONS_KEY
    : (canonicalName(key, aliasMemory) || String(key).trim().toLowerCase());
  const names = new Set([String(key).trim().toLowerCase(), canonical]);
  const pantryById = new Map((Array.isArray(state.pantry) ? state.pantry : [])
    .filter((p) => p && p.id != null).map((p) => [String(p.id), p]));
  const seen = new Set();
  const kinds = {};
  let latestDay = null;
  const count = (event, kind) => {
    const id = String(event?.id || `ledger:${event?.at}`);
    if (seen.has(id)) return;
    seen.add(id);
    kinds[kind] = (kinds[kind] || 0) + 1;
    const day = eventDay(event);
    if (day && (!latestDay || day > latestDay)) latestDay = day;
  };
  const isFresh = (event) => {
    const day = eventDay(event);
    if (since && day <= since) return false; // before the rejection: not new
    if (today) {
      const age = daysBetween(day, dayOf(today));
      if (age == null || age < 0) return false; // future events are not evidence yet
    }
    return Boolean(day);
  };
  for (const event of ledger) {
    if (!event || !isFresh(event)) continue;
    if (isPortions) {
      // Portion evidence only: a cook that recorded HOW MANY it made, or an
      // explicit household portion correction. Everything else is noise.
      if (event.type === 'MealCooked' && event.portions != null
        && Number.isFinite(Number(event.portions))) count(event, 'cooked-portion-observation');
      else if (event.type === 'prediction_correction'
        && String(event.predictionType || '') === 'portions') count(event, 'portion-correction');
      continue;
    }
    if (event.type === 'IngredientWasted' && namesIngredient(event.name, names, aliasMemory)) {
      count(event, 'ingredient-wasted');
    } else if (event.type === 'IngredientPurchased') {
      // Purchase outcome: the household bought it again. The event carries
      // the bought names (recordShop and purchaseIngredients both write them).
      const boughtNames = Array.isArray(event.items) ? event.items : [event.name];
      if (boughtNames.some((n) => namesIngredient(n, names, aliasMemory))) count(event, 'purchase-outcome');
    } else if (event.type === 'PantryCorrected') {
      // The payload names correction IDS, not ingredients — resolve each
      // through the pantry it corrected. An id that no longer resolves, or
      // resolves to a different ingredient, is NOT attributable evidence.
      const corrections = Array.isArray(event.corrections) ? event.corrections : [];
      if (corrections.some((id) => {
        const item = pantryById.get(String(id));
        return item && namesIngredient(item.name, names, aliasMemory);
      })) count(event, 'pantry-correction');
    } else if (event.type === 'prediction_correction'
      && String(event.predictionType || '') === 'shopping-qty'
      && namesIngredient(event.predictionKey, names, aliasMemory)) {
      count(event, 'quantity-correction');
    }
    // Deliberately unmatched: MealCooked (recipe-scoped, cannot name an
    // ingredient), MealSkipped, leftovers — none can be attributed to this
    // ingredient without guessing, and a guess is not recovery.
  }
  return { events: seen.size, latestDay, kinds };
};

/**
 * The recovery ladder, in one explainable field alongside `state`:
 *
 *   'rejected'                 — inside the hold, no new evidence yet.
 *   'held'                     — influence-suppressed, no new evidence yet.
 *   'evidence-accumulated'     — some attributable evidence has arrived
 *                                since the rejection, but not enough to
 *                                earn reconsideration.
 *   'reconsideration-eligible' — enough attributable evidence arrived; the
 *                                ordinary learning thresholds now decide.
 *
 * `state` keeps its coarser vocabulary ('rejected' | 'suppressed' |
 * 'recovery-eligible' | 'clear') for existing callers; `recoveryStage` is
 * the fine-grained answer to "where is this key on the recovery path?".
 */
const recoveryStageFor = ({ influenceSuppressed, evidenceEvents }) => {
  if (evidenceEvents >= EVIDENCE_RECOVERY_THRESHOLD) return 'reconsideration-eligible';
  if (evidenceEvents > 0) return 'evidence-accumulated';
  return influenceSuppressed ? 'held' : 'rejected';
};

/**
 * The full, explainable suppression decision for one key — the single
 * function callers can quote when asked "why is this change not applied?".
 * Returns `{ state, recoveryStage, ... }` where state is one of:
 *
 *   - 'clear'                — no rejection stands; nothing held.
 *   - 'rejected'             — inside the rejection hold; days left named.
 *   - 'suppressed'           — influence removed for the window; rejections
 *                              named.
 *   - 'recovery-eligible'    — the hold would still run, but enough new
 *                              attributable evidence arrived after the
 *                              rejection to earn reconsideration. This is
 *                              ELIGIBILITY, not reapplication: the ordinary
 *                              learning thresholds still decide whether any
 *                              new adaptation is actually earned.
 *
 * `recoveryStage` carries the fine-grained ladder: rejected → held →
 * evidence-accumulated → reconsideration-eligible, with the per-kind
 * evidence breakdown that earned the stage.
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
  const stage = recoveryStageFor({ influenceSuppressed, evidenceEvents: evidence.events });
  const explain = (extra = {}) => ({
    key: String(key),
    rejections,
    rejectionCount: entry.rejectionCount,
    latestRejection: latest,
    recoveryStage: stage,
    recoveryEvidence: evidence.events,
    recoveryEvidenceNeeded: EVIDENCE_RECOVERY_THRESHOLD,
    recoveryKinds: evidence.kinds || {},
    recoveryLatestDay: evidence.latestDay,
    ...extra,
  });
  if (influenceSuppressed) {
    return { state: recovered ? 'recovery-eligible' : 'suppressed', ...explain() };
  }
  if (!holdActive) return { state: 'clear', key: String(key), rejections, rejectionCount: entry.rejectionCount, note: 'rejection hold expired' };
  if (recovered) return { state: 'recovery-eligible', ...explain() };
  const age = today ? daysBetween(latest, today) : null;
  return {
    state: 'rejected',
    ...explain({ holdDaysLeft: age == null ? null : Math.max(0, ADAPTATION_REJECTION_HOLD_DAYS - age) }),
  };
};

/**
 * Is this adaptation currently held back — an unexpired rejection, or full
 * influence suppression — without enough new evidence to earn
 * reconsideration? One explicit rejection holds the change for
 * ADAPTATION_REJECTION_HOLD_DAYS; influence-suppressed keys (see
 * suppressionFor) are held for as long as their rejections stay inside the
 * longer window. Genuinely new ATTRIBUTABLE evidence (see
 * recoveryEvidenceFor) ends the hold early; a MealCooked that cannot be
 * tied to the ingredient never does.
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
