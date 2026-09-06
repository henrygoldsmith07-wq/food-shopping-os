import { useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChefHat, Clock3, Leaf, RotateCcw, ShoppingCart } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import NewCardSection from './NewCardSection.jsx';
import { Card, Meter, Pill, Section } from './ui.jsx';
import ReviewQueueCard from './ReviewQueueCard.jsx';
import KnowledgeMapSection from './KnowledgeMapSection.jsx';
import SkipReasonsCard from './SkipReasonsCard.jsx';

const EMPTY_LOOP = {
  steps: [],
  completion: 0,
  pct: 0,
  next: 'plan',
};

const stageTarget = (id) => ({
  pantry: 'shop',
  plan: 'plan',
  list: 'shop',
  purchase: 'shop',
  consumption: 'cook',
  leftovers: 'plan',
  waste: 'learn',
  learning: 'learn',
}[id] || 'learn');

const stageIcon = (id) => ({
  plan: <BookOpen size={14} />,
  list: <ShoppingCart size={14} />,
  purchase: <ShoppingCart size={14} />,
  consumption: <ChefHat size={14} />,
  leftovers: <Leaf size={14} />,
  waste: <Leaf size={14} />,
  learning: <BookOpen size={14} />,
  pantry: <ShoppingCart size={14} />,
}[id] || <BookOpen size={14} />);

/**
 * Learn is the last stage of the product loop, not a second analytics home.
 * It explains what the household actually did, what that changes next, and
 * gives the next plan a single, evidence-backed way forward.
 */
export default function LearnTab({ goTab, openGuidance }) {
  const app = useApp();
  // The map's "Review this topic" asks the queue (rendered above the map) to
  // focus one topic. Each ask gets a fresh id so re-asking re-applies, and
  // the review scrolls back up so the person lands on the focused queue.
  const [reviewAsk, setReviewAsk] = useState(null);
  const queueRef = useRef(null);
  const requestTopic = (topicId) => {
    setReviewAsk({ id: (reviewAsk?.id || 0) + 1, topicId });
    // jsdom has no layout, so scrollIntoView is guarded (tests stub scrollTo).
    if (typeof queueRef.current?.scrollIntoView === 'function') {
      queueRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  // The skip-reasons card's per-row "Review N questions" asks the same queue
  // to focus one skip reason's cards instead of one topic's.
  const requestReason = (reason) => {
    setReviewAsk({ id: (reviewAsk?.id || 0) + 1, reason });
    if (typeof queueRef.current?.scrollIntoView === 'function') {
      queueRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const loop = app.closedLoop || EMPTY_LOOP;
  const outcome = app.planOutcome || {};
  const learning = outcome.learning || {};
  const dashboard = app.dashboard;
  const cooking = app.cookingTimeLearning || {};
  const preferences = app.learnedHouseholdPreferences || {};
  const steps = loop.steps || [];
  const hasOutcome = Boolean(
    outcome.planned || outcome.takeaway || app.waste?.length || app.shops?.length || app.cooked?.length,
  );
  const nextStep = steps.find((step) => !step.done);
  const completed = steps.filter((step) => step.done).length;
  const cooked = outcome.completed || 0;
  const planned = outcome.planned || 0;
  const skipped = outcome.skipped || 0;
  const wasteCount = dashboard?.waste?.count ?? app.waste?.length ?? 0;

  return (
    <div className="pb-6 space-y-6">
      <div className="hero-gradient px-5 pt-1 pb-4">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Use what happened
        </p>
        <h2 className="mt-1 text-[1.5rem] font-extrabold tracking-tight">Make the next week easier</h2>
        <p className="mt-1.5 max-w-[48ch] text-[0.8125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
          Learn turns recorded meals, shops and waste into one clear improvement — no invented scores and no silent assumptions.
        </p>
      </div>

      <Section className="rise rise-1">
        <Card className="!p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                This week’s loop
              </p>
              <p className="mt-1 text-[1rem] font-extrabold">
                {completed ? `${completed} of ${steps.length || 8} stages complete` : 'Start with a plan'}
              </p>
            </div>
            <Pill tone={loop.pct >= 75 ? 'good' : 'muted'}>{loop.pct || 0}%</Pill>
          </div>
          <div className="mt-3">
            <Meter value={loop.completion || 0} max={Math.max(steps.length, 8)} color={loop.pct >= 75 ? 'var(--good)' : 'var(--accent)'} />
          </div>
          {steps.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goTab(stageTarget(step.id))}
                  className="press min-w-0 rounded-xl border px-2.5 py-2 text-left"
                  style={{ borderColor: step.done ? 'var(--good)' : 'var(--line)', background: step.done ? 'color-mix(in srgb, var(--good) 8%, transparent)' : 'var(--card-2)' }}
                >
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-extrabold" style={{ color: step.done ? 'var(--good)' : 'var(--muted)' }}>
                    {step.done ? <Check size={13} strokeWidth={3} /> : stageIcon(step.id)}
                    {step.label}
                  </span>
                  <span className="mt-0.5 block text-[0.625rem] font-semibold" style={{ color: 'var(--faint)' }}>
                    {step.done ? 'complete' : 'next to close'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {nextStep && (
            <button
              type="button"
              onClick={() => goTab(stageTarget(nextStep.id))}
              className="press mt-3 inline-flex items-center gap-1.5 text-[0.78125rem] font-extrabold"
              style={{ color: 'var(--accent)' }}
            >
              Close the {nextStep.label.toLowerCase()} step <ArrowRight size={14} />
            </button>
          )}
        </Card>
      </Section>

      <Section title="What the week taught you" className="rise rise-1">
        <Card className="!p-4">
          {!hasOutcome ? (
            <>
              <p className="text-[0.9375rem] font-extrabold">There is not enough history yet</p>
              <p className="mt-1 text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                Plan one meal, record the shop and cook it. Learn will replace this message with evidence from those actions.
              </p>
            </>
          ) : (
            <>
              <p className="text-[0.9375rem] font-extrabold">{learning.suggestion || 'Keep recording meals and the next plan will get more personal.'}</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ['Planned', planned],
                  ['Cooked', cooked],
                  ['Skipped', skipped],
                  ['Binned', wasteCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl px-2 py-2 text-center" style={{ background: 'var(--card-2)' }}>
                    <p className="text-[1rem] font-extrabold">{value}</p>
                    <p className="text-[0.625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Signals Forq can use next" className="rise rise-2">
        <Card className="!p-4 space-y-3">
          {cooking.samples > 0 && (
            <div className="flex items-start gap-2">
              <Clock3 size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Your recorded cooks average {cooking.averageMins} minutes across {cooking.samples} meal{cooking.samples === 1 ? '' : 's'}.
              </p>
            </div>
          )}
          {preferences.learnedFromCooking > 0 && (
            <div className="flex items-start gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <ChefHat size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Household preferences are learning from {preferences.learnedFromCooking} cooked meal{preferences.learnedFromCooking === 1 ? '' : 's'}.
                {preferences.topCuisines?.length ? ` Favourites currently lean ${preferences.topCuisines.slice(0, 2).join(' and ')}.` : ''}
              </p>
            </div>
          )}
          {learning.topSkipLabel && (
            <div className="flex items-start gap-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <RotateCcw size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--muted)' }} />
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                The most common reason a planned meal was skipped: {learning.topSkipLabel}.
              </p>
            </div>
          )}
          {!cooking.samples && !preferences.learnedFromCooking && !learning.topSkipLabel && (
            <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Finish a cook or mark a planned meal’s outcome to give the next plan a signal.
            </p>
          )}
        </Card>
      </Section>

      <NewCardSection />

      <SkipReasonsCard onReviewReason={requestReason} />

      <div ref={queueRef}>
        <ReviewQueueCard topicReviewRequest={reviewAsk} />
      </div>

      <KnowledgeMapSection onReviewTopic={requestTopic} />

      <Section className="rise rise-2">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => goTab('plan')}
            className="press flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[0.84375rem] font-extrabold"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Plan with these lessons <ArrowRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => openGuidance('review')}
            className="press flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[0.84375rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            Review all evidence <ArrowRight size={15} />
          </button>
        </div>
      </Section>
    </div>
  );
}
