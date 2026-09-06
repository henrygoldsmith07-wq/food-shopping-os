// Turn the app's real flashcard deck into a SubjectGraph the knowledge map can
// render. Honest by construction: the deck has no spec statements, questions,
// mistakes or exam dates, so those levels come back empty and the map says so
// — what it shows is the deck itself (topics, card counts, studied cards) and
// the mastery the schedule has actually earned through reviews.

import { buildSubjectGraph, type GraphInput } from './knowledge-graph';
import { KITCHEN_TOPICS, topicLabel } from './topic-labels';
import type { Card, TopicMastery } from './types';

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
 *   mastery    — retention weighted 70/30 with confidence;
 *   attempts   — total reviews across the topic's cards;
 *   weak       — below the covered line (0.6); a due card drags retention
 *                down, which is exactly the signal a review queue needs.
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
    const mastery = round3(clamp01(retention * 0.7 + confidence * 0.3));
    const lastStudied = studied.map((card) => card.lastReviewedAt).filter(Boolean).sort().at(-1);
    rows.push({
      topicId,
      subjectId: SUBJECT_ID,
      mastery,
      retention,
      confidence,
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
 * The kitchen subject's graph from the deck. Only levels the deck can
 * evidence appear with numbers; the curriculum-only levels stay at zero and
 * the map's copy says what is missing rather than implying it exists.
 */
export function buildDeckGraph(cards: Card[], now: Date = DEFAULT_NOW()): ReturnType<typeof buildSubjectGraph> {
  const topicIds = deckTopicIds(cards);
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
    cards: (Array.isArray(cards) ? cards : []).filter((c) => topicIds.includes(c.topicId)),
    attempts: [],
    mistakes: [],
    mastery: deckMasteryRows(cards, now),
    predictions: [],
    examDates: [],
    targetGrades: {},
  };
  return buildSubjectGraph(input, now);
}
