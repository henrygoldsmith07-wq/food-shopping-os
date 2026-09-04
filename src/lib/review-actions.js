/**
 * The flashcard review queue — the SRS engine, wired to the store.
 *
 * The scheduling domain (`createCard`, `gradeReview`, `dueCards`) is pure;
 * these actions are the thin persistence layer around it: add a card, ask
 * what is due, grade one and store the returned state. A review lands in the
 * same write as the rest of the household state, so it syncs, backs up and
 * undoes like everything else — and a miss is a no-op, never a crash.
 */

import { createCard, dueCards as collectDue, gradeReview } from '../domain/scheduling';
import { uid } from './state.js';

const RATINGS = new Set(['again', 'hard', 'good', 'easy']);

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
    /** The cards due right now, soonest first — the queue a review screen shows. */
    reviewDueCards: (now = new Date()) =>
      collectDue(Array.isArray(latest.current.cards) ? latest.current.cards : [], now),
  };
};