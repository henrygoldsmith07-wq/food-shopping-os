import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, Check, Package, ShoppingCart, SlidersHorizontal,
  Upload, UtensilsCrossed,
} from 'lucide-react';
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
import { itemsFromRecipes } from '../data/stores.js';
import { addDays } from '../lib/kitchen.js';
import { haptic } from '../lib/haptics.js';
import { recordProductEvent } from '../lib/product-analytics.js';
import { Card, Chip, Stepper, Toggle } from './ui.jsx';
import StarterPicker from './StarterPicker.jsx';
import { NumberField } from './FoodDetail.jsx';
import { TargetPreview } from './TargetSafety.jsx';

const num = (value) => Math.max(0, Number(value) || 0) || null;

const ENTRY_GOALS = [
  { id: 'plan', title: 'Plan my meals', text: 'Choose a few dishes and build your week.', Icon: CalendarDays },
  { id: 'shop', title: 'Build a shopping list', text: 'Get one clear list, organised by aisle.', Icon: ShoppingCart },
  { id: 'pantry', title: 'Use food I already have', text: 'Start with your kitchen and waste less.', Icon: Package },
];

export default function Onboarding() {
  const app = useApp();
  const restoreRef = useRef(null);
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

  const body = {
    sex,
    age: num(age),
    heightCm: num(heightCm),
    weightKg: num(weightKg),
    activity: 'light',
  };
  // With weight, height and age, the equation runs; without, we fall back to
  // whatever figure you typed, and with neither to the default.
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
    const starterRecipes = picked.map(byId).filter(Boolean);
    const starterPlan = Object.fromEntries(starterRecipes.map((recipe, index) => [
      addDays(app.day, index),
      { dinner: recipe.id },
    ]));
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
      // Opting in at setup grants the cycle tool, so Health shows the page.
      ...(trackCycle ? { enabledTools: ['cycle'] } : {}),
      // Under 18 the consent answer is stored as its own record; over 18 there
      // is nothing extra to store and it stays null.
      youthConsent: youth && youthConsent ? youthConsentRecord(app.day) : null,
      entryGoal,
      starterRecipeIds: picked,
      plan: starterPlan,
      shoppingList: itemsFromRecipes(starterRecipes),
      weeklyBudget: Math.max(0, Number(budget) || 0),
      targets: targetsFor(state),
    });
    recordProductEvent('onboarding_completed', {
      intent: entryGoal,
      count: picked.length,
    });
    haptic();
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setRestoreStatus(result.ok ? 'Backup restored.' : result.error);
  };

  return (
    <div className="mx-auto max-w-lg min-h-screen px-5 pt-16 pb-10" style={{ background: 'var(--bg)' }}>
      <div className="rise">
        <UtensilsCrossed size={30} strokeWidth={1.5} style={{ color: 'var(--muted)' }} />
        <h1 className="mt-3 text-[1.75rem] font-extrabold tracking-tight leading-tight">
          {step === 0 ? 'Welcome to Forq' : step === 1 ? 'A little context' : 'Your first win'}
        </h1>
        <p className="mt-1.5 text-[0.875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {step === 0 && 'Choose what you want help with first. Nothing is filled in for you, and you can change direction at any time.'}
          {step === 1 && 'Two useful details make portions and spending more accurate. Both are optional.'}
          {step === 2 && 'Pick up to three recipes and Forq will turn them into meals and one shopping list.'}
        </p>
      </div>

      <div className="mt-6 space-y-4 rise rise-1">
        {step === 0 && (
          <>
            <fieldset>
              <legend className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                What would you like help with first?
              </legend>
              <div className="mt-2 grid gap-2.5">
                {ENTRY_GOALS.map(({ id, title, text, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={entryGoal === id}
                    onClick={() => setEntryGoal(id)}
                    className="press flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left"
                    style={{
                      background: entryGoal === id ? 'var(--accent-soft)' : 'var(--card)',
                      borderColor: entryGoal === id ? 'var(--accent)' : 'var(--line)',
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: entryGoal === id ? 'var(--accent)' : 'var(--card-2)', color: entryGoal === id ? 'var(--on-accent)' : 'var(--muted)' }}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-extrabold">{title}</span>
                      <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>{text}</span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <Card className="space-y-3">
            <label className="block">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                What should we call you? <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
                placeholder="Your name"
                aria-label="Your name"
                autoFocus
                className="mt-1.5 w-full rounded-2xl border px-4 py-3 text-[0.9375rem] font-semibold outline-none"
                style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
              />
            </label>
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Card>
              <NumberField label="Your age" value={age} onChange={setAge} suffix="yrs" step={1} />
              <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Asked here rather than buried in the nutrition settings, because it decides how the
                rest of the app behaves. Leave it blank and Forq stays as it is.
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
            <Card className="flex items-center justify-between">
              <div>
                <p className="font-bold text-[0.875rem]">People you cook for</p>
                <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>Including you</p>
              </div>
              <Stepper value={household} onChange={setHousehold} min={1} max={10} />
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
                Pick any that apply, or none. They filter recipes and shape your macro split.
              </p>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <StarterPicker
              starters={starters}
              picked={picked}
              onToggle={(id) => setStarterRecipeIds((current) => (current.includes(id)
                ? current.filter((recipeId) => recipeId !== id)
                : picked.length < MAX_STARTER_PICKS ? [...current, id] : current))}
              onMore={() => setStarterRound((round) => round + 1)}
            />

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

      <div className="mt-8 flex gap-2.5 rise rise-2">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="press rounded-2xl border px-5 py-3.5 font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Back
          </button>
        )}
        <button
          onClick={() => (step === 2 ? finish() : setStep(step + 1))}
          disabled={step === 2 && youth && !youthConsent}
          className="press flex-1 rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-2">
            {step === 2 ? <><Check size={16} strokeWidth={3} /> Start using Forq</> : <>Continue <ArrowRight size={16} /></>}
          </span>
        </button>
      </div>

      {step === 0 && (
        <div className="mt-4 text-center">
          <button
            className="press px-4 py-2 text-[0.78125rem] font-bold"
            style={{ color: 'var(--muted)' }}
            onClick={() => restoreRef.current?.click()}
          >
            <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Restore an existing backup</span>
          </button>
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

      <div className="mt-5 flex justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === step ? 22 : 8, background: i === step ? 'var(--accent)' : 'var(--line)' }}
          />
        ))}
      </div>
    </div>
  );
}
