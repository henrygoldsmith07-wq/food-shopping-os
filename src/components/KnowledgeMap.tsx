"use client";

import { useState } from "react";
import { GRAPH_LEVELS, type ConceptNode, type SubjectGraph, type TopicGraph } from "@/domain/knowledge-graph";
import { TopicStatusTag } from "./TopicStatusTag";
import { Panel, Pill } from "./ui";

// ---------------------------------------------------------------------------
// Knowledge map: the spec-to-exam chain rendered as a connected, walkable
// graph. Every number is measured evidence from the SubjectGraph — statuses
// are words with icons, never colour alone, and the ordering of the eight
// levels is visible as labelled steps, not just arrows.
// ---------------------------------------------------------------------------

function pct(n: number | null | undefined): string | null {
  return n == null ? null : `${Math.round(n * 100)}%`;
}

const CONCEPT_EXPLANATION: Record<ConceptNode["status"], string> = {
  covered: "Evidence holds — linked questions and cards stay accurate.",
  shaky: "Evidence exists but is not holding — open mistakes, low accuracy, or lapsed cards.",
  untouched: "No attempts on linked questions and no studied cards yet — this statement is unstarted.",
};

function ConceptRow({ concept }: { concept: ConceptNode }) {
  const accuracy = pct(concept.accuracy);
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-1.5">
      <span className="font-mono text-[11px] text-ink3 shrink-0 w-16 truncate" title={concept.ref}>
        {concept.ref}
      </span>
      <span className="text-xs text-ink2 flex-1 min-w-0">{concept.text}</span>
      <TopicStatusTag status={concept.status} explanation={CONCEPT_EXPLANATION[concept.status]} />
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
        {concept.questionCount > 0 ? (
          concept.attemptedCount > 0 ? (
            <Pill tone="success" title={`${concept.attemptedCount} of ${concept.questionCount} linked questions attempted`}>
              Q {concept.attemptedCount}/{concept.questionCount}
              {accuracy ? ` · ${accuracy}` : ""}
            </Pill>
          ) : (
            <Pill title={`${concept.questionCount} linked questions, none attempted yet`}>Q 0/{concept.questionCount}</Pill>
          )
        ) : (
          <Pill title="No content question tests this statement yet">no questions</Pill>
        )}
        {concept.cardCount > 0 ? (
          concept.studiedCardCount > 0 ? (
            <Pill title={`${concept.studiedCardCount} of ${concept.cardCount} linked cards reviewed`}>
              cards {concept.studiedCardCount}/{concept.cardCount}
            </Pill>
          ) : (
            <Pill title={`${concept.cardCount} linked cards, none reviewed yet`}>cards 0/{concept.cardCount}</Pill>
          )
        ) : null}
        {concept.unresolvedMistakeCount > 0 ? (
          <Pill tone="danger" title={`${concept.marksLost} marks lost here, not yet resolved`}>
            {concept.unresolvedMistakeCount} open mistake{concept.unresolvedMistakeCount === 1 ? "" : "s"}
          </Pill>
        ) : concept.mistakeCount > 0 ? (
          <Pill tone="success" title="Mistakes here are all resolved">mistakes resolved</Pill>
        ) : null}
      </span>
    </li>
  );
}

interface ChainNode {
  level: (typeof GRAPH_LEVELS)[number];
  value: string;
  hint: string;
  tone?: "neutral" | "success" | "review" | "danger";
}

/** One topic's chain: spec → topic → concept → question → mistake → flashcard → mastery → exam. */
function topicChain(topic: TopicGraph, graph: SubjectGraph): ChainNode[] {
  const { conceptTotals, questions, mistakes, flashcards, mastery } = topic;
  const accuracy = pct(questions.accuracy);
  const masteryPct = mastery ? pct(mastery.mastery) : null;
  const retentionPct = mastery ? pct(mastery.retention) : null;
  const outlook = graph.exam.outlook;
  const examValue = outlook ? `${outlook.low}–${outlook.high}%` : "no band yet";

  return [
    {
      level: "specification",
      value: topic.specRef ? `${topic.specRef}` : graph.specCode ? `${graph.specCode} spec` : "Specification",
      hint: topic.specRef ? "Spec reference this topic tracks" : "Subject specification",
    },
    {
      level: "topic",
      value: topic.topicTitle,
      hint: topic.topicStatus.explanation,
      tone: topic.topicStatus.status === "covered" ? "success" : topic.topicStatus.status === "shaky" ? "review" : undefined,
    },
    {
      level: "concept",
      value: `${conceptTotals.evidenced}/${conceptTotals.total} evidenced`,
      hint:
        conceptTotals.total === 0
          ? "No spec statements mapped for this topic yet"
          : `${conceptTotals.covered} covered · ${conceptTotals.shaky} shaky · ${conceptTotals.untouched} untouched`,
      tone: conceptTotals.total > 0 && conceptTotals.evidenced === conceptTotals.total ? "success" : undefined,
    },
    {
      level: "question",
      value: questions.attempted
        ? `${questions.attempted} practised${accuracy ? ` · ${accuracy}` : ""}`
        : "not practised",
      hint: questions.attempted
        ? `${accuracy ?? "—"} average across ${questions.total} content questions`
        : `${questions.total} content questions, none attempted yet`,
      tone: questions.attempted && (questions.accuracy ?? 1) < 0.5 ? "review" : undefined,
    },
    {
      level: "mistake",
      value: mistakes.unresolved ? `${mistakes.unresolved} open` : mistakes.total ? "resolved" : "none",
      hint:
        mistakes.total === 0
          ? "No marks lost recorded here"
          : `${mistakes.total} mistake${mistakes.total === 1 ? "" : "s"} · ${mistakes.marksLost} marks lost`,
      tone: mistakes.unresolved ? "danger" : mistakes.total ? "success" : undefined,
    },
    {
      level: "flashcard",
      value: flashcards.studied ? `${flashcards.studied}/${flashcards.total} studied` : `${flashcards.total} in deck`,
      hint: flashcards.due
        ? `${flashcards.due} due now · ${flashcards.lapsed} lapsed`
        : flashcards.total
          ? "No reviews yet in this deck"
          : "No cards yet — learn the topic to build a deck",
      tone: flashcards.lapsed ? "review" : undefined,
    },
    {
      level: "mastery",
      value: masteryPct ? `${masteryPct}` : "no schedule",
      hint: mastery
        ? retentionPct
          ? `retention ${retentionPct} · confidence ${pct(mastery.confidence)} · ${mastery.attempts} graded`
          : "mastery tracked"
        : "No review schedule yet for this topic",
      tone: mastery ? (mastery.weak ? "review" : "success") : undefined,
    },
    {
      level: "exam",
      value: examValue,
      hint: outlook
        ? `Subject most-likely band — ${outlook.grade} grade, driven by all topics' evidence`
        : "This subject needs marked answers before any band is honest",
    },
  ];
}

function TopicRow({ topic, graph }: { topic: TopicGraph; graph: SubjectGraph }) {
  const [open, setOpen] = useState(false);
  const nodes = topicChain(topic, graph);
  const { conceptTotals, questions, unmapped } = topic;

  return (
    <li className="divide-y divide-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 hover:bg-surface2 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink truncate">{topic.topicTitle}</p>
          <TopicStatusTag status={topic.topicStatus.status} explanation={topic.topicStatus.explanation} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[11px] text-ink3">
          {topic.specRef ? <span className="font-mono">{topic.specRef}</span> : null}
          <span>
            {conceptTotals.evidenced}/{conceptTotals.total} spec statements evidenced
          </span>
          {questions.attempted ? <span>{questions.attempted} questions practised</span> : null}
          {topic.mastery ? (
            <span className="tabular-nums">mastery {Math.round(topic.mastery.mastery * 100)}%</span>
          ) : null}
          {open ? <span className="text-ink3">Hide map</span> : <span className="text-accent">Show the map</span>}
        </div>
      </button>

      {open ? (
        <div className="px-4 py-3 space-y-3 fade-in">
          <ol
            className="flex flex-wrap items-center gap-x-1 gap-y-1.5"
            aria-label={`${topic.topicTitle}: the eight levels of the knowledge graph`}
          >
            {nodes.map((node, i) => (
              <li key={node.level} className="flex items-center gap-1">
                {i > 0 ? (
                  <span aria-hidden="true" className="text-ink3 px-0.5 select-none">
                    →
                  </span>
                ) : null}
                <span
                  className="inline-flex flex-col gap-0.5 rounded border border-line bg-surface2 px-2 py-1 min-w-0"
                  title={node.hint}
                >
                  <span className="text-[9px] uppercase tracking-wider text-ink3 font-semibold">{node.level}</span>
                  <span className={`text-[11px] leading-tight tabular-nums truncate max-w-[15rem] ${node.tone === "danger" ? "text-danger" : node.tone === "review" ? "text-review" : node.tone === "success" ? "text-success" : "text-ink"}`}>
                    {node.value}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {conceptTotals.total > 0 ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1">
                Spec statements — every concept this topic examines
              </p>
              <ul className="card divide-y divide-line">
                {topic.concepts.map((concept) => (
                  <ConceptRow key={concept.id} concept={concept} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-ink3">No spec statements mapped for this topic yet — content migration pending.</p>
          )}

          {unmapped.attempts + unmapped.mistakes + unmapped.cards > 0 ? (
            <p className="text-[11px] text-ink3" role="note">
              {[
                unmapped.attempts ? `${unmapped.attempts} practised question${unmapped.attempts === 1 ? "" : "s"}` : null,
                unmapped.mistakes ? `${unmapped.mistakes} mistake${unmapped.mistakes === 1 ? "" : "s"}` : null,
                unmapped.cards ? `${unmapped.cards} card${unmapped.cards === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              {unmapped.attempts + unmapped.mistakes + unmapped.cards === 1 ? "isn't" : "aren't"} yet mapped to a spec
              statement — counted here rather than guessed onto a concept.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function KnowledgeMap({ graph }: { graph: SubjectGraph }) {
  const { totals, unmapped, exam } = graph;
  const accuracy = pct(totals.accuracy);
  const outlook = exam.outlook;

  return (
    <div className="space-y-5">
      {/* Specification node → … → Exam performance node */}
      <Panel className="space-y-3">
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="Subject knowledge graph, specification to exam">
          <li className="flex-1 min-w-[12rem]">
            <div className="h-full rounded border border-line bg-surface2 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink3 font-semibold">1 · Specification</p>
              <p className="text-sm font-semibold text-ink mt-1">{graph.subjectName}</p>
              <p className="text-[11px] text-ink3 mt-0.5">
                {[graph.specCode, graph.specVersion ? `spec ${graph.specVersion}` : null].filter(Boolean).join(" · ") ||
                  "Subject specification"}
              </p>
              <p className="text-[11px] text-ink3 mt-1">
                {graph.units.reduce((n, u) => n + u.topics.length, 0)} topics · {totals.concepts} spec statements
              </p>
            </div>
          </li>
          <li aria-hidden="true" className="flex items-center text-ink3 select-none">
            →
          </li>
          <li className="flex-1 min-w-[14rem]">
            <div className="h-full rounded border border-line bg-surface2 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink3 font-semibold">Learning evidence</p>
              <p className="text-xs text-ink mt-1.5 leading-relaxed">
                <span className="text-ink font-medium">{totals.evidenced} of {totals.concepts} statements practised</span>
                {" · "}
                <span className={totals.shaky > 0 ? "text-review" : undefined}>{totals.shaky} shaky</span>
                {" · "}
                <span className="text-ink3">{totals.untouched} untouched</span>
              </p>
              <p className="text-xs text-ink3 mt-1 leading-relaxed">
                {totals.practisedQuestions} questions practised{accuracy ? ` · ${accuracy} average` : ""}
                {totals.unresolvedMistakes ? ` · ${totals.unresolvedMistakes} open mistakes` : ""}
                {totals.dueCards ? ` · ${totals.dueCards} cards due` : ""}
              </p>
              {unmapped.attempts + unmapped.mistakes + unmapped.cards + unmapped.questions > 0 ? (
                <p className="text-[11px] text-ink3 mt-1.5" role="note">
                  Integrity note: {[
                    unmapped.questions ? `${unmapped.questions} questions` : null,
                    unmapped.attempts ? `${unmapped.attempts} practised` : null,
                    unmapped.cards ? `${unmapped.cards} cards` : null,
                    unmapped.mistakes ? `${unmapped.mistakes} mistakes` : null,
                  ].filter(Boolean).join(", ")}{" "}
                  {unmapped.attempts + unmapped.mistakes + unmapped.cards + unmapped.questions === 1 ? "has" : "have"} no
                  spec-statement link yet.
                </p>
              ) : null}
            </div>
          </li>
          <li aria-hidden="true" className="flex items-center text-ink3 select-none">
            →
          </li>
          <li className="flex-1 min-w-[12rem]">
            <div className="h-full rounded border border-line bg-surface2 p-3">
              <p className="text-[10px] uppercase tracking-wider text-ink3 font-semibold">8 · Exam performance</p>
              {outlook ? (
                <>
                  <p className="text-sm font-semibold text-ink mt-1 tabular-nums">
                    {outlook.low}–{outlook.high}% <span className="text-ink3 font-normal">· {outlook.grade}</span>
                  </p>
                  <p className="text-[11px] text-ink3 mt-0.5">
                    most likely score on current evidence
                    {exam.examDate ? ` · ${exam.examDate.label}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink3 mt-1">No honest band yet</p>
                  <p className="text-[11px] text-ink3 mt-0.5">
                    Marked answers in this subject unlock the estimate — practise exam questions.
                  </p>
                </>
              )}
              {exam.targetGrade ? <Pill className="mt-2">target {exam.targetGrade}</Pill> : null}
            </div>
          </li>
        </ol>
      </Panel>

      {/* Topic chains */}
      {graph.units.map((unit) => (
        <section key={unit.id}>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-1.5">{unit.title}</p>
          <ul className="card divide-y divide-line cv-list">
            {unit.topics.map((topic) => (
              <TopicRow key={topic.topicId} topic={topic} graph={graph} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
