// Shared types for the spec-to-exam domain. Pure data contracts: no storage,
// no clock, no React. `Id` strings are stable keys chosen by the importer.

export type Id = string;

export type AoCode = "AO1" | "AO2" | "AO3";

/** One line of the published specification. */
export interface SpecPoint {
  id: Id;
  /** Printed reference, e.g. "Unit 1.1(a)". */
  ref: string;
  /** What the student must be able to do. */
  text: string;
  aos: AoCode[];
  /** "verified" once a human has confirmed the wording against the PDF. */
  verification?: string;
}

export interface Subject {
  id: Id;
  qualificationId: Id;
  name: string;
  specCode?: string;
  gradeBoundaries?: { grade: string; percent: number }[];
  papers?: { id: Id; title: string }[];
  spec?: {
    version: string;
    releaseDate: string;
    lastChecked: string;
  };
}

export interface Unit {
  id: Id;
  subjectId: Id;
  title: string;
  order: number;
}

export interface Topic {
  id: Id;
  subjectId: Id;
  unitId: Id;
  title: string;
  order: number;
  specRef?: string;
  intrinsicDifficulty?: number;
  summary?: string;
  keyPoints?: string[];
  commonErrors?: string[];
  aos?: AoCode[];
  specPoints?: SpecPoint[];
}

export interface QuestionPart {
  id: Id;
  label: string;
  prompt: string;
  marks: number;
  markScheme?: string[];
  modelAnswer?: string;
}

export interface Question {
  id: Id;
  subjectId: Id;
  topicIds: Id[];
  kind: string;
  stem: string;
  parts: QuestionPart[];
  totalMarks: number;
  calculatorAllowed: boolean;
  difficulty?: number;
  origin?: string;
  specPointIds?: Id[];
  createdAt: string;
}

export interface Attempt {
  id: Id;
  userId: Id;
  questionId: Id;
  subjectId: Id;
  topicIds: Id[];
  answers: Record<string, string>;
  marked: { partId: Id; awarded: number; max: number }[];
  awarded: number;
  max: number;
  feedback?: string;
  markedBy?: string;
  elapsedMs?: number;
  mode?: string;
  createdAt: string;
}

export interface Card {
  id: Id;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  front: string;
  back: string;
  origin?: string;
  specPointIds?: Id[];
  /** SRS state, managed by scheduling. */
  reps: number;
  lapses: number;
  ease: number;
  intervalDays: number;
  due: string;
  createdAt: string;
  lastReviewedAt: string | null;
}

/** Everything needed to create a card; scheduling fills in the SRS fields. */
export type CardDraft = Omit<
  Card,
  "reps" | "lapses" | "ease" | "intervalDays" | "due" | "createdAt" | "lastReviewedAt"
>;

export interface Mistake {
  id: Id;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  questionId?: Id;
  description: string;
  category?: string;
  resolved: boolean;
  marksLost?: number;
  createdAt: string;
}

export interface TopicMastery {
  topicId: Id;
  subjectId: Id;
  mastery: number;
  retention: number;
  confidence: number;
  cardsTotal: number;
  cardsDue: number;
  attempts: number;
  accuracy: number;
  lastStudiedAt?: string;
  weak: boolean;
}

export interface GradePrediction {
  subjectId: Id;
  percent: number;
  grade: string;
  bestCase?: string;
  worstCase?: string;
  confidence: number;
  trend?: number;
  headroom?: { grade: string; percent: number }[];
}

export interface ExamDate {
  id: Id;
  userId: Id;
  subjectId: Id;
  date: string;
  label: string;
}
