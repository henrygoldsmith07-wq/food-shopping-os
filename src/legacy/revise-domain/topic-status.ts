// Plain-language status for one topic, from its mastery row alone. The
// knowledge graph turns evidence into per-statement concept statuses; this is
// the coarser "how is this topic going" read that lists and planners show.

import type { TopicMastery } from "./types";

export type TopicStatus = "untouched" | "shaky" | "in-progress" | "covered";

export interface TopicStatusInfo {
  status: TopicStatus;
  label: string;
  tone: "muted" | "warn" | "good";
  /** Why the status says what it says. */
  explanation: string;
}

const INFO: Record<TopicStatus, { label: string; tone: TopicStatusInfo["tone"] }> = {
  untouched: { label: "Not started", tone: "muted" },
  shaky: { label: "Needs work", tone: "warn" },
  "in-progress": { label: "In progress", tone: "muted" },
  covered: { label: "Covered", tone: "good" },
};

/** Classify one topic from its mastery row; no row means no evidence at all. */
export function classifyTopic(mastery?: TopicMastery | null): TopicStatusInfo {
  if (!mastery) {
    return { status: "untouched", label: INFO.untouched.label, tone: INFO.untouched.tone, explanation: "Nothing recorded for this topic yet." };
  }
  if (mastery.mastery >= 0.6) {
    return { status: "covered", label: INFO.covered.label, tone: INFO.covered.tone, explanation: `${Math.round(mastery.mastery * 100)}% mastered across ${mastery.attempts} attempts.` };
  }
  if (mastery.mastery >= 0.35) {
    return { status: "in-progress", label: INFO["in-progress"].label, tone: INFO["in-progress"].tone, explanation: `${Math.round(mastery.mastery * 100)}% mastered — keep the schedule going.` };
  }
  return { status: "shaky", label: INFO.shaky.label, tone: INFO.shaky.tone, explanation: mastery.attempts > 0 ? `${Math.round(mastery.mastery * 100)}% mastered — accuracy is below the line.` : "Mastery is below the line." };
}
