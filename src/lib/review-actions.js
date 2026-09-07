/**
 * The flashcard review queue — the SRS engine, wired to the store.
 *
 * The scheduling domain (`createCard`, `gradeReview`, `dueCards`) is pure;
 * these actions are the thin persistence layer around it: add a card, ask
 * what is due, grade one and store the returned state. A review lands in the
 * same write as the rest of the household state, so it syncs, backs up and
 * undoes like everything else — and a miss is a no-op, never a crash.
 */

import { kitchenCardCandidates, planSeedMerge } from '../domain/card-gen';
import { createCard, dayStamp, dueCards as collectDue, gradeReview, dueReasonGroups } from '../domain/scheduling';
import { foldSkipReflection } from '../domain/skip-profile';
import { RECIPES } from '../data/recipes.js';
import { uid } from './state.js';

const RATINGS = new Set(['again', 'hard', 'good', 'easy']);

/** Apply a seed plan to a deck: stale auto answers patch in place (reason
 * included), stale plan questions leave, and new candidates become fresh
 * cards. Shared by the explicit seed, the per-row apply and the boot
 * auto-refresh so every path writes the deck exactly the same way.
 * `liftForget` is true only for an explicit re-seed — the opt-out is a
 * person's choice, never a background side effect. */
const applySeedPlan = (s, now, plan, liftForget) => {
  if (!plan.additions.length && !plan.updates.length && !(plan.removals || []).length) return {}; // nothing to do — not a failure
  const patches = new Map(plan.updates.map((u) => [u.id, u]));
  const removed = new Set((plan.removals || []).map((r) => r.id));
  return {
    cards: [
      ...(Array.isArray(s.cards) ? s.cards : [])
        .filter((c) => !removed.has(c.id))
        .map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id) } : c)),
      ...plan.additions.map(({ seedKey, ...draft }) => createCard({ ...draft, id: uid('c') }, now)),
    ],
    ...(liftForget ? { kitchenCardsForgotten: false } : {}),
  };
};

/** Candidates minus the fronts the user kept as-is in a refresh preview. A
 * kept front stops being re-offered and never refreshes on its own — the
 * durable version of "that answer is actually still right". Every seed flow
 * (count, preview, seed, boot auto-refresh, per-row apply) shares this one
 * filter, so a kept question stays put until Settings restores the offers. */
const seedCandidates = (s, now) => {
  const kept = new Set(Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : []);
  return kitchenCardCandidates(s, now, recipeNameOf(s)).filter((c) => !kept.has(c.front));
};

/** One seed plan for the current state: fresh candidates merged against the
 * deck, with removals the user kept as-is filtered out — a kept stale plan
 * card stays put, exactly like a kept refresh answer. Every flow reads one
 * plan, so the count, the preview and what a tap applies cannot drift. */
const seedPlan = (s, now) => {
  const deck = Array.isArray(s.cards) ? s.cards : [];
  const plan = planSeedMerge(seedCandidates(s, now), deck);
  const kept = new Set(Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : []);
  return { ...plan, removals: plan.removals.filter((r) => !kept.has(r.front)) };
};

export const reviewActions = (set, latest) => {
  const reviewCard = (id, rating, now = new Date()) =>
    set((s) => {
      const deck = Array.isArray(s.cards) ? s.cards : [];
      const card = deck.find((c) => c.id === id);
      if (!card || !RATINGS.has(rating)) return {}; // a card that left the deck is not a failure
      return {
        cards: deck.map((c) => (c.id === id ? gradeReview(card, rating, now) : c)),
      };
    });

  return {
    /** Add a card to the deck; `now` is the review clock the scheduler runs on. */
    addCard: (draft, now = new Date()) =>
      set((s) => ({
        cards: [...(Array.isArray(s.cards) ? s.cards : []), createCard({ ...draft, id: draft.id || uid('c') }, now)],
      })),
    /** Grade one review and persist the scheduler's returned card state. */
    reviewCard,
    /**
     * Retag a card's topic after creation. Only the topic moves — front,
     * back and SRS schedule are untouched. Blank clears the tag back to the
     * `general` default; a card that left the deck is a no-op, not a failure.
     */
    retagCard: (id, topicId) =>
      set((s) => {
        const deck = Array.isArray(s.cards) ? s.cards : [];
        if (!deck.some((c) => c.id === id)) return {};
        const next = (topicId || '').trim() || 'general';
        return { cards: deck.map((c) => (c.id === id ? { ...c, topicId: next } : c)) };
      }),
    /** The cards due right now, soonest first — the queue a review screen shows. */
    reviewDueCards: (now = new Date()) =>
      collectDue(Array.isArray(latest.current.cards) ? latest.current.cards : [], now),
    /** The due queue grouped by a missed meal's skip reason — for cards elsewhere on the tab that point at one reason's questions. */
    reviewDueReasonGroups: (now = new Date()) =>
      dueReasonGroups(Array.isArray(latest.current.cards) ? latest.current.cards : [], now),
    /**
     * Cards the user's own kitchen activity would seed — count only, no
     * writes, so the UI can offer "build a deck" without committing to it.
     */
    kitchenSeedCount: (now = new Date()) => {
      const plan = seedPlan(latest.current, now);
      // Anything the run would change counts: new questions to add, stale
      // answers to refresh, outlived plan questions to retire — so the offer
      // never understates the work.
      return plan.additions.length + plan.updates.length + plan.removals.length;
    },
    /**
     * What a seed run would change, for a confirm-before-apply preview:
     * stale auto answers as `old → new` pairs and new questions by front.
     * Pure read of the current state — no writes.
     */
    kitchenSeedPreview: (now = new Date()) => {
      const s = latest.current;
      const deck = Array.isArray(s.cards) ? s.cards : [];
      const plan = seedPlan(s, now);
      const byId = new Map(deck.map((c) => [c.id, c]));
      return {
        total: plan.additions.length + plan.updates.length + plan.removals.length,
        additions: plan.additions.map(({ seedKey, ...draft }) => ({ seedKey, front: draft.front, topicId: draft.topicId })),
        updates: plan.updates.map((u) => ({
          front: byId.get(u.id)?.front || '',
          oldBack: byId.get(u.id)?.back || '',
          newBack: u.back,
        })),
        removals: plan.removals.map((r) => ({ front: r.front, back: byId.get(r.id)?.back || '' })),
      };
    },
    /**
     * Seed the deck from what the user actually logged or bought: shop
     * habits, the next pantry expiry, the last thing cooked. Idempotent —
     * a card whose question is already in the deck is never added twice.
     */
    seedCardsFromActivity: (now = new Date()) =>
      set((s) => {
        const changed = applySeedPlan(s, now, seedPlan(s, now), true);
        // An explicit re-seed always lifts the forget opt-out — even when
        // there is nothing to build yet, the person asked for kitchen cards.
        return { ...changed, kitchenCardsForgotten: false };
      }),
    /**
     * Apply a chosen subset of the refresh preview — rows the user said yes
     * to, keyed by question front. Rows not named stay exactly as they are
     * (a kept answer or a still-stale one is untouched), so one pass can
     * refresh the rest while a single row is left alone.
     */
    applySeedRows: (now = new Date(), fronts = []) =>
      set((s) => {
        const plan = seedPlan(s, now);
        const wanted = new Set(fronts);
        const frontById = new Map((Array.isArray(s.cards) ? s.cards : []).map((c) => [c.id, c.front]));
        const additions = plan.additions.filter((a) => wanted.has(a.front));
        const updates = plan.updates.filter((u) => wanted.has(frontById.get(u.id)));
        const removals = plan.removals.filter((r) => wanted.has(r.front));
        if (!additions.length && !updates.length && !removals.length) return {}; // nothing chosen is pending — not a failure
        return applySeedPlan(s, now, { additions, updates, removals }, true);
      }),
    /**
     * Remember that the user deliberately kept these questions as-is. Kept
     * fronts leave the seed offers entirely (count, preview, seed, boot
     * auto-refresh all share the filter), so the refresh never silently
     * overwrites an answer the person said was right.
     */
    keepSeedFronts: (fronts = []) =>
      set((s) => {
        const kept = Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : [];
        const next = [...new Set([...kept, ...fronts])];
        if (next.length === kept.length) return {}; // already kept — nothing new
        return { kitchenKeptFronts: next };
      }),
    /**
     * How many of the kept-as-is fronts today's offers would otherwise still
     * show. The refresh count already excludes kept fronts, so a button that
     * read "Refresh 1" after two skips would look like an offer vanished —
     * this names the reduction as the choice it was. Counts the kept fronts
     * the *unkept* merge would still offer (update, removal or addition), so
     * a kept front whose question the activity no longer asks is not counted.
     */
    kitchenKeptAsIsCount: (now = new Date()) => {
      const s = latest.current;
      const kept = new Set(Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : []);
      if (!kept.size) return 0;
      const deck = Array.isArray(s.cards) ? s.cards : [];
      const plan = planSeedMerge(kitchenCardCandidates(s, now, recipeNameOf(s)), deck);
      // Update rows carry `{ id, back }` only — their front lives on the card.
      const frontById = new Map(deck.map((c) => [c.id, c.front]));
      const offered = new Set([
        ...plan.additions.map((a) => a.front),
        ...plan.updates.map((u) => frontById.get(u.id)),
        ...plan.removals.map((r) => r.front),
      ]);
      let count = 0;
      for (const front of kept) if (offered.has(front)) count += 1;
      return count;
    },
    /**
     * Keep every kitchen answer the deck currently holds — the per-row Skip
     * applied at deck level. Each auto front present in the deck is recorded
     * as kept, so the refresh offers (and the boot auto-refresh) leave the
     * whole deck's current answers alone. Deliberately not the forget opt-out:
     * no card is removed and `kitchenCardsForgotten` stays untouched — the
     * deck is kept, only future rewrites stop.
     */
    keepAllAutoFronts: () =>
      set((s) => {
        const deck = Array.isArray(s.cards) ? s.cards : [];
        const fronts = [...new Set(deck.filter((c) => c.origin === 'auto').map((c) => c.front))];
        if (!fronts.length) return {}; // no kitchen cards to keep — not a failure
        const kept = Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : [];
        const next = [...new Set([...kept, ...fronts])];
        if (next.length === kept.length) return {}; // already all kept — nothing new
        return { kitchenKeptFronts: next };
      }),
    /**
     * Fold one review-time reflection on a skip reason into the learning
     * profile. Asked after a missed-meal card is rated: does the recorded
     * reason still describe why meals get skipped? The answer rides the same
     * write as everything else, so it syncs, backs up and undoes — and a
     * reason the household has never reflected on starts from zero.
     */
    answerSkipReflection: (reasonId, stillApplies, now = new Date()) =>
      set((s) => {
        const reason = (reasonId || '').trim();
        if (!reason) return {}; // no reason id — nothing to learn, not a failure
        const profile = s.skipReasonProfile && typeof s.skipReasonProfile === 'object' && !Array.isArray(s.skipReasonProfile)
          ? s.skipReasonProfile
          : {};
        const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now();
        return { skipReasonProfile: foldSkipReflection(profile, reason, Boolean(stillApplies), at) };
      }),
    /** Clear every kept front, so refresh offers (and the boot auto-refresh) return. */
    clearKeptSeedFronts: () =>
      set((s) => {
        const kept = Array.isArray(s.kitchenKeptFronts) ? s.kitchenKeptFronts : [];
        if (!kept.length) return {}; // nothing to restore — not a failure
        return { kitchenKeptFronts: [] };
      }),
    /**
     * Keep an adopted kitchen deck current without the tap: opening the app
     * with a deck that already holds kitchen cards refreshes its stale auto
     * answers and admits newly supported templates — the same merge the
     * Refresh button runs, on its own. Gated so a boot write never creates a
     * deck from nothing (only decks that adopted kitchen cards), and never
     * resurrects one (the forget opt-out is honoured, not lifted).
     */
    autoRefreshSeededCards: (now = new Date()) =>
      set((s) => {
        // The stamp records the last boot merge, so Learn can say "N kitchen
        // cards refreshed" instead of leaving the write silent — and a boot
        // that changed nothing clears yesterday's stamp rather than keeping a
        // stale note alive. The clear is a no-op when no stamp exists, so the
        // original gating never grows a write where there was none.
        const clearStamp = () => (s.kitchenBootRefresh ? { kitchenBootRefresh: null } : {});
        if (s.kitchenCardsForgotten) return clearStamp();
        const deck = Array.isArray(s.cards) ? s.cards : [];
        if (!deck.some((c) => c.origin === 'auto')) return clearStamp();
        const plan = seedPlan(s, now);
        const count = plan.additions.length + plan.updates.length + (plan.removals || []).length;
        if (!count) return clearStamp();
        return { ...applySeedPlan(s, now, plan, false), kitchenBootRefresh: { count, day: dayStamp(now) } };
      }),
    /**
     * Clear every kitchen-seeded card at once — for users who simply don't
     * want auto cards. Only `origin: 'auto'` cards go; handmade, seed, and
     * imported cards stay untouched. The write goes through the store's
     * normal undo history, so the UI can offer one-tap undo. Also sets the
     * `kitchenCardsForgotten` opt-out so the seed offers stand down until
     * the user explicitly re-seeds.
     */
    forgetKitchenCards: () =>
      set((s) => {
        const deck = Array.isArray(s.cards) ? s.cards : [];
        const kept = deck.filter((c) => c.origin !== 'auto');
        if (kept.length === deck.length) return {}; // nothing to forget — not a failure
        return { cards: kept, kitchenCardsForgotten: true };
      }),
  };
};

/** Recipe id → display name, from the user's book then the catalogue. */
const recipeNameOf = (s) => (id) => {
  const mine = (s.myRecipes || []).find((r) => r.id === id);
  if (mine) return mine.name;
  const cat = RECIPES.find((r) => r.id === id);
  return cat ? cat.name : null;
};