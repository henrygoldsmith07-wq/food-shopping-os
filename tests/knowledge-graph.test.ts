import { describe, expect, it } from "vitest";
import { createCard } from "../src/domain/scheduling";
import {
  buildSubjectGraph,
  buildTopicGraph,
  GRAPH_LEVELS,
  SHAKY_ACCURACY,
  type GraphInput,
  type SubjectGraph,
} from "../src/domain/knowledge-graph";
import type {
  Attempt,
  Card,
  ExamDate,
  GradePrediction,
  Mistake,
  Question,
  Subject,
  Topic,
  TopicMastery,
  Unit,
} from "../src/domain/types";

// ---------------------------------------------------------------------------
// Fixtures: one subject, one unit, one topic with two spec statements. sp-1 is
// linked to a question (specPointIds) and a card; sp-2 has no evidence at all.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-01T10:00:00Z");

const subject: Subject = {
  id: "bio",
  qualificationId: "q-alevel",
  name: "Biology",
  specCode: "7402",
  gradeBoundaries: [
    { grade: "A", percent: 70 },
    { grade: "B", percent: 60 },
  ],
  papers: [],
  spec: { version: "2024-1.0", releaseDate: "2024-01-01", lastChecked: "2026-01-01" },
};

const unit: Unit = { id: "u1", subjectId: "bio", title: "Biological molecules", order: 1 };

const topic: Topic = {
  id: "t1",
  subjectId: "bio",
  unitId: "u1",
  title: "Cell structure",
  order: 1,
  specRef: "Unit 1.1",
  intrinsicDifficulty: 3,
  summary: "Cells and organelles.",
  keyPoints: ["Membrane structure"],
  commonErrors: ["Confusing mitochondria and chloroplasts"],
  aos: ["AO1", "AO2"],
  specPoints: [
    {
      id: "bio.t1.sp-1",
      ref: "1.1(a)",
      text: "Describe the structure of a eukaryotic cell membrane.",
      aos: ["AO1"],
      verification: "verified",
    },
    {
      id: "bio.t1.sp-2",
      ref: "1.1(b)",
      text: "Explain how surface-area-to-volume ratio limits cell size.",
      aos: ["AO2"],
    },
  ],
};

function question(spPointIds?: string[]): Question {
  return {
    id: "q1",
    subjectId: "bio",
    topicIds: ["t1"],
    kind: "structured",
    stem: "Describe the cell membrane.",
    parts: [
      {
        id: "p1",
        label: "(a)",
        prompt: "Describe.",
        marks: 6,
        markScheme: ["phospholipid bilayer"],
        modelAnswer: "A phospholipid bilayer.",
      },
    ],
    totalMarks: 6,
    calculatorAllowed: false,
    difficulty: 3,
    origin: "seed",
    specPointIds: spPointIds,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function attempt(awarded: number, max = 6): Attempt {
  return {
    id: `a-${awarded}`,
    userId: "local",
    questionId: "q1",
    subjectId: "bio",
    topicIds: ["t1"],
    answers: { p1: "…" },
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: "2026-04-01T00:00:00Z",
  };
}

function card(overrides: Partial<Card> = {}): Card {
  // Overrides land on the finished card so SRS fields (reps) and link removal
  // (specPointIds: undefined) can be faked after creation.
  return {
    ...createCard(
      {
        id: "c1",
        userId: "local",
        subjectId: "bio",
        topicId: "t1",
        front: "Membrane structure?",
        back: "Phospholipid bilayer.",
        origin: "seed",
        specPointIds: ["bio.t1.sp-1"],
      },
      NOW,
    ),
    ...overrides,
  };
}

function mistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: "m1",
    userId: "local",
    subjectId: "bio",
    topicId: "t1",
    questionId: "q1",
    description: "Did not mention the bilayer.",
    category: "recall",
    resolved: false,
    marksLost: 2,
    createdAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function masteryRow(overrides: Partial<TopicMastery> = {}): TopicMastery {
  return {
    topicId: "t1",
    subjectId: "bio",
    mastery: 0.72,
    retention: 0.81,
    confidence: 0.4,
    cardsTotal: 10,
    cardsDue: 2,
    attempts: 12,
    accuracy: 0.68,
    lastStudiedAt: "2026-04-30T10:00:00Z",
    weak: false,
    ...overrides,
  };
}

function prediction(overrides: Partial<GradePrediction> = {}): GradePrediction {
  return {
    subjectId: "bio",
    percent: 70,
    grade: "A",
    bestCase: "A*",
    worstCase: "C",
    confidence: 0.4,
    trend: 0,
    headroom: [],
    ...overrides,
  };
}

function examDate(date: string, label = "Biology paper"): ExamDate {
  return { id: `exam-${date}`, userId: "local", subjectId: "bio", date, label };
}

function input(overrides: Partial<GraphInput> = {}): GraphInput {
  return {
    subject,
    units: [unit],
    topics: [topic],
    questions: [question(["bio.t1.sp-1"])],
    cards: [],
    attempts: [],
    mistakes: [],
    mastery: [],
    predictions: [],
    examDates: [],
    targetGrades: {},
    ...overrides,
  };
}

function build(overrides: Partial<GraphInput> = {}, now = NOW): SubjectGraph {
  return buildSubjectGraph(input(overrides), now);
}

describe("the eight graph levels", () => {
  it("are ordered exactly as the product chain: spec → topic → concept → question → mistake → flashcard → mastery → exam", () => {
    expect(GRAPH_LEVELS).toEqual([
      "specification",
      "topic",
      "concept",
      "question",
      "mistake",
      "flashcard",
      "mastery",
      "exam",
    ]);
  });
});

describe("concept status from real evidence", () => {
  it("marks a concept covered when a linked question is attempted accurately", () => {
    const graph = build({
      attempts: [attempt(4), attempt(4), attempt(4)],
      cards: [card()],
      mastery: [masteryRow()],
    });
    const chain = graph.units[0]!.topics[0]!;
    const sp1 = chain.concepts.find((c) => c.id === "bio.t1.sp-1")!;
    const sp2 = chain.concepts.find((c) => c.id === "bio.t1.sp-2")!;

    expect(sp1.status).toBe("covered");
    expect(sp1.attemptedCount).toBe(1);
    expect(sp1.accuracy).toBeCloseTo(4 / 6, 5);
    expect(sp1.cardCount).toBe(1);
    // The card exists but has never been reviewed, so it is not studied yet.
    expect(sp1.studiedCardCount).toBe(0);
    expect(chain.conceptTotals).toEqual({
      total: 2,
      evidenced: 1,
      covered: 1,
      shaky: 0,
      untouched: 1,
    });
    expect(sp2.status).toBe("untouched");
    expect(sp2.questionCount).toBe(0);
  });

  it("calls a concept shaky when accuracy sits below the threshold", () => {
    const graph = build({ attempts: [attempt(2)] });
    const sp1 = graph.units[0]!.topics[0]!.concepts.find((c) => c.id === "bio.t1.sp-1")!;
    expect(sp1.accuracy).toBeCloseTo(2 / 6, 5);
    expect(SHAKY_ACCURACY).toBeLessThanOrEqual(0.5);
    expect(sp1.status).toBe("shaky");
  });

  it("calls a concept shaky when a linked mistake is unresolved", () => {
    const graph = build({ attempts: [attempt(4)], mistakes: [mistake()] });
    const sp1 = graph.units[0]!.topics[0]!.concepts.find((c) => c.id === "bio.t1.sp-1")!;
    expect(sp1.status).toBe("shaky");
    expect(sp1.mistakeCount).toBe(1);
    expect(sp1.unresolvedMistakeCount).toBe(1);
    expect(sp1.marksLost).toBe(2);
  });

  it("counts a studied card alone as coverage, with accuracy left null", () => {
    const graph = build({ cards: [card({ reps: 3, lapses: 0 })] });
    const sp1 = graph.units[0]!.topics[0]!.concepts.find((c) => c.id === "bio.t1.sp-1")!;
    expect(sp1.status).toBe("covered");
    expect(sp1.attemptedCount).toBe(0);
    expect(sp1.accuracy).toBeNull();
    expect(sp1.studiedCardCount).toBe(1);
  });

  it("keeps a resolved mistake covered instead of shaking it", () => {
    const graph = build({
      attempts: [attempt(4)],
      mistakes: [mistake({ resolved: true })],
      cards: [card()],
    });
    const sp1 = graph.units[0]!.topics[0]!.concepts.find((c) => c.id === "bio.t1.sp-1")!;
    expect(sp1.mistakeCount).toBe(1);
    expect(sp1.unresolvedMistakeCount).toBe(0);
    expect(sp1.status).toBe("covered");
  });
});

describe("unmapped evidence is reported, never guessed onto a concept", () => {
  it("counts attempts, mistakes and cards without spec links separately", () => {
    const graph = build({
      questions: [question(undefined)],
      attempts: [attempt(4)],
      mistakes: [mistake({ questionId: undefined })],
      cards: [card({ specPointIds: undefined })],
    });
    const topicGraph = graph.units[0]!.topics[0]!;
    expect(topicGraph.concepts[0]!.status).toBe("untouched");
    expect(topicGraph.concepts[0]!.questionCount).toBe(0);
    // The evidence still shows up at the topic level…
    expect(topicGraph.questions.total).toBe(1);
    expect(topicGraph.questions.attempted).toBe(1);
    expect(topicGraph.flashcards.total).toBe(1);
    // The unmapped card exists but has no reviews — studied means reviewed.
    expect(topicGraph.flashcards.studied).toBe(0);
    expect(topicGraph.mistakes.total).toBe(1);
    // …and is honestly flagged as unmapped rather than assigned to a concept.
    expect(topicGraph.unmapped).toEqual({ attempts: 1, mistakes: 1, cards: 1 });
    expect(graph.unmapped.attempts).toBe(1);
    expect(graph.unmapped.mistakes).toBe(1);
    expect(graph.unmapped.cards).toBe(1);
    expect(graph.unmapped.questions).toBe(1);
  });
});

describe("mastery and flashcard nodes", () => {
  it("carry the topic's schedule numbers through", () => {
    const graph = build({ mastery: [masteryRow()] });
    const topicGraph = graph.units[0]!.topics[0]!;
    expect(topicGraph.mastery).toMatchObject({
      mastery: 0.72,
      retention: 0.81,
      attempts: 12,
      cardsDue: 2,
      weak: false,
    });
    expect(topicGraph.flashcards.due).toBe(2);
    expect(topicGraph.topicStatus.status).toBe("covered");
  });
});

describe("exam-performance node", () => {
  it("shows no band until the subject has enough marked answers", () => {
    const graph = build({ predictions: [prediction()], attempts: [attempt(4)] });
    expect(graph.exam.outlook).toBeNull();
  });

  it("shows the honest band once the threshold is met", () => {
    const graph = build({
      predictions: [prediction()],
      attempts: [attempt(4), attempt(5), attempt(3)],
      examDates: [examDate("2026-06-08", "Biology paper 1")],
      targetGrades: { bio: "A" },
    });
    expect(graph.exam.outlook).not.toBeNull();
    // confidence 0.4 → half-width 30 → 70 ± 30, clamped to [0, 100].
    expect(graph.exam.outlook!.low).toBe(40);
    expect(graph.exam.outlook!.high).toBe(100);
    expect(graph.exam.outlook!.attempts).toBe(3);
    expect(graph.exam.examDate).toEqual({ label: "Biology paper 1", date: "2026-06-08" });
    expect(graph.exam.targetGrade).toBe("A");
  });

  it("ignores past exam dates when picking the upcoming one", () => {
    const graph = build({
      predictions: [prediction()],
      attempts: [attempt(4), attempt(5), attempt(3)],
      examDates: [examDate("2026-01-10", "Past paper"), examDate("2026-06-08", "Real exam")],
    });
    expect(graph.exam.examDate).toEqual({ label: "Real exam", date: "2026-06-08" });
  });
});

describe("subject totals", () => {
  it("roll the concept statuses and evidence up across the subject", () => {
    const graph = build({
      questions: [question(["bio.t1.sp-1"])],
      attempts: [attempt(4), attempt(5), attempt(3)],
      mistakes: [mistake()],
      cards: [card({ reps: 2 }), card({ id: "c2", specPointIds: ["bio.t1.sp-2"] })],
      mastery: [masteryRow()],
    });
    expect(graph.totals).toMatchObject({
      concepts: 2,
      evidenced: 1,
      // sp-1 is evidenced but shaky: the open mistake outweighs good attempts.
      covered: 0,
      shaky: 1,
      untouched: 1,
      practisedQuestions: 1,
      unresolvedMistakes: 1,
      studiedCards: 1,
      dueCards: 2,
    });
    expect(graph.totals.accuracy).toBeCloseTo(12 / 18, 5);
    expect(graph.unmapped).toEqual({ attempts: 0, mistakes: 0, cards: 0, questions: 0 });
  });
});

describe("specification node", () => {
  it("carries the subject code and the spec version", () => {
    const graph = build();
    expect(graph.subjectName).toBe("Biology");
    expect(graph.specCode).toBe("7402");
    expect(graph.specVersion).toBe("2024-1.0");
    expect(graph.units[0]!.title).toBe("Biological molecules");
    expect(graph.units[0]!.topics[0]!.specRef).toBe("Unit 1.1");
  });
});

describe("buildTopicGraph directly", () => {
  it("exposes the topic chain in one call for tests and tooling", () => {
    const g = buildTopicGraph(
      topic,
      {
        questions: [question(["bio.t1.sp-1"])],
        cards: [card()],
        attempts: [attempt(4)],
        mistakes: [],
        mastery: [masteryRow()],
      },
      unit.title,
    );
    expect(g.unitTitle).toBe("Biological molecules");
    expect(g.topicStatus.status).toBe("covered");
    expect(g.concepts).toHaveLength(2);
    expect(g.questions).toEqual({ total: 1, attempted: 1, accuracy: 4 / 6 });
  });
});
