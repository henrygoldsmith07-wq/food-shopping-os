import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, FlaskConical, Package, ShoppingCart, SlidersHorizontal, Upload } from 'lucide-react';
import { STEP_META, GOAL_FINISH } from './onboarding-config.js';
import OnboardingWelcomeStep from './OnboardingWelcomeStep.jsx';
import { useApp } from '../lib/store.jsx';
import { DEFAULT_TARGETS } from '../data/nutrients.js';
import { BODY_GOALS, DIET_PATTERNS, SEXES } from '../data/goals.js';
import { bmr, computeTargets, maintenanceFrom, targetsFor } from '../lib/goals.js';
import { assessTarget } from '../lib/target-safety.js';
import {
  isUnderEighteen, YOUTH_COPY, YOUTH_SIGNPOST, youthConsentRecord, youthGoal,
} from '../lib/youth.js';
import { byId } from '../data/recipes.js';
import { MAX_STARTER_PICKS, starterOptions, starterSuitable } from '../lib/starter-recipes.js';
import { haptic } from '../lib/haptics.js';
import { recordProductEvent } from '../lib/product-analytics.js';
import { Card, Chip, FoodArt, Stepper, Toggle } from './ui.jsx';
import StarterPicker from './StarterPicker.jsx';
import OnboardingAccount from './AccountSignIn.jsx';
import { NumberField } from './FoodDetail.jsx';
import { TargetPreview } from './TargetSafety.jsx';
import { QUICK_START_DEFAULTS, firstSessionPlan } from '../lib/onboarding-quick-start.js';
import OnboardingShowcase from './OnboardingShowcase.jsx';

const num = (value) => Math.max(0, Number(value) || 0) || null;

export default function Onboarding() {
  const app = useApp();
  const restoreRef = useRef(null);
  const seenSteps = useRef(new Set());
  const [restoreStatus, setRestoreStatus] = useState('');
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [entryGoal, setEntryGoal] = useState('plan');
  const [starterRecipeIds, setStarterRecipeIds] = useState([]);
  const [starterRound, setStarterRound] = useState(0);
  const [showPersonalisation, setShowPersonalisation] = useState(false);
  const [household, setHousehold] = useState(1);
  const [budget, setBudget] = useState('');
  const [diets, setDiets] = useState([]);
  const [goal, setGoal] = useState('maintain');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('unspecified');
  const [maintenance, setMaintenance] = useState('');
  const [trackCycle, setTrackCycle] = useState(false);
  const [youthConsent, setYouthConsent] = useState(false);

  const toggleDiet = (id) =>
    setDiets((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  /* What we can offer, worked out from what has been said so far: allergens and
     religious rules remove a dish, dietary patterns remove a dish, and only
     then does anything get ranked. Changing a pattern on the step before this
     one changes what is on this one. */
  const rules = useMemo(() => ({
    diets,
    members: app.members,
    prefs: { allergies: app.allergies, religious: app.religious },
  }), [diets, app.members, app.allergies, app.religious]);
  const starters = useMemo(
    () => starterOptions({ ...rules, round: starterRound }),
    [rules, starterRound],
  );

  /* Go back, choose "vegan", and a chicken dish picked a moment ago is no
     longer suitable — so it is no longer selected either. Choices made in an
     earlier round of suggestions do survive. */
  const picked = starterRecipeIds.filter((id) => starterSuitable(byId(id), rules));

  const body = useMemo(() => ({
    sex,
    age: num(age),
    heightCm: num(heightCm),
    weightKg: num(weightKg),
    activity: 'light',
  }), [sex, age, heightCm, weightKg]);
  const estimated = maintenanceFrom(body);
  /* The age is asked before anything is offered, so under-18 mode is on for the
     rest of setup rather than applied afterwards. */
  const youth = isUnderEighteen({ body });
  const offeredGoals = youth ? BODY_GOALS.filter((g) => g.kcalFactor >= 1) : BODY_GOALS;
  const chosenGoal = youth ? youthGoal(goal) : goal;

  /* Setup runs the same safety assessment the app does, so the preview cannot
     promise a target the app will then refuse to set. */
  const safety = assessTarget({
    goal: chosenGoal,
    body,
    maintenanceKcal: estimated || num(maintenance),
    bmrKcal: bmr(body),
    typedMaintenance: num(maintenance),
  });

  /** Whatever we know: the estimate, a typed figure, or the default. */
  const preview = computeTargets({
    goal: chosenGoal,
    diets,
    maintenanceKcal: estimated || num(maintenance),
    weightKg: body.weightKg,
    sex: body.sex,
    bmrKcal: bmr(body),
    fallbackKcal: DEFAULT_TARGETS.kcal,
    youth,
    safety,
  });

  const finish = () => {
    const state = {
      goal: chosenGoal,
      diets,
      body,
      maintenanceKcal: Math.max(0, Number(maintenance) || 0),
      targets: DEFAULT_TARGETS,
    };
    app.finishOnboarding({
      ...state,
      name: name.trim() || 'you',
      household,
      trackCycle,
      ...(trackCycle ? { enabledTools: ['cycle'] } : {}),
      youthConsent: youth && youthConsent ? youthConsentRecord(app.day) : null,
      entryGoal,
      starterRecipeIds: entryGoal === 'pantry' ? [] : picked,
      ...firstSession,
      weeklyBudget: Math.max(0, Number(budget) || 0),
      targets: targetsFor(state),
    });
    recordProductEvent('onboarding_completed', {
      intent: entryGoal,
      count: entryGoal === 'pantry' ? 0 : picked.length,
    }, undefined, state);
    haptic();
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setRestoreStatus(result.ok ? 'Backup restored.' : result.error);
  };

  const currentStep = STEP_META[step];
  const goalFinish = GOAL_FINISH[entryGoal] || GOAL_FINISH.plan;
  const stepNote = step === 0
    ? 'Plan a few meals, use what is already in your kitchen, and get one clear list. You stay in control of every choice.'
    : step === 1
      ? 'These details shape portions and suggestions. Skip anything you do not want to share.'
      : goalFinish.note;
  const ideaCards = starters.options.slice(0, 3);
  const starterRecipes = (entryGoal === 'pantry' ? [] : picked).map(byId).filter(Boolean);
  const firstSession = firstSessionPlan({
    day: app.day,
    recipes: starterRecipes,
    pickedRecipeIds: entryGoal === 'pantry' ? [] : picked,
    household,
    budget,
  });

  useEffect(() => {
    if (seenSteps.current.has(step)) return;
    seenSteps.current.add(step);
    recordProductEvent(
      `onboarding_step_${step + 1}_viewed`,
      {},
      undefined,
      { ...app, body },
    );
  }, [step, app, body]);

  return (
    <main
      className="min-h-screen px-4 py-5 sm:px-6 sm:py-7 lg:px-10"
      style={{
        background: 'radial-gradient(ellipse at 12% 4%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 38%), radial-gradient(ellipse at 94% 94%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 34%), var(--bg)',
      }}
    >
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:gap-12">
        <OnboardingShowcase ideaCards={ideaCards} />
        <section className="flex items-center py-1 lg:py-6">
          <div
            className="w-full rounded-[1.75rem] border p-5 sm:p-7 lg:p-8"
            style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--card) 96%, transparent)', boxShadow: '0 28px 90px color-mix(in srgb, var(--ink) 9%, transparent)' }}
          >
            <div className="mb-7">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>Step {step + 1} <span style={{ color: 'var(--faint)' }}>/ 3</span></p>
                <p className="text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>{currentStep.label}</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="progressbar" aria-label={`Onboarding: step ${step + 1} of 3`} aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
                {[0, 1, 2].map((index) => (
                  <span key={index} className="h-1.5 rounded-full transition-colors" style={{ background: index <= step ? 'var(--accent)' : 'var(--line)' }} />
                ))}
              </div>
            </div>

            <header className="mb-6">
              <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--faint)' }}>{currentStep.note}</p>
              <h1 className="mt-2 text-[1.75rem] font-black tracking-[-0.045em] leading-tight sm:text-[2rem]">{step === 2 ? goalFinish.title : currentStep.title}</h1>
              <p className="mt-2 max-w-xl text-[0.875rem] font-medium leading-relaxed" style={{ color: 'var(--muted)' }}>{stepNote}</p>
            </header>

            <div className="space-y-4">
        {step === 0 && <OnboardingWelcomeStep name={name} setName={setName} entryGoal={entryGoal} setEntryGoal={setEntryGoal} setStep={setStep} />}
        {step === 1 && (
          <>
            {/* Ordered by what actually changes the first output: how many
                people scales the list and what you eat filters the meals.
                Age and budget are asked last, optional, and explained. */}
            <Card className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[0.875rem]">People you cook for</p>
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>Including you — scales the shopping list</p>
              </div>
              <Stepper value={household} onChange={setHousehold} min={1} max={10} />
            </Card>
            <Card>
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
                How you eat
              </p>
              <div className="flex flex-wrap gap-2">
                {DIET_PATTERNS.map((d) => (
                  <Chip key={d.id} active={diets.includes(d.id)} onClick={() => toggleDiet(d.id)}>{d.label}</Chip>
                ))}
              </div>
              <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Pick any that apply, or none. They filter the meals offered next — nothing else is locked in.
              </p>
            </Card>
            <Card>
              <NumberField label="Your age" value={age} onChange={setAge} suffix="yrs" step={1} />
              <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Optional, and only used for nutrition targets. Leave it blank and Forq stays as it is.
              </p>
              {youth && (
                <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
                  <p className="text-[0.8125rem] font-extrabold">Forq is set up for under-18s</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    <li>{YOUTH_COPY.targets}</li>
                    <li>{YOUTH_COPY.balance}</li>
                    <li>Fasting, alcohol targets and weight predictions are not part of it.</li>
                  </ul>
                </div>
              )}
            </Card>
            <Card>
              <NumberField
                label="Weekly food budget"
                value={budget}
                onChange={setBudget}
                suffix="£"
                step={5}
              />
              <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Leave it at 0 if you'd rather not track spending.
              </p>
            </Card>
          </>
        )}

        {step === 2 && entryGoal === 'pantry' && (
          <div className="rounded-[1.5rem] border p-5 sm:p-6" style={{ borderColor: 'var(--line)', background: 'linear-gradient(145deg, var(--accent-soft), color-mix(in srgb, var(--card) 92%, transparent))' }}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                <Package size={18} />
              </span>
              <div>
                <p className="text-[0.9375rem] font-extrabold">Your kitchen, before the shopping list</p>
                <p className="mt-1 text-[0.8125rem] font-medium leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Start with one item you already have. Add a name and quantity in your pantry; Forq only subtracts stock you confirm.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
              <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--faint)' }}>Your next step</p>
              <p className="mt-1 text-[0.875rem] font-extrabold">Add one cupboard or fridge item</p>
              <p className="mt-1 text-[0.75rem] font-medium" style={{ color: 'var(--muted)' }}>Then plan a meal to see what you can make before you shop.</p>
            </div>
          </div>
        )}

        {step === 2 && entryGoal !== 'pantry' && (
          <>
            <StarterPicker
              starters={starters}
              picked={picked}
              onToggle={(id) => setStarterRecipeIds((current) => (current.includes(id)
                ? current.filter((recipeId) => recipeId !== id)
                : picked.length < MAX_STARTER_PICKS ? [...current, id] : current))}
              onMore={() => setStarterRound((round) => round + 1)}
            />

            <div className="rounded-[1.35rem] border p-4 sm:p-5" style={{ borderColor: 'var(--line)', background: 'linear-gradient(145deg, var(--accent-soft), color-mix(in srgb, var(--card) 92%, transparent))' }}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                  <ShoppingCart size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] font-extrabold">{entryGoal === 'shop' ? 'Your first shopping list' : 'Ingredients for your week'}</p>
                  {picked.length ? (
                    <>
                      <p className="mt-0.5 text-[0.75rem] font-medium" style={{ color: 'var(--muted)' }}>
                        {picked.length} dinner{picked.length === 1 ? '' : 's'} · {firstSession.shoppingList.length} ingredients · {household} person{household === 1 ? '' : 's'}
                      </p>
                      <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                        {firstSession.shoppingList.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-[0.75rem]">
                            <span className="truncate font-semibold">{item.name}</span>
                            <span className="shrink-0 font-bold" style={{ color: 'var(--muted)' }}>{item.qty}</span>
                          </div>
                        ))}
                        {firstSession.shoppingList.length > 4 && (
                          <p className="pt-0.5 text-[0.6875rem] font-bold" style={{ color: 'var(--accent)' }}>
                            + {firstSession.shoppingList.length - 4} more ingredients
                          </p>
                        )}
                      </div>
                      <p className="mt-2 text-[0.65625rem] font-medium leading-relaxed" style={{ color: 'var(--faint)' }}>
                        Quantities scale to your household. Pantry stock has not been checked yet.
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[0.75rem] font-medium leading-relaxed" style={{ color: 'var(--muted)' }}>
                      Choose a dinner to see its ingredients here, or leave your kitchen empty for now.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPersonalisation((value) => !value)}
              aria-expanded={showPersonalisation}
              className="press flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left"
              style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
            >
              <span>
                <span className="block text-[0.84375rem] font-extrabold">Personalise nutrition</span>
                <span className="block text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>Optional goals, body metrics and cycle tracking</span>
              </span>
              <SlidersHorizontal size={17} style={{ color: 'var(--muted)' }} />
            </button>

            {showPersonalisation && (
              <>
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
                What are you aiming for?
              </p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {offeredGoals.map((g) => (
                  <Chip key={g.id} active={chosenGoal === g.id} onClick={() => setGoal(g.id)}>{g.label}</Chip>
                ))}
              </div>
              <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {BODY_GOALS.find((g) => g.id === chosenGoal).blurb}
              </p>
              {youth && (
                <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {YOUTH_COPY.goals}
                </p>
              )}
            </div>

            <Card className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField label="Your weight" value={weightKg} onChange={setWeightKg} suffix="kg" step={0.5} />
                <NumberField label="Your height" value={heightCm} onChange={setHeightCm} suffix="cm" step={1} />
                <div>
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Sex</span>
                  <div className="mt-1 flex gap-1.5 overflow-x-auto no-scrollbar">
                    {SEXES.map((s) => (
                      <Chip key={s.id} active={sex === s.id} onClick={() => setSex(s.id)}>{s.label}</Chip>
                    ))}
                  </div>
                </div>
              </div>
              {estimated ? (
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  That estimates your maintenance at <strong>{estimated.toLocaleString()} kcal</strong>
                  {' '}(Mifflin-St Jeor, lightly active). Change the activity level under Goals any time.
                </p>
              ) : (
                <NumberField label="Maintenance" value={maintenance} onChange={setMaintenance} suffix="kcal" step={50} />
              )}
            </Card>
            <p className="text-[0.75rem] font-semibold px-1 -mt-1" style={{ color: 'var(--muted)' }}>
              All optional. Weight, height, age and sex together let Forq estimate your maintenance
              instead of you knowing it — sex matters because the equation&rsquo;s constants differ by
              166 kcal, which is a meal. &ldquo;Rather not say&rdquo; takes the midpoint rather than
              picking one for you, and every field is editable later.
            </p>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-[0.875rem]">Track your cycle</p>
                  <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    Adds a page under Health for periods and symptoms
                  </p>
                </div>
                <Toggle label="Track your cycle" on={trackCycle} onChange={() => setTrackCycle(!trackCycle)} />
              </div>
              <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Off by default, and nothing else changes either way. Turn it on or off whenever you
                like under Goals.
              </p>
            </Card>

            <TargetPreview safety={safety} preview={preview} />
            <p className="text-[0.75rem] font-semibold px-1" style={{ color: 'var(--muted)' }}>
              Vitamins and minerals start at UK reference intakes. Everything here is editable later.
              {' '}{safety.support[0]}
            </p>
              </>
            )}

            {/* A separate consent question, asked outside the optional block so
                it cannot be skipped by leaving personalisation closed. */}
            {youth && (
              <Card className="space-y-2.5" style={{ borderColor: youthConsent ? 'var(--accent)' : 'var(--line)' }}>
                <p className="font-extrabold text-[0.90625rem]">Before you start</p>
                <p className="text-[0.78125rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {YOUTH_COPY.consent}
                </p>
                <ul className="list-disc space-y-1 pl-4 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  <li>Your data stays in this browser unless you sign in.</li>
                  <li>Anonymous product insights stay off, and cannot be turned on in this mode.</li>
                  <li>{YOUTH_COPY.sharing}</li>
                </ul>
                <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-[0.8125rem] font-bold">I have read this and want to continue</p>
                  <Toggle label="Accept the under-18 privacy terms" on={youthConsent} onChange={() => setYouthConsent(!youthConsent)} />
                </div>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {YOUTH_SIGNPOST}
                </p>
              </Card>
            )}
          </>
        )}
      </div>

      <div className="mt-7 flex gap-2.5 rise rise-2">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="press min-h-12 rounded-2xl border px-5 py-3.5 text-[0.875rem] font-extrabold"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => (step === 2 ? finish() : setStep(step + 1))}
          disabled={step === 2 && youth && !youthConsent}
          aria-describedby={step === 2 ? 'onboarding-next-action' : undefined}
          className="press flex min-h-12 flex-1 items-center justify-center rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: '0 10px 24px color-mix(in srgb, var(--accent) 22%, transparent)' }}
        >
          <span className="inline-flex items-center gap-2">
            {step === 2 ? (
              <>
                <Check size={16} strokeWidth={3} />
                <span>Start using Forq</span>
                <span aria-hidden="true" className="ml-1 rounded-full border px-2 py-1 text-[0.6875rem]" style={{ borderColor: 'color-mix(in srgb, var(--on-accent) 36%, transparent)' }}>
                  {goalFinish.actionLabel}
                </span>
              </>
            ) : <>Continue <ArrowRight size={16} /></>}
          </span>
        </button>
      </div>

      {step === 2 && <p id="onboarding-next-action" className="sr-only">{goalFinish.description}</p>}

      {step === 2 && !youth && (
        <p className="mt-3 text-center text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          Nutrition setup is optional. You can change these choices later.
        </p>
      )}

          </div>

      {step === 0 && (
        <div className="mt-4 rounded-2xl border p-4 text-center" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <button
            className="press min-h-11 px-4 py-2 text-[0.8125rem] font-extrabold"
            style={{ color: 'var(--accent)' }}
            onClick={app.enterDemoMode}
          >
            <span className="inline-flex items-center gap-1.5"><FlaskConical size={14} /> Explore an example week first</span>
          </button>
          <p className="mt-0.5 px-6 text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
            A fully stocked demo kitchen — plan, list, receipts. Nothing is saved and your own start is untouched.
          </p>
          <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
            <button
              className="press min-h-10 px-4 py-2 text-[0.75rem] font-bold"
              style={{ color: 'var(--muted)' }}
              onClick={() => restoreRef.current?.click()}
            >
              <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Restore an existing backup</span>
            </button>
          </div>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Restore Forq backup"
            onChange={restore}
          />
          {restoreStatus && <p role="status" className="mt-1 text-[0.75rem] font-semibold">{restoreStatus}</p>}
        </div>
      )}

          <p className="mt-4 text-center text-[0.6875rem] font-semibold lg:hidden" style={{ color: 'var(--faint)' }}>
            Private by default · No account needed · Sync is optional
          </p>
        </section>
      </div>
    </main>
  );
}
