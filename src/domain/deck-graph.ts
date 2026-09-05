// Turn the app's real flashcard deck into a SubjectGraph the knowledge map can
// render. Honest by construction: the deck has no spec statements, questions,
// mistakes or exam dates, so those levels come back empty and the map says so
// — what it shows is the deck itself (topics, card counts, studied cards).

import { buildSubjectGraph, type GraphInput } from './knowledge-graph';
import { KITCHEN_TOPICS, topicLabel } from './topic-labels';
import type { Card } from './types';

const SUBJECT_ID = 'kitchen';
const KITCHEN_ORDER = Object.keys(KITCHEN_TOPICS);
const DEFAULT_NOW = () => new Date();

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
    mastery: [],
    predictions: [],
    examDates: [],
    targetGrades: {},
  };
  return buildSubjectGraph(input, now);
}
