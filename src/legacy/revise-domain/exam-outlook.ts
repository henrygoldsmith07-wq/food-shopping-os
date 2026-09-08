// Exam-performance outlook. One subject's grade predictions and marked
// answers become an honest band: wider when confidence is low, never shown at
// all until enough marked answers exist to mean something.

import type { Attempt, GradePrediction, Id } from "./types";

/** Marked answers a subject needs before any band is shown. */
export const MIN_OUTLOOK_ATTEMPTS = 3;

export interface ExamOutlookRow {
  subjectId: Id;
  grade: string | null;
  percent: number;
  /** Confidence 0–1: 0 → the full 0–100 band, 1 → a point estimate. */
  confidence: number;
  low: number;
  high: number;
  attempts: number;
}

/** One row per subject that has a prediction; attempts counted from answers. */
export function outlookRows(
  predictions: GradePrediction[],
  attempts: Attempt[],
): ExamOutlookRow[] {
  return predictions.map((prediction) => {
    const halfWidth = Math.round((1 - prediction.confidence) * 50);
    const percent = prediction.percent;
    const attemptsForSubject = attempts.filter((a) => a.subjectId === prediction.subjectId).length;
    return {
      subjectId: prediction.subjectId,
      grade: prediction.grade ?? null,
      percent,
      confidence: prediction.confidence,
      low: Math.max(0, percent - halfWidth),
      high: Math.min(100, percent + halfWidth),
      attempts: attemptsForSubject,
    };
  });
}
