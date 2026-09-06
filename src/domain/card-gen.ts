// Kitchen-grounded flashcards — the deck a food app earns.
//
// The manual form makes a card from what the user types; this makes cards
// from what the user actually does. Each template below reads one slice of
// real activity — trips, the diary, the pantry, the cooker — and turns it
// into a question the user can answer from memory, so reviewing the deck is
// reviewing their own kitchen rather than an abstract syllabus.
//
// Pure domain: activity data in, candidate drafts out, no storage, no clock
// except the injected `now`. Every template fires only when its data exists,
// and each candidate carries a stable `seedKey` so re-seeding never
// duplicates a card the deck already holds.

import type { Card, CardDraft, Id } from "./types";

/** The slices of app state these cards read — shaped minimally so any store
 * state that has the fields fits structurally. */
export interface KitchenActivity {
  shops?: { id: Id; date: string; store?: string; total?: number; items?: { name: string }[] }[];
  log?: Record<string, { name?: string }[]>;
  pantry?: { id: Id; name: string; expiry?: string }[];
  cooked?: { recipeId: Id; date: string }[];
  myRecipes?: { id: Id; name: string }[];
  /** The week plan — date → slot → recipe id; the plan-reading templates
   * (tonight, swaps) resolve ids through the same book as everything else. */
  plan?: Record<string, Record<string, Id>>;
  /** Plan outcomes — the missed-meal template reads the skips, the swap and
   * leftovers templates read the deviations. */
  mealPlanEvents?: {
    date: string;
    slot: string;
    status?: string;
    reason?: string | null;
    isTakeaway?: boolean;
    plannedRecipeId?: Id | null;
    actualRecipeId?: Id | null;
  }[];
}

/** How a recipe id becomes a display name; null means it can't be named. */
export type RecipeNameResolver = (id: Id) => string | null;

/** A candidate card plus the stable key that prevents re-seeding it. Ids are
 * assigned by the caller at seed time, so candidates carry none. */
export type CardCandidate = Omit<CardDraft, "id"> & { seedKey: string };

const DAY_MS = 86_400_000;
const dayStamp = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** A shop's date is a day key; filter to trips on or after `since`. */
const shopSince = (a: { date: string }, since: string): boolean => a.date >= since;

/** Which item name appeared on the most trips in a window of shops. */
function mostBought(activity: KitchenActivity, since: string): { name: string; trips: number } | null {
  const trips = (activity.shops || []).filter((s) => shopSince(s, since));
  const counts = new Map<string, number>();
  for (const trip of trips) {
    const seen = new Set<string>();
    for (const item of trip.items || []) {
      if (!item.name || seen.has(item.name)) continue;
      seen.add(item.name);
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    }
  }
  let best: { name: string; trips: number } | null = null;
  for (const [name, n] of counts) {
    if (!best || n > best.trips) best = { name, trips: n };
  }
  return best;
}

/**
 * Candidate cards drawn from the user's own kitchen activity. Ordered with
 * the most personal first; every template that lacks data simply doesn't
 * fire, so an empty kitchen yields an empty list and nothing is invented.
 */
export function kitchenCardCandidates(
  activity: KitchenActivity,
  now: Date = new Date(),
  recipeName: RecipeNameResolver = () => null,
): CardCandidate[] {
  const today = dayStamp(now);
  const weekAgo = dayStamp(new Date(now.getTime() - 7 * DAY_MS));
  const out: CardCandidate[] = [];
  // The activity itself names its own recipes; the injected resolver is the
  // catalogue fallback for ids the user's book does not hold.
  const nameOf = (id: Id): string | null =>
    (activity.myRecipes || []).find((r) => r.id === id)?.name ?? recipeName(id);

  // What did you actually buy this week? (most frequent, most personal)
  const most = mostBought(activity, weekAgo);
  if (most) {
    out.push({
      seedKey: "shop-most",
      userId: "local",
      subjectId: "kitchen",
      topicId: "shopping",
      origin: "auto",
      front: "Which food did you buy most of this week?",
      back: most.trips > 1 ? `${most.name} — on ${most.trips} trips` : most.name,
    });
  }

  // The most recent trip, named by store and total — no week window, because
  // "most recent" means exactly that and a three-week-old trip is still real.
  const trips = [...(activity.shops || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastTrip = trips[trips.length - 1];
  if (lastTrip && typeof lastTrip.total === "number") {
    out.push({
      seedKey: "shop-total",
      userId: "local",
      subjectId: "kitchen",
      topicId: "budget",
      origin: "auto",
      front: "What did your most recent shop cost?",
      back: `${lastTrip.store || "Your shop"} — £${lastTrip.total.toFixed(2)}`,
    });
  }

  // The pantry's next expiry — the card that keeps spoilage honest.
  const expiring = (activity.pantry || [])
    .filter((p) => p.name && p.expiry && p.expiry >= today)
    .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1))[0];
  if (expiring) {
    out.push({
      seedKey: "pantry-expiring",
      userId: "local",
      subjectId: "kitchen",
      topicId: "pantry",
      origin: "auto",
      front: "Which pantry item is next to expire?",
      back: `${expiring.name} — expires ${expiring.expiry}`,
    });
  }

  // The most recent diary entry, read straight from the log.
  const days = Object.keys(activity.log || {}).sort().reverse();
  const latestEntry = days.flatMap((d) => activity.log?.[d] || []).find((e) => e.name);
  if (latestEntry?.name) {
    out.push({
      seedKey: "log-recent",
      userId: "local",
      subjectId: "kitchen",
      topicId: "diary",
      origin: "auto",
      front: "Which food did you log most recently?",
      back: latestEntry.name,
    });
  }

  // The last thing cooked — only when the recipe can actually be named.
  const lastCooked = [...(activity.cooked || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).reverse()[0];
  if (lastCooked) {
    const name = nameOf(lastCooked.recipeId);
    if (name) {
      out.push({
        seedKey: "cooked-last",
        userId: "local",
        subjectId: "kitchen",
        topicId: "cooking",
        origin: "auto",
        front: "What did you last cook?",
        back: name,
      });
    }
  }

  // The most recent planned meal skipped this week — the waste log's third
  // bucket, surfaced as a question. Takeaway nights are excluded: the app
  // counts those separately (household-outcomes), so a takeaway is not a
  // skip. A leftovers-available skip is excluded too — the household ate
  // leftovers *instead* of the dish, which is the deliberate win the
  // leftovers template below owns, not a missed meal. Only meals the plan
  // can actually name become cards. The reason rides on the card so the
  // review can show why the dish was skipped.
  const skipped = (activity.mealPlanEvents || [])
    .filter((e) =>
      e.status === "skipped"
      && !e.isTakeaway
      && e.reason !== "takeaway"
      && e.reason !== "leftovers-available"
      && e.plannedRecipeId
      && e.date >= weekAgo,
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .reverse()[0];
  if (skipped) {
    const name = nameOf(skipped.plannedRecipeId);
    if (name) {
      out.push({
        seedKey: "missed-meal",
        userId: "local",
        subjectId: "kitchen",
        topicId: "cooking",
        origin: "auto",
        front: "Which planned meal did you skip this week?",
        back: `${name} — ${skipped.date}`,
        skippedReason: skipped.reason || "other",
      });
    }
  }

  // The plan's dinner for tonight — the card that looks forward instead of
  // back. Only a dinner the plan actually names becomes a card: a free
  // evening (nothing planned) or an unnameable dish asks nothing.
  const tonightRecipeId = activity.plan?.[today]?.dinner;
  if (tonightRecipeId) {
    const name = nameOf(tonightRecipeId);
    if (name) {
      out.push({
        seedKey: "plan-tonight",
        userId: "local",
        subjectId: "kitchen",
        topicId: "cooking",
        origin: "auto",
        front: "What's planned for dinner tonight?",
        back: name,
      });
    }
  }

  // The most recent meal the plan swapped this week — the slot said one
  // dish, the kitchen cooked another. Both sides must be nameable; a swap
  // into something the book cannot name tells nothing.
  const swapped = (activity.mealPlanEvents || [])
    .filter((e) =>
      e.status === "substituted"
      && e.plannedRecipeId
      && e.actualRecipeId
      && e.date >= weekAgo,
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .reverse()[0];
  if (swapped) {
    const plannedName = nameOf(swapped.plannedRecipeId!);
    const actualName = nameOf(swapped.actualRecipeId!);
    if (plannedName && actualName) {
      out.push({
        seedKey: "plan-swapped",
        userId: "local",
        subjectId: "kitchen",
        topicId: "cooking",
        origin: "auto",
        front: "Which planned meal did you swap this week?",
        back: `${plannedName} → ${actualName}`,
      });
    }
  }

  // The most recent meal this week that leftovers covered — the slot was
  // skipped because leftovers were available, the deliberate win: the
  // household ate what it had instead of cooking the plan. Reason-specific,
  // so the same event never also becomes a missed-meal card above.
  const covered = (activity.mealPlanEvents || [])
    .filter((e) =>
      e.status === "skipped"
      && e.reason === "leftovers-available"
      && e.plannedRecipeId
      && e.date >= weekAgo,
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .reverse()[0];
  if (covered) {
    const name = nameOf(covered.plannedRecipeId!);
    if (name) {
      out.push({
        seedKey: "leftovers-covered",
        userId: "local",
        subjectId: "kitchen",
        topicId: "cooking",
        origin: "auto",
        front: "Which planned meal did leftovers cover this week?",
        back: `${name} — ${covered.date}`,
      });
    }
  }

  return out;
}

/** The outcome of folding fresh candidates into an existing deck. */
export interface SeedPlan {
  /** Candidates the deck does not hold yet — drafts needing ids and insertion. */
  additions: CardCandidate[];
  /** Existing auto cards whose stored back is stale: `{ id, back }` patches.
   * A missed-meal refresh carries the new skip's `skippedReason` alongside. */
  updates: { id: Id; back: string; skippedReason?: string | null }[];
}

/**
 * Fold fresh candidates into an existing deck without duplicating or
 * fighting the user.
 *
 * A candidate whose **question** is new is an addition. One whose question
 * already exists is skipped — unless the deck's copy is an auto-seeded card
 * whose **answer** has gone stale (the week's shop-most changed, the most
 * recent trip was a different one), in which case the stored back is
 * refreshed in place. Handmade and other non-auto cards are never rewritten:
 * the user owns their words.
 */
export function planSeedMerge(candidates: CardCandidate[], deck: Card[]): SeedPlan {
  const byFront = new Map<string, Card>();
  for (const card of deck) byFront.set(card.front, card);

  const additions: CardCandidate[] = [];
  const updates: { id: Id; back: string }[] = [];
  const seenFronts = new Set<string>();
  for (const cand of candidates) {
    if (seenFronts.has(cand.front)) continue; // a template fires once per run
    seenFronts.add(cand.front);
    const existing = byFront.get(cand.front);
    if (!existing) {
      additions.push(cand);
    } else if (existing.origin === 'auto' && existing.back !== cand.back) {
      const patch: { id: Id; back: string; skippedReason?: string | null } = { id: existing.id, back: cand.back };
      // The reason travels with the answer: when the skipped meal changes,
      // why it was skipped changes with it.
      const nextReason = cand.skippedReason ?? null;
      if ((existing.skippedReason ?? null) !== nextReason) patch.skippedReason = nextReason;
      updates.push(patch);
    }
  }
  return { additions, updates };
}