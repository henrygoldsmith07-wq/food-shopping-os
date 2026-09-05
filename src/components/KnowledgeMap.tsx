'use client';

import { useState, type ReactNode } from 'react';
import {
  GRAPH_LEVELS, type ConceptNode, type SubjectGraph, type TopicGraph,
} from '../domain/knowledge-graph';
import TopicStatusTagBase from './TopicStatusTag.jsx';
import { Card as UiCard, Pill as UiPill } from './ui.jsx';
// The ui kit is plain JSX without declarations, so tsx importers see inferred
// props. Alias to `any` — the call sites carry the real props.
const Card: any = UiCard;
const Pill: any = UiPill;
const TopicStatusTag: any = TopicStatusTagBase;

// ---------------------------------------------------------------------------
// Knowledge map: the spec-to-exam chain rendered as a connected, walkable
// graph. Every number is measured evidence from the SubjectGraph — statuses
// are words with icons, never colour alone, and the ordering of the eight
// levels is visible as labelled steps, not just arrows.
// ---------------------------------------------------------------------------

const INK = 'var(--ink)';
const MUTED = 'var(--muted)';
const FAINT = 'var(--faint)';
const LINE = 'var(--line)';
const SURFACE = 'var(--card-2)';
const TONE_TEXT = { danger: 'var(--danger)', review: 'var(--warn)', success: 'var(--good)' };

function pct(n: number | null | undefined): string | null {
  return n == null ? null : `${Math.round(n * 100)}%`;
}

const CONCEPT_EXPLANATION: Record<ConceptNode['status'], string> = {
  covered: 'Evidence holds — linked questions and cards stay accurate.',
  shaky: 'Evidence exists but is not holding — open mistakes, low accuracy, or lapsed cards.',
  untouched: 'No attempts on linked questions and no studied cards yet — this statement is unstarted.',
};

function ConceptRow({ concept }: { concept: ConceptNode }) {
  const accuracy = pct(concept.accuracy);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0" style={{ borderColor: LINE }}>
      <span className="w-16 shrink-0 truncate text-[0.71875rem] font-mono" style={{ color: MUTED }} title={concept.ref}>
        {concept.ref}
      </span>
      <span className="min-w-0 flex-1 text-[0.8125rem] font-semibold" style={{ color: INK }}>{concept.text}</span>
      <TopicStatusTag status={concept.status} explanation={CONCEPT_EXPLANATION[concept.status]} />
      <span className="flex flex-wrap items-center gap-1.5">
        {concept.questionCount > 0 ? (
          concept.attemptedCount > 0 ? (
            <Pill tone="good" >Q {concept.attemptedCount}/{concept.questionCount}{accuracy ? ` · ${accuracy}` : ''}</Pill>
          ) : (
            <Pill tone="muted">Q 0/{concept.questionCount}</Pill>
          )
        ) : (
          <Pill tone="muted">no questions</Pill>
        )}
        {concept.cardCount > 0 ? (
          concept.studiedCardCount > 0 ? (
            <Pill tone="accent">cards {concept.studiedCardCount}/{concept.cardCount}</Pill>
          ) : (
            <Pill tone="muted">cards 0/{concept.cardCount}</Pill>
          )
        ) : null}
        {concept.unresolvedMistakeCount > 0 ? (
          <Pill tone="danger">{concept.unresolvedMistakeCount} open mistake{concept.unresolvedMistakeCount === 1 ? '' : 's'}</Pill>
        ) : concept.mistakeCount > 0 ? (
          <Pill tone="good">mistakes resolved</Pill>
        ) : null}
      </span>
    </li>
  );
}

interface ChainNode {
  level: (typeof GRAPH_LEVELS)[number];
  value: string;
  hint: string;
  tone?: 'neutral' | 'success' | 'review' | 'danger';
}

/** One topic's chain: spec → topic → concept → question → mistake → flashcard → mastery → exam. */
function topicChain(topic: TopicGraph, graph: SubjectGraph): ChainNode[] {
  const { conceptTotals, questions, mistakes, flashcards, mastery } = topic;
  const accuracy = pct(questions.accuracy);
  const masteryPct = mastery ? pct(mastery.mastery) : null;
  const retentionPct = mastery ? pct(mastery.retention) : null;
  const outlook = graph.exam.outlook;
  const examValue = outlook ? `${outlook.low}–${outlook.high}%` : 'no band yet';

  return [
    {
      level: 'specification',
      value: topic.specRef || graph.specCode ? `${topic.specRef || graph.specCode} spec` : 'Specification',
      hint: topic.specRef ? 'Spec reference this topic tracks' : 'Subject specification',
    },
    {
      level: 'topic',
      value: topic.topicTitle,
      hint: topic.topicStatus.explanation,
      tone: topic.topicStatus.status === 'covered' ? 'success' : topic.topicStatus.status === 'shaky' ? 'review' : undefined,
    },
    {
      level: 'concept',
      value: `${conceptTotals.evidenced}/${conceptTotals.total} evidenced`,
      hint:
        conceptTotals.total === 0
          ? 'No spec statements mapped for this topic yet'
          : `${conceptTotals.covered} covered · ${conceptTotals.shaky} shaky · ${conceptTotals.untouched} untouched`,
      tone: conceptTotals.total > 0 && conceptTotals.evidenced === conceptTotals.total ? 'success' : undefined,
    },
    {
      level: 'question',
      value: questions.attempted ? `${questions.attempted} practised${accuracy ? ` · ${accuracy}` : ''}` : 'not practised',
      hint: questions.attempted
        ? `${accuracy ?? '—'} average across ${questions.total} content questions`
        : `${questions.total} content questions, none attempted yet`,
      tone: questions.attempted && (questions.accuracy ?? 1) < 0.5 ? 'review' : undefined,
    },
    {
      level: 'mistake',
      value: mistakes.unresolved ? `${mistakes.unresolved} open` : mistakes.total ? 'resolved' : 'none',
      hint:
        mistakes.total === 0
          ? 'No marks lost recorded here'
          : `${mistakes.total} mistake${mistakes.total === 1 ? '' : 's'} · ${mistakes.marksLost} marks lost`,
      tone: mistakes.unresolved ? 'danger' : mistakes.total ? 'success' : undefined,
    },
    {
      level: 'flashcard',
      value: flashcards.studied ? `${flashcards.studied}/${flashcards.total} studied` : `${flashcards.total} in deck`,
      hint: flashcards.due
        ? `${flashcards.due} due now · ${flashcards.lapsed} lapsed`
        : flashcards.studied > 0
          ? 'Reviewed cards are scheduled — see the queue for when'
          : flashcards.total
            ? 'No reviews yet in this deck'
            : 'No cards yet — learn the topic to build a deck',
      tone: flashcards.lapsed ? 'review' : undefined,
    },
    {
      level: 'mastery',
      value: masteryPct || 'per card',
      hint: mastery
        ? retentionPct
          ? `retention ${retentionPct} · confidence ${pct(mastery.confidence)} · ${mastery.attempts} graded`
          : 'mastery tracked'
        : flashcards.total
          ? 'Schedules live per card — see the review queue for the whole deck'
          : 'No cards yet — scheduling starts with the first review',
      tone: mastery ? (mastery.weak ? 'review' : 'success') : undefined,
    },
    {
      level: 'exam',
      value: examValue,
      hint: outlook
        ? `Subject most-likely band — ${outlook.grade} grade, driven by all topics' evidence`
        : 'This subject needs marked answers before any band is honest',
    },
  ];
}

function TopicRow({ topic, graph }: { topic: TopicGraph; graph: SubjectGraph }) {
  const [open, setOpen] = useState(false);
  const nodes = topicChain(topic, graph);
  const { conceptTotals, questions, unmapped } = topic;

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press w-full px-4 py-3 text-left"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[0.9375rem] font-extrabold" style={{ color: INK }}>{topic.topicTitle}</p>
          <TopicStatusTag status={topic.topicStatus.status} label={topic.topicStatus.label} tone={topic.topicStatus.tone} explanation={topic.topicStatus.explanation} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[0.71875rem] font-semibold" style={{ color: FAINT }}>
          {topic.specRef ? <span className="font-mono">{topic.specRef}</span> : null}
          <span>{conceptTotals.evidenced}/{conceptTotals.total} spec statements evidenced</span>
          {questions.attempted ? <span>{questions.attempted} questions practised</span> : null}
          <span className={open ? '' : 'font-extrabold'} style={{ color: open ? FAINT : 'var(--accent)' }}>
            {open ? 'Hide map' : 'Show the map'}
          </span>
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t px-4 py-3" style={{ borderColor: LINE }}>
          <ol
            className="flex flex-wrap items-center gap-x-1 gap-y-1.5"
            aria-label={`${topic.topicTitle}: the eight levels of the knowledge graph`}
          >
            {nodes.map((node, i) => (
              <li key={node.level} className="flex items-center gap-1">
                {i > 0 ? (
                  <span aria-hidden="true" className="select-none px-0.5" style={{ color: FAINT }}>→</span>
                ) : null}
                <span
                  className="inline-flex min-w-0 flex-col gap-0.5 rounded-xl border px-2 py-1"
                  style={{ borderColor: LINE, background: SURFACE }}
                  title={node.hint}
                >
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider" style={{ color: FAINT }}>{node.level}</span>
                  <span
                    className="max-w-[15rem] truncate text-[0.71875rem] leading-tight tabular-nums"
                    style={{ color: node.tone && node.tone !== 'neutral' ? TONE_TEXT[node.tone] : INK }}
                  >
                    {node.value}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {conceptTotals.total > 0 ? (
            <div>
              <p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: FAINT }}>
                Spec statements — every concept this topic examines
              </p>
              <ul className="card overflow-hidden">
                {topic.concepts.map((concept) => (
                  <ConceptRow key={concept.id} concept={concept} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[0.8125rem] font-semibold" style={{ color: MUTED }}>
              No spec statements mapped for this topic yet — content migration pending.
            </p>
          )}

          {unmapped.attempts + unmapped.mistakes + unmapped.cards > 0 ? (
            <p role="note" className="text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
              {[
                unmapped.attempts ? `${unmapped.attempts} practised question${unmapped.attempts === 1 ? '' : 's'}` : null,
                unmapped.mistakes ? `${unmapped.mistakes} mistake${unmapped.mistakes === 1 ? '' : 's'}` : null,
                unmapped.cards ? `${unmapped.cards} card${unmapped.cards === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(', ')}{' '}
              {unmapped.attempts + unmapped.mistakes + unmapped.cards === 1 ? "isn't" : "aren't"} yet mapped to a spec
              statement — counted here rather than guessed onto a concept.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

const headerNode = (title: string, children: ReactNode) => (
  <div className="min-w-[12rem] flex-1 rounded-xl border p-3" style={{ borderColor: LINE, background: SURFACE }}>
    <p className="text-[0.625rem] font-bold uppercase tracking-wider" style={{ color: FAINT }}>{title}</p>
    {children}
  </div>
);

export function KnowledgeMap({ graph }: { graph: SubjectGraph }) {
  const { totals, unmapped, exam } = graph;
  const accuracy = pct(totals.accuracy);
  const outlook = exam.outlook;

  return (
    <div className="space-y-4">
      {/* Specification node → … → Exam performance node */}
      <Card className="!p-3 space-y-3">
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="Subject knowledge graph, specification to exam">
          <li className="flex min-w-[12rem] flex-1">
            {headerNode('1 · Specification', (
              <>
                <p className="mt-1 text-[0.9375rem] font-extrabold" style={{ color: INK }}>{graph.subjectName}</p>
                <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
                  {[graph.specCode, graph.specVersion ? `spec ${graph.specVersion}` : null].filter(Boolean).join(' · ') || 'Subject specification'}
                </p>
                <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
                  {graph.units.reduce((n, u) => n + u.topics.length, 0)} topics · {totals.concepts} spec statements
                </p>
              </>
            ))}
          </li>
          <li aria-hidden="true" className="flex select-none items-center" style={{ color: FAINT }}>→</li>
          <li className="flex min-w-[14rem] flex-1">
            {headerNode('Learning evidence', (
              <p className="mt-1.5 text-[0.75rem] font-semibold leading-relaxed" style={{ color: MUTED }}>
                <span style={{ color: INK }}>{totals.evidenced} of {totals.concepts} statements practised</span>
                {' · '}
                <span style={{ color: totals.shaky > 0 ? 'var(--warn)' : MUTED }}>{totals.shaky} shaky</span>
                {' · '}
                <span style={{ color: FAINT }}>{totals.untouched} untouched</span>
              </p>
            ))}
          </li>
          <li aria-hidden="true" className="flex select-none items-center" style={{ color: FAINT }}>→</li>
          <li className="flex min-w-[12rem] flex-1">
            {headerNode('8 · Exam performance', (
              outlook ? (
                <>
                  <p className="mt-1 text-[0.9375rem] font-extrabold tabular-nums" style={{ color: INK }}>
                    {outlook.low}–{outlook.high}% <span className="font-semibold" style={{ color: MUTED }}>· {outlook.grade}</span>
                  </p>
                  <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
                    most likely score on current evidence{exam.examDate ? ` · ${exam.examDate.label}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[0.875rem] font-extrabold" style={{ color: FAINT }}>No honest band yet</p>
                  <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
                    Marked answers in this subject unlock the estimate — practise exam questions.
                  </p>
                </>
              )
            ))}
            {exam.targetGrade ? <Pill tone="accent" >target {exam.targetGrade}</Pill> : null}
          </li>
        </ol>
        {totals.practisedQuestions > 0 || totals.unresolvedMistakes || totals.dueCards ? (
          <p className="text-[0.75rem] font-semibold" style={{ color: MUTED }}>
            {totals.practisedQuestions ? `${totals.practisedQuestions} questions practised${accuracy ? ` · ${accuracy} average` : ''}` : null}
            {totals.unresolvedMistakes ? ` · ${totals.unresolvedMistakes} open mistakes` : null}
            {totals.dueCards ? ` · ${totals.dueCards} cards due` : null}
          </p>
        ) : null}
        {unmapped.attempts + unmapped.mistakes + unmapped.cards + unmapped.questions > 0 ? (
          <p role="note" className="text-[0.71875rem] font-semibold" style={{ color: MUTED }}>
            Integrity note: {[
              unmapped.questions ? `${unmapped.questions} questions` : null,
              unmapped.attempts ? `${unmapped.attempts} practised` : null,
              unmapped.cards ? `${unmapped.cards} cards` : null,
              unmapped.mistakes ? `${unmapped.mistakes} mistakes` : null,
            ].filter(Boolean).join(', ')}{' '}
            {unmapped.attempts + unmapped.mistakes + unmapped.cards + unmapped.questions === 1 ? 'has' : 'have'} no
            spec-statement link yet.
          </p>
        ) : null}
      </Card>

      {/* Topic chains */}
      {graph.units.map((unit) => (
        <section key={unit.id}>
          <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: FAINT }}>{unit.title}</p>
          <div className="space-y-1.5">
            {unit.topics.map((topic) => (
              <TopicRow key={topic.topicId} topic={topic} graph={graph} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
