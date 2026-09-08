// Turn the app's real flashcard deck into a SubjectGraph the knowledge map can
// render. Honest by construction: the deck has no spec statements, questions,
// or exam dates, so those levels come back empty and the map says so — what
// it shows is the deck itself (topics, card counts, studied cards), the
// mistakes the review schedule has actually earned, and the mastery that
// schedule has built through reviews.

import { buildSubjectGraph, type GraphInput } from './knowledge-graph';
import { KITCHEN_TOPICS, topicLabel } from './topic-labels';
import type { Card, Mistake, TopicMastery } from './types';

const SUBJECT_ID = 'kitchen';
const KITCHEN_ORDER = Object.keys(KITCHEN_TOPICS);
const DEFAULT_NOW = () => new Date();
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Topic ids present in the deck, kitchen catalogue order first. */
export function deckTopicIds(cards: Card[]): string[] {
  const ids = [...new Set((Array.isArray(cards) ? cards : []).map((c) => c.topicId).filter(Boolean))];
  return ids.sort((a, b) => {
    const ai = KITCHEN_ORDER.indexOf(a);
    const bi = KITCHEN_ORDER.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return topicLabel(a).localeCompare(topicLabel(b));
  });
}

/**
 * Per-topic mastery, derived from the deck's scheduling state alone.
 *
 * The deck records no question accuracy, so these numbers never claim to be
 * one. They are what an SM-2 schedule can honestly say about a topic today:
 *
 *   retention  — the share of studied cards not due right now (still
 *                believed held);
 *   confidence — how far above the 1.3 ease floor the reviewed cards' mean
 *                ease sits, normalised against the 2.5 ceiling;
 *   mastery    — (retention weighted 70/30 with confidence), dragged down
 *                by lapse history. A card that keeps failing reads weaker
 *                than one that merely came due: each card's drag is
 *                1 − lapses/(lapses + 2), so a single lapse on a long-mature
 *                card costs little while a card failing most of its reviews
 *                pulls a topic hard toward the shaky band;
 *   lapses     — total misses across the studied cards;
 *   lapseDrag  — the mean per-card drag above, 1 when nothing has lapsed;
 *   weak       — below the covered line (0.6).
 *
 * A topic returns no row until its first review: mastery cannot be read
 * from a schedule that has never graded a card, so untouched topics keep
 * their honest "Not started" read instead of a fabricated band.
 */
export function deckMasteryRows(cards: Card[], now: Date = DEFAULT_NOW()): TopicMastery[] {
  const today = now.toISOString().slice(0, 10);
  const byTopic = new Map<string, Card[]>();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card.topicId) continue;
    const list = byTopic.get(card.topicId) || [];
    list.push(card);
    byTopic.set(card.topicId, list);
  }
  const rows: TopicMastery[] = [];
  for (const [topicId, topicCards] of byTopic) {
    const studied = topicCards.filter((card) => card.reps > 0);
    if (!studied.length) continue;
    const due = studied.filter((card) => card.due && card.due <= today);
    const retention = round3(due.length ? 1 - due.length / studied.length : 1);
    const easeMean = studied.reduce((sum, card) => sum + (Number(card.ease) || 0), 0) / studied.length;
    const confidence = round3(clamp01((easeMean - 1.3) / 1.2));
    // Failure history drags a topic below what retention alone would claim:
    // each card's drag starts at 1 and falls as its lapses grow relative to
    // its reviews, so a topic is only ever dragged by cards that lapsed.
    const lapseCounts = studied.map((card) => Math.max(0, Number(card.lapses) || 0));
    const lapses = lapseCounts.reduce((sum, count) => sum + count, 0);
    const lapseDrag = round3(lapseCounts.length
      ? lapseCounts.reduce((sum, count) => sum + 1 - count / (count + 2), 0) / lapseCounts.length
      : 1);
    const mastery = round3(clamp01((retention * 0.7 + confidence * 0.3) * lapseDrag));
    const lastStudied = studied.map((card) => card.lastReviewedAt).filter(Boolean).sort().at(-1);
    rows.push({
      topicId,
      subjectId: SUBJECT_ID,
      mastery,
      retention,
      confidence,
      lapses,
      lapseDrag,
      studied: studied.length,
      cardsTotal: topicCards.length,
      cardsDue: due.length,
      attempts: studied.reduce((sum, card) => sum + (Number(card.reps) || 0), 0),
      accuracy: 0, // the deck never grades questions; accuracy is not invented
      ...(lastStudied ? { lastStudiedAt: lastStudied } : {}),
      weak: mastery < 0.6,
    });
  }
  return rows;
}

/**
 * The deck's mistakes, read from the review schedule's own evidence.
 *
 * A card whose most recent review was "again" is an open, unrelearned miss
 * (the scheduler sent it back to the queue for recovery); a card that lapsed
 * but whose last review succeeded is resolved — the recovery happened, and
 * the map says so rather than dropping the history. A card stamped only by
 * the pre-stamp scheduler (lapsed, no lastRating) stays silent: there is no
 * review outcome to read, and the map does not invent one. Nothing here
 * invents marks lost: card reviews carry no exam marks.
 */
export function deckMistakeRows(cards: Card[]): Mistake[] {
  const rows: Mistake[] = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const lastWasAgain = card.lastRating === 'again';
    const lapsed = (Number(card.lapses) || 0) > 0;
    const recovered = lapsed && card.lastRating != null && card.lastRating !== 'again';
    if (!lastWasAgain && !recovered) continue;
    rows.push({
      id: `card-lapse:${card.id}`,
      userId: card.userId,
      subjectId: card.subjectId,
      topicId: card.topicId,
      description: lastWasAgain
        ? `Last review of “${card.front}” was rated Again — still open`
        : `“${card.front}” lapsed but has since been reviewed successfully`,
      category: 'card-lapse',
      resolved: !lastWasAgain,
      createdAt: card.lastReviewedAt ?? card.createdAt,
    });
  }
  return rows;
}

/**
 * The kitchen subject's graph from the deck. Only levels the deck can
 * evidence appear with numbers; the curriculum-only levels stay at zero and
 * the map's copy says what is missing rather than implying it exists.
 */
export function buildDeckGraph(cards: Card[], now: Date = DEFAULT_NOW()): ReturnType<typeof buildSubjectGraph> {
  const deck = Array.isArray(cards) ? cards : [];
  const topicIds = deckTopicIds(deck);
  const topics = topicIds.map((id, i) => ({
    id,
    subjectId: SUBJECT_ID,
    unitId: 'kitchen',
    title: topicLabel(id),
    order: i + 1,
  }));
  const input: GraphInput = {
    subject: { id: SUBJECT_ID, qualificationId: 'local', name: 'Your kitchen' },
    units: [{ id: 'kitchen', subjectId: SUBJECT_ID, title: 'Topics', order: 1 }],
    topics,
    questions: [],
    cards: deck.filter((c) => topicIds.includes(c.topicId)),
    attempts: [],
    mistakes: deckMistakeRows(deck),
    mastery: deckMasteryRows(deck, now),
    predictions: [],
    examDates: [],
    targetGrades: {},
  };
  return buildSubjectGraph(input, now);
}
