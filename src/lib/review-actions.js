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
import { createCard, dueCards as collectDue, gradeReview } from '../domain/scheduling';
import { RECIPES } from '../data/recipes.js';
import { uid } from './state.js';

const RATINGS = new Set(['again', 'hard', 'good', 'easy']);

/** Apply a seed plan to a deck: stale auto answers patch in place (reason
 * included), new candidates become fresh cards. Shared by the explicit seed
 * and the boot auto-refresh so both write the deck exactly the same way.
 * `liftForget` is true only for an explicit re-seed — the opt-out is a
 * person's choice, never a background side effect. */
const applySeedPlan = (s, now, plan, liftForget) => {
  if (!plan.additions.length && !plan.updates.length) return {}; // nothing to do — not a failure
  const patches = new Map(plan.updates.map((u) => [u.id, u]));
  return {
    cards: [
      ...(Array.isArray(s.cards) ? s.cards : []).map((c) => (patches.has(c.id) ? { ...c, ...patches.get(c.id) } : c)),
      ...plan.additions.map(({ seedKey, ...draft }) => createCard({ ...draft, id: uid('c') }, now)),
    ],
    ...(liftForget ? { kitchenCardsForgotten: false } : {}),
  };
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
    /**
     * Cards the user's own kitchen activity would seed — count only, no
     * writes, so the UI can offer "build a deck" without committing to it.
     */
    kitchenSeedCount: (now = new Date()) => {
      const s = latest.current;
      const deck = Array.isArray(s.cards) ? s.cards : [];
      const plan = planSeedMerge(kitchenCardCandidates(s, now, recipeNameOf(s)), deck);
      // Anything the run would change counts: new questions to add, stale
      // answers to refresh — so the offer never understates the work.
      return plan.additions.length + plan.updates.length;
    },
    /**
     * What a seed run would change, for a confirm-before-apply preview:
     * stale auto answers as `old → new` pairs and new questions by front.
     * Pure read of the current state — no writes.
     */
    kitchenSeedPreview: (now = new Date()) => {
      const s = latest.current;
      const deck = Array.isArray(s.cards) ? s.cards : [];
      const plan = planSeedMerge(kitchenCardCandidates(s, now, recipeNameOf(s)), deck);
      const byId = new Map(deck.map((c) => [c.id, c]));
      return {
        total: plan.additions.length + plan.updates.length,
        additions: plan.additions.map(({ seedKey, ...draft }) => ({ front: draft.front, topicId: draft.topicId })),
        updates: plan.updates.map((u) => ({
          front: byId.get(u.id)?.front || '',
          oldBack: byId.get(u.id)?.back || '',
          newBack: u.back,
        })),
      };
    },
    /**
     * Seed the deck from what the user actually logged or bought: shop
     * habits, the next pantry expiry, the last thing cooked. Idempotent —
     * a card whose question is already in the deck is never added twice.
     */
    seedCardsFromActivity: (now = new Date()) =>
      set((s) =>
        applySeedPlan(
          s,
          now,
          planSeedMerge(
            kitchenCardCandidates(s, now, recipeNameOf(s)),
            Array.isArray(s.cards) ? s.cards : [],
          ),
          true,
        ),
      ),
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
        if (s.kitchenCardsForgotten) return {};
        const deck = Array.isArray(s.cards) ? s.cards : [];
        if (!deck.some((c) => c.origin === 'auto')) return {};
        return applySeedPlan(
          s,
          now,
          planSeedMerge(kitchenCardCandidates(s, now, recipeNameOf(s)), deck),
          false,
        );
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