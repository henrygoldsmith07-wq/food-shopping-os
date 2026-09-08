// ---------------------------------------------------------------------------
// Knowledge graph — the spec-to-exam chain, derived from real evidence.
//
// One subject's learning is a graph with eight named levels:
//
//   specification → topic → concept → question → mistake → flashcard → mastery → exam
//
// The edges already exist in the data model (topic.specRef, specPointIds on
// questions and cards, mistake→question/card links, per-topic mastery, and
// subject-level grade predictions); what was missing was a single traversal
// that walks them in order and reports, at every level, *measured* state only.
//
// Honesty rules (the same ones the rest of the domain follows):
//   - a concept is "covered" only when evidence exists (an attempt on a linked
//     question, a studied linked card, or a captured mistake). Never a prior,
//     never an estimate.
//   - evidence that cannot be attributed to a spec statement (questions, cards
//     and mistakes without specPointIds) is counted separately as "unmapped"
//     rather than quietly assigned to a concept.
//   - the exam node shows no band until MIN_OUTLOOK_ATTEMPTS marked answers
//     exist for the subject.
//
// Pure domain: no React, no storage, no clock — `now` is passed in so tests
// and renders stay deterministic.
// ---------------------------------------------------------------------------

import { classifyTopic, type TopicStatusInfo } from "./topic-status";
import { MIN_OUTLOOK_ATTEMPTS, outlookRows, type ExamOutlookRow } from "./exam-outlook";
import type {
  AoCode,
  Attempt,
  Card,
  ExamDate,
  GradePrediction,
  Id,
  Mistake,
  Question,
  Subject,
  Topic,
  TopicMastery,
  Unit,
} from "./types";

/** The eight levels of the graph, in learning order. */
export const GRAPH_LEVELS = [
  "specification",
  "topic",
  "concept",
  "question",
  "mistake",
  "flashcard",
  "mastery",
  "exam",
] as const;
export type GraphLevel = (typeof GRAPH_LEVELS)[number];

export type ConceptStatus = "covered" | "shaky" | "untouched";

/** Accuracy below which an attempted concept counts as shaky on its own. */
export const SHAKY_ACCURACY = 0.5;

export interface ConceptNode {
  /** Stable spec-statement id, e.g. "aqa-alevel-biology.cell-structure.sp-1". */
  id: Id;
  /** Printed reference, e.g. "Unit 1.1(a)". */
  ref: string;
  /** Paraphrased learning claim. */
  text: string;
  aos: AoCode[];
  status: ConceptStatus;
  /** Content questions that test this statement (a question may test several). */
  questionCount: number;
  /** Of those, how many have at least one marked attempt. */
  attemptedCount: number;
  /** 0–1 over linked attempts (awarded/max); null until something is attempted. */
  accuracy: number | null;
  /** Cards whose specPointIds include this statement (a card can serve several). */
  cardCount: number;
  /** Linked cards ever reviewed. */
  studiedCardCount: number;
  /** Linked cards that have lapsed at least once. */
  lapsedCardCount: number;
  /** Mistakes captured on this statement's questions. */
  mistakeCount: number;
  unresolvedMistakeCount: number;
  marksLost: number;
}

export interface TopicGraph {
  topicId: Id;
  topicTitle: string;
  specRef?: string;
  unitId: Id;
  unitTitle: string;
  order: number;
  /** Plain-language topic status from the shared classifier. */
  topicStatus: TopicStatusInfo;
  concepts: ConceptNode[];
  questions: {
    /** Content questions whose topicIds include this topic. */
    total: number;
    /** Distinct questions with at least one marked attempt. */
    attempted: number;
    /** 0–1 awarded/max over attempts on this topic's questions; null until attempted. */
    accuracy: number | null;
  };
  mistakes: {
    total: number;
    unresolved: number;
    marksLost: number;
  };
  flashcards: {
    total: number;
    studied: number;
    lapsed: number;
    due: number;
  };
  mastery: {
    mastery: number;
    retention: number;
    confidence: number;
    lapses: number;
    /** 1 with no lapse history; lower as failures accumulate (the drag). */
    lapseDrag: number;
    attempts: number;
    /** Studied cards — the pool retention is measured over. */
    studied: number;
    /** Of those studied, how many are due today. */
    cardsDue: number;
    weak: boolean;
  } | null;
  conceptTotals: {
    total: number;
    evidenced: number;
    covered: number;
    shaky: number;
    untouched: number;
  };
  /** Evidence that exists but cannot be tied to a spec statement yet. */
  unmapped: {
    attempts: number;
    mistakes: number;
    cards: number;
  };
}

export interface ExamNode {
  examDate: { label: string; date: string } | null;
  targetGrade: string | null;
  /** Null until the subject has MIN_OUTLOOK_ATTEMPTS marked answers. */
  outlook: ExamOutlookRow | null;
}

export interface SubjectGraph {
  subjectId: Id;
  subjectName: string;
  specCode?: string;
  specVersion?: string | null;
  units: { id: Id; title: string; topics: TopicGraph[] }[];
  exam: ExamNode;
  totals: {
    concepts: number;
    evidenced: number;
    covered: number;
    shaky: number;
    untouched: number;
    practisedQuestions: number;
    accuracy: number | null;
    unresolvedMistakes: number;
    studiedCards: number;
    dueCards: number;
  };
  unmapped: {
    attempts: number;
    mistakes: number;
    cards: number;
    questions: number;
  };
}

export interface GraphInput {
  subject: Subject;
  units: Unit[];
  topics: Topic[];
  questions: Question[];
  cards: Card[];
  attempts: Attempt[];
  mistakes: Mistake[];
  mastery: TopicMastery[];
  predictions: GradePrediction[];
  examDates: ExamDate[];
  targetGrades: Record<string, string>;
}

/** Weighted 0–1 accuracy over a set of attempts; null when none have marks. */
function accuracyOf(rows: Attempt[]): number | null {
  const scorable = rows.filter((a) => a.max > 0);
  if (!scorable.length) return null;
  const awarded = scorable.reduce((sum, a) => sum + a.awarded, 0);
  const max = scorable.reduce((sum, a) => sum + a.max, 0);
  return max > 0 ? awarded / max : null;
}

export function buildTopicGraph(
  topic: Topic,
  input: Pick<GraphInput, "questions" | "cards" | "attempts" | "mistakes" | "mastery">,
  unitTitle = "",
): TopicGraph {
  const { questions, cards, attempts, mistakes, mastery } = input;

  const topicQuestions = questions.filter((q) => q.topicIds.includes(topic.id));
  const topicQuestionIds = new Set(topicQuestions.map((q) => q.id));
  const topicCards = cards.filter((c) => c.topicId === topic.id);
  const topicAttempts = attempts.filter((a) => topicQuestionIds.has(a.questionId));
  const topicMistakes = mistakes.filter((m) => m.topicId === topic.id);

  const masteryRow = mastery.find((m) => m.topicId === topic.id);

  // Every spec statement of this topic is a concept node; evidence attaches
  // through the specPointIds links on questions and cards.
  const concepts: ConceptNode[] = (topic.specPoints ?? []).map((point) => {
    const linkedQuestions = topicQuestions.filter((q) => q.specPointIds?.includes(point.id));
    const linkedIds = new Set(linkedQuestions.map((q) => q.id));
    const linkedAttempts = topicAttempts.filter((a) => linkedIds.has(a.questionId));
    const linkedMistakes = topicMistakes.filter((m) => m.questionId != null && linkedIds.has(m.questionId));
    const linkedCards = topicCards.filter((c) => c.specPointIds?.includes(point.id));

    const attempted = linkedAttempts.length > 0;
    const studied = linkedCards.some((c) => c.reps > 0);
    const accuracy = accuracyOf(linkedAttempts);
    const unresolved = linkedMistakes.filter((m) => !m.resolved).length;
    const lapsed = linkedCards.some((c) => c.lapses > 0);
    const evidenced = attempted || studied || linkedMistakes.length > 0;
    const shaky =
      evidenced && (unresolved > 0 || lapsed || (attempted && (accuracy ?? 1) < SHAKY_ACCURACY));

    return {
      id: point.id,
      ref: point.ref,
      text: point.text,
      aos: point.aos,
      status: (!evidenced ? "untouched" : shaky ? "shaky" : "covered") as ConceptStatus,
      questionCount: linkedQuestions.length,
      attemptedCount: new Set(linkedAttempts.map((a) => a.questionId)).size,
      accuracy,
      cardCount: linkedCards.length,
      studiedCardCount: linkedCards.filter((c) => c.reps > 0).length,
      lapsedCardCount: linkedCards.filter((c) => c.lapses > 0).length,
      mistakeCount: linkedMistakes.length,
      unresolvedMistakeCount: unresolved,
      marksLost: linkedMistakes.reduce((sum, m) => sum + (Number(m.marksLost) || 0), 0),
    };
  });

  // Evidence the model cannot attribute to a spec statement because the link
  // field (specPointIds) is absent, or the mistake names no question. Reported
  // explicitly, never hidden and never silently assigned to a concept.
  const unmappedQuestionIds = new Set(
    topicQuestions.filter((q) => !q.specPointIds?.length).map((q) => q.id),
  );
  const unmappedMistakes = topicMistakes.filter(
    (m) => (m.questionId != null && unmappedQuestionIds.has(m.questionId)) || m.questionId == null,
  );
  const topicAccuracy = accuracyOf(topicAttempts);

  const statuses = concepts.map((c) => c.status);
  const countStatus = (s: ConceptStatus) => statuses.filter((x) => x === s).length;

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    specRef: topic.specRef,
    unitId: topic.unitId,
    unitTitle,
    order: topic.order,
    topicStatus: classifyTopic(masteryRow),
    concepts,
    questions: {
      total: topicQuestions.length,
      attempted: new Set(topicAttempts.map((a) => a.questionId)).size,
      accuracy: topicAccuracy,
    },
    mistakes: {
      total: topicMistakes.length,
      unresolved: topicMistakes.filter((m) => !m.resolved).length,
      marksLost: topicMistakes.reduce((sum, m) => sum + (Number(m.marksLost) || 0), 0),
    },
    flashcards: {
      total: topicCards.length,
      studied: topicCards.filter((c) => c.reps > 0).length,
      lapsed: topicCards.filter((c) => c.lapses > 0).length,
      due: masteryRow?.cardsDue ?? 0,
    },
    mastery: masteryRow
      ? {
          mastery: masteryRow.mastery,
          retention: masteryRow.retention,
          confidence: masteryRow.confidence,
          lapses: masteryRow.lapses,
          lapseDrag: masteryRow.lapseDrag,
          attempts: masteryRow.attempts,
          studied: masteryRow.studied,
          cardsDue: masteryRow.cardsDue,
          weak: masteryRow.weak,
        }
      : null,
    conceptTotals: {
      total: concepts.length,
      evidenced: countStatus("covered") + countStatus("shaky"),
      covered: countStatus("covered"),
      shaky: countStatus("shaky"),
      untouched: countStatus("untouched"),
    },
    unmapped: {
      attempts: new Set(
        topicAttempts.filter((a) => unmappedQuestionIds.has(a.questionId)).map((a) => a.questionId),
      ).size,
      mistakes: unmappedMistakes.length,
      cards: topicCards.filter((c) => !c.specPointIds?.length).length,
    },
  };
}

/**
 * Full graph for one subject: specification node on top, every topic's chain,
 * and the exam-performance node at the bottom.
 */
export function buildSubjectGraph(input: GraphInput, now: Date = new Date()): SubjectGraph {
  const { subject, units, topics, attempts, mistakes, mastery, predictions, examDates, targetGrades } = input;

  const byUnit = units
    .map((unit) => {
      const unitTopics = topics
        .filter((t) => t.unitId === unit.id)
        .sort((a, b) => a.order - b.order)
        .map((topic) => buildTopicGraph(topic, input, unit.title));
      return { id: unit.id, title: unit.title, topics: unitTopics };
    })
    .filter((u) => u.topics.length > 0);

  const today = now.toISOString().slice(0, 10);
  const upcoming = examDates
    .filter((e) => e.subjectId === subject.id && e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];

  const outlookRow = outlookRows(predictions, attempts).find((row) => row.subjectId === subject.id);

  const topicGraphs = byUnit.flatMap((u) => u.topics);
  const allSubjectAttempts = attempts.filter((a) => a.subjectId === subject.id);
  const subjectMistakes = mistakes.filter((m) => m.subjectId === subject.id);
  const subjectCards = input.cards.filter((c) => c.subjectId === subject.id);
  const subjectTopicIds = new Set(topics.map((t) => t.id));

  const concepts = topicGraphs.flatMap((t) => t.concepts);
  const statuses = concepts.map((c) => c.status);
  const countStatus = (s: ConceptStatus) => statuses.filter((x) => x === s).length;

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    specCode: subject.specCode,
    specVersion: subject.spec?.version,
    units: byUnit,
    exam: {
      examDate: upcoming ? { label: upcoming.label, date: upcoming.date } : null,
      targetGrade: targetGrades[subject.id] ?? null,
      outlook: outlookRow && outlookRow.attempts >= MIN_OUTLOOK_ATTEMPTS ? outlookRow : null,
    },
    totals: {
      concepts: concepts.length,
      evidenced: countStatus("covered") + countStatus("shaky"),
      covered: countStatus("covered"),
      shaky: countStatus("shaky"),
      untouched: countStatus("untouched"),
      practisedQuestions: new Set(allSubjectAttempts.map((a) => a.questionId)).size,
      accuracy: accuracyOf(allSubjectAttempts),
      unresolvedMistakes: subjectMistakes.filter((m) => !m.resolved).length,
      studiedCards: subjectCards.filter((c) => c.reps > 0).length,
      dueCards: mastery
        .filter((m) => m.cardsDue > 0 && subjectTopicIds.has(m.topicId))
        .reduce((sum, m) => sum + m.cardsDue, 0),
    },
    unmapped: {
      attempts: topicGraphs.reduce((sum, t) => sum + t.unmapped.attempts, 0),
      mistakes: topicGraphs.reduce((sum, t) => sum + t.unmapped.mistakes, 0),
      cards: topicGraphs.reduce((sum, t) => sum + t.unmapped.cards, 0),
      questions: input.questions.filter(
        (q) => q.subjectId === subject.id && !q.specPointIds?.length,
      ).length,
    },
  };
}
