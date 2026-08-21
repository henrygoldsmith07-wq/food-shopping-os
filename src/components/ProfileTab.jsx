import { useRef, useState } from 'react';
import {
  Activity, Banknote, Bell, Dumbbell, Flame, HeartPulse, Lock,
  NotebookPen, RotateCcw, Download, SlidersHorizontal, Sparkles, Target, Trophy, Upload, Users,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Glyph } from './icons.jsx';
import { formatAmount } from '../data/nutrients.js';
import { nutrientRows, snackSummary, timingInsight } from '../lib/nutrition.js';
import { YOUTH_COPY } from '../lib/youth.js';
import { badgeProgress, cuisineSplit, spendByMonth, weekDates } from '../lib/kitchen.js';
import { gbp } from '../lib/utils.js';
import NutritionPanel from './NutritionPanel.jsx';
import GoalsPanel from './GoalsPanel.jsx';
import FamilyPanel from './FamilyPanel.jsx';
import QuestsPanel from './QuestsPanel.jsx';
import HealthPanel from './HealthPanel.jsx';
import ExercisePanel from './ExercisePanel.jsx';
import RemindersPanel from './RemindersPanel.jsx';
import PreferencesPanel from './PreferencesPanel.jsx';
import BackendPanel from './BackendPanel.jsx';
import PrivacyPanel from './PrivacyPanel.jsx';
import YouthNotice from './YouthNotice.jsx';
import { Section, Card, Ring, Pill, Meter, Bars, Sheet, Toggle } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';
import { ACCENT_UNLOCKS } from '../data/quests.js';
const UNLOCK_COLOURS = { sage: '#6b7f6a', clay: '#8c5a44', ink: '#2f3640' };
const ACCENTS = [
  ['mono', 'var(--ink)'],
  ['forest', '#3d5c4b'],
  ['ocean', '#3b5b73'],
  ['wine', '#6e4550'],
  ['honey', '#8a6a3b'],
];
export default function ProfileTab({ openGuidance }) {
  const app = useApp();
  const importRef = useRef(null);
  const [dataStatus, setDataStatus] = useState('');
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [budget, setBudget] = useState(app.weeklyBudget || '');
  const [confirmReset, setConfirmReset] = useState(false);
  const snacks = snackSummary(app.entries);
  const timing = timingInsight(app.entries);
  const highlights = nutrientRows(app.totals, app.targets)
    .filter((r) => ['fibre', 'sugar', 'sodium', 'vitC', 'iron', 'calcium'].includes(r.key));
  const week = weekDates(app.day).map((date) => ({
    label: new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3),
    value: app.kcalFor(date),
  }));
  const loggedThisWeek = week.some((d) => d.value > 0);
  const spend = spendByMonth(app.shops, 6, app.day);
  const hasSpend = spend.some((m) => m.spend > 0);
  const cuisines = cuisineSplit(app.cooked);
  const badges = badgeProgress(app.stats);
  const macros = [
    { key: 'protein', label: 'Protein', now: app.proteinToday, goal: app.proteinGoal, color: 'var(--series-1)' },
    { key: 'carbs', label: 'Carbs', now: app.carbsToday, goal: app.carbsGoal, color: 'var(--series-3)' },
    { key: 'fat', label: 'Fat', now: app.fatToday, goal: app.fatGoal, color: 'var(--series-2)' },
  ];
  const saveBudget = () => app.set({ weeklyBudget: Math.max(0, Number(budget) || 0) });
  /** Your data, as the JSON it is stored as — yours to keep or move. */
  const exportData = () => {
    const blob = new Blob([app.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forq-${app.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setDataStatus(result.ok ? 'Backup restored.' : result.error);
  };
  return (
    <div className="pb-6 space-y-6">
<div className="hero-gradient px-5 pt-2 pb-2">
        <div className="flex items-center gap-4 rise">
          <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-extrabold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }} aria-hidden="true">
            {app.name[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            <h3 className="text-[1.375rem] font-extrabold tracking-tight">{app.name}</h3>
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Level {app.level.level} · {app.level.title} · {app.xp.toLocaleString()} XP
            </p>
            <div className="mt-1.5"><Meter value={app.level.into} max={app.level.into + app.level.need} height={5} /></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5 rise rise-1">
          {[
            [Flame, app.streak, 'day cook streak'],
            [NotebookPen, app.stats.loggedDays, 'days logged'],
            [Banknote, app.stats.budgetWeeks, 'weeks on budget'],
          ].map(([Icon, v, label]) => (
            <Card key={label} className="!p-3 text-center">
              <p className="text-[1.0625rem] font-extrabold inline-flex items-center gap-1.5">
                <Icon size={15} style={{ color: 'var(--muted)' }} /> {v}
              </p>
              <p className="text-[0.65625rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{label}</p>
            </Card>
          ))}
        </div>
      </div>
      <YouthNotice />
<Section title="Goals & targets" className="rise rise-1">
        <Card onClick={() => setGoalsOpen(true)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold text-[0.9375rem] truncate">{app.goalSummary}</p>
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {app.targets.kcal.toLocaleString()} kcal · {app.targets.protein}g P · {app.targets.carbs}g C · {app.targets.fat}g F
                {app.targetMode === 'custom' && ' · custom'}
              </p>
            </div>
            <Target size={18} className="shrink-0" style={{ color: 'var(--muted)' }} />
          </div>
          {/* A week measured against a weekly allowance is the compensation
              loop; under 18 the card says what the app does instead. */}
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
            {app.youth.weeklyCompensation ? (
              <>
                <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                  <span>This week</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {app.week.eaten.toLocaleString()} / {app.weeklyKcalTarget.toLocaleString()} kcal
                  </span>
                </div>
                <Meter value={app.week.eaten} max={app.weeklyKcalTarget} color={app.week.onTrack ? 'var(--accent)' : 'var(--warn)'} height={5} />
              </>
            ) : (
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {YOUTH_COPY.weekly}
              </p>
            )}
          </div>
        </Card>
      </Section>
<Section title="Household" className="rise rise-1" hidden={!app.moduleOn('household')}>
        <Card onClick={() => setFamilyOpen(true)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold text-[0.9375rem] truncate">
                {app.members.length
                  ? `${app.members.length} ${app.members.length === 1 ? 'person' : 'people'} · ${app.portions} portions a meal`
                  : 'Just you'}
              </p>
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {app.planDiets.length
                  ? `Plans avoid ${app.planDiets.join(', ')}`
                  : 'Profiles, permissions, shared lists and chores'}
              </p>
            </div>
            <Users size={18} className="shrink-0" style={{ color: 'var(--muted)' }} />
          </div>
        </Card>
      </Section>
<Section title="Guidance & you" className="rise rise-1">
        <div className="grid gap-2.5">
          <Card onClick={openGuidance}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-[0.90625rem]">Guidance</p>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  One next step, with trends, reports and tools behind it
                </p>
              </div>
              <Sparkles size={18} className="shrink-0" style={{ color: 'var(--muted)' }} />
            </div>
          </Card>
          <Card onClick={() => setPrefsOpen(true)}>
            <SlidersHorizontal size={17} style={{ color: 'var(--muted)' }} />
            <p className="mt-1.5 font-extrabold text-[0.90625rem]">Preferences</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.prefsSummary}
            </p>
          </Card>
        </div>
      </Section>
<Section title="Health & training" className="rise rise-1" hidden={!app.moduleOn('health')}>
        <div className="grid grid-cols-2 gap-2.5">
          <Card onClick={() => setHealthOpen(true)}>
            <HeartPulse size={17} style={{ color: 'var(--muted)' }} />
            <p className="mt-1.5 font-extrabold text-[0.90625rem]">Health</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.body_.readings.weight
                ? `${app.body_.readings.weight.value} kg${app.body_.bmi ? ` · BMI ${app.body_.bmi.value}` : ''}`
                : `Weight, vitals, sleep${app.trackCycle ? ', cycle' : ''}`}
            </p>
          </Card>
          <Card onClick={() => setExerciseOpen(true)}>
            <Dumbbell size={17} style={{ color: 'var(--muted)' }} />
            <p className="mt-1.5 font-extrabold text-[0.90625rem]">Exercise</p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.training.sessions
                ? `${app.training.sessions} session${app.training.sessions === 1 ? '' : 's'} · ${app.training.minutes} min`
                : 'Log a workout or import one'}
            </p>
          </Card>
        </div>
        <Card className="mt-2.5" onClick={() => setRemindersOpen(true)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold text-[0.90625rem]">Reminders</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {app.reminders.length
                  ? `${app.reminders.filter((r) => r.on).length} on, of ${app.reminders.length}`
                  : 'Meals, water, supplements, shopping, weigh-ins'}
              </p>
            </div>
            {app.remindersDue.length > 0 && <Pill tone="accent">{app.remindersDue.length} due</Pill>}
            <Bell size={18} className="shrink-0" style={{ color: 'var(--muted)' }} />
          </div>
        </Card>
      </Section>
<Section title="Nutrition today" className="rise rise-1" hidden={!app.moduleOn('nutrition')}>
        <Card>
          <div className="flex items-center gap-5">
            <Ring value={app.kcalToday} max={app.kcalGoal} size={92} stroke={9} color="var(--series-2)"
              label={app.kcalToday.toLocaleString()} sub={`of ${app.kcalGoal.toLocaleString()} kcal`} />
            <div className="flex-1 space-y-2.5">
              {macros.map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-[0.75rem] font-bold mb-1">
                    <span>{m.label}</span>
                    <span style={{ color: 'var(--muted)' }}>
                      {formatAmount(m.key, m.now)} / {formatAmount(m.key, m.goal)}
                    </span>
                  </div>
                  <Meter value={m.now} max={m.goal} color={m.color} height={5} />
                </div>
              ))}
            </div>
          </div>
          {app.entries.length > 0 ? (
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--line)' }}>
              {highlights.map((row) => (
                <Pill key={row.key} tone={row.tone === 'faint' ? 'muted' : row.tone}>
                  {row.label} {formatAmount(row.key, row.value)}
                </Pill>
              ))}
              <Pill tone={snacks.count > 3 ? 'warn' : 'muted'}>{snacks.count} snacks</Pill>
              {timing && <Pill tone="muted">{timing.first}–{timing.last}</Pill>}
            </div>
          ) : (
            <p className="mt-3 pt-3 border-t text-[0.78125rem] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
              Nothing logged today yet.
            </p>
          )}
          <button
            onClick={() => setNutritionOpen(true)}
            className="press mt-3 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Activity size={14} /> Vitamins, minerals & the rest
            </span>
          </button>
        </Card>
      </Section>
<Section title="This week" className="rise rise-2">
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Calories per day</p>
          {loggedThisWeek ? (
            <>
              <Bars data={week} color="var(--series-2)" format={(v) => v.toLocaleString()} />
              <p className="mt-3 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Averaging {Math.round(week.reduce((s, d) => s + d.value, 0) / week.filter((d) => d.value).length).toLocaleString()} kcal
                on the {week.filter((d) => d.value).length} day{week.filter((d) => d.value).length === 1 ? '' : 's'} you logged.
              </p>
            </>
          ) : (
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Log a day of food and it appears here.
            </p>
          )}
        </Card>
      </Section>
<Section title="Spending" className="rise rise-2" hidden={!app.moduleOn('waste')}>
        <Card className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <NumberField label="Weekly budget" value={budget} onChange={setBudget} suffix="£" step={5} />
            </div>
            <button
              onClick={saveBudget}
              className="press rounded-2xl px-4 py-3 text-[0.8125rem] font-extrabold"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              Save
            </button>
          </div>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {gbp(app.spentThisWeek, { always: true })} recorded this week across {app.shops.length} shop{app.shops.length === 1 ? '' : 's'}.
          </p>
        </Card>
        {hasSpend && (
          <Card className="mt-3">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--faint)' }}>Monthly grocery spend</p>
            <Bars data={spend.map((m) => ({ label: m.label, value: m.spend }))} color="var(--series-1)" format={(v) => `£${Math.round(v)}`} />
          </Card>
        )}
      </Section>
{cuisines.length > 0 && (
        <Section title="What you cook" className="rise rise-3" hidden={!app.moduleOn('recipes')}>
          <Card>
            <div className="space-y-2.5">
              {cuisines.map((c, i) => (
                <div key={c.name}>
                  <div className="flex justify-between text-[0.78125rem] font-bold mb-1">
                    <span>{c.name}</span>
                    <span style={{ color: 'var(--muted)' }}>{c.count} · {c.pct}%</span>
                  </div>
                  <Meter value={c.pct} max={cuisines[0].pct} color={i === 0 ? 'var(--series-1)' : 'color-mix(in srgb, var(--series-1) 45%, var(--card-2))'} height={5} />
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}
<Section title="Achievements" className="rise rise-3" hidden={!app.moduleOn('progress')}>
        <Card onClick={() => setQuestsOpen(true)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold text-[0.9375rem] truncate">
                Level {app.level.level} · {app.level.title}
              </p>
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {app.xp.toLocaleString()} XP · {badges.filter((b) => b.earned).length} of {badges.length} badges ·
                {' '}{app.game.daily.filter((g) => g.done).length}/{app.game.daily.length} goals today
              </p>
            </div>
            <Trophy size={18} className="shrink-0" style={{ color: 'var(--muted)' }} />
          </div>
          <div className="mt-3"><Meter value={app.level.into} max={app.level.into + app.level.need} /></div>
        </Card>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {badges.filter((b) => b.earned).slice(0, 4).map((b) => (
            <Card key={b.id} className="!p-3 text-center">
              <Glyph e={b.emoji} size={20} style={{ color: 'var(--ink)' }} />
              <p className="mt-1 text-[0.65625rem] font-bold leading-tight">{b.name}</p>
            </Card>
          ))}
          {badges.filter((b) => b.earned).length === 0 && (
            <p className="col-span-4 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              No badges yet — every one is earned from what you actually do.
            </p>
          )}
        </div>
      </Section>
<Section title="Appearance" className="rise rise-4">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[0.875rem]">Dark mode</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Follows your accent everywhere</p>
            </div>
            <Toggle label="Dark mode" on={app.theme === 'dark'} onChange={app.toggleTheme} />
          </div>
          <div>
            <p className="font-bold text-[0.875rem] mb-2">Accent colour</p>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map(([id, hex]) => (
                <button
                  key={id}
                  onClick={() => app.setAccent(id)}
                  aria-label={`${id} accent`}
                  aria-pressed={app.accent === id}
                  className="tap press h-9 w-9 rounded-full border-4"
                  style={{ background: hex, borderColor: app.accent === id ? 'var(--ink)' : 'transparent' }}
                />
              ))}
              {ACCENT_UNLOCKS.map(({ id, level }) => {
                const open = app.game.accents.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => open && app.setAccent(id)}
                    aria-label={open ? id : `${id} — unlocks at level ${level}`}
                    disabled={!open}
                    className="tap press relative h-9 w-9 rounded-full border-4 flex items-center justify-center"
                    style={{
                      background: UNLOCK_COLOURS[id],
                      borderColor: app.accent === id ? 'var(--ink)' : 'transparent',
                      opacity: open ? 1 : 0.35,
                    }}
                  >
                    {!open && <Lock size={12} color="#fff" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Three more arrive at levels 4, 8 and 12. The five you started with never go away.
            </p>
          </div>
        </Card>
      </Section>
      <BackendPanel />
<Section title="Your data" className="rise rise-4">
        <Card className="space-y-3">
          <p className="text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            Browser storage is not encrypted. Anyone with access to this browser profile can
            access it. Export a backup before clearing site data or changing devices.
          </p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your local copy contains {Object.keys(app.log).length} logged day{Object.keys(app.log).length === 1 ? '' : 's'},
            {' '}{app.pantry.length} pantry item{app.pantry.length === 1 ? '' : 's'}, {app.shops.length} recorded shop{app.shops.length === 1 ? '' : 's'},
            {' '}{app.cooked.length} meal{app.cooked.length === 1 ? '' : 's'} cooked.
          </p>
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="press w-full rounded-2xl border px-4 py-3 text-left text-[0.84375rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Privacy, storage &amp; deletion
          </button>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={exportData}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Download size={15} /> Export</span>
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Upload size={15} /> Restore</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={importData}
              className="hidden"
              aria-label="Restore Forq backup"
            />
            <button
              onClick={() => (confirmReset ? app.reset() : setConfirmReset(true))}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: confirmReset ? 'var(--danger)' : 'var(--line)', color: confirmReset ? 'var(--danger)' : 'var(--ink)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={15} /> {confirmReset ? 'Tap to confirm' : 'Reset app'}
              </span>
            </button>
          </div>
          {dataStatus && (
            <p role="status" className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {dataStatus}
            </p>
          )}
        </Card>
      </Section>
      <Sheet open={nutritionOpen} onClose={() => setNutritionOpen(false)} title="Nutrition today">
        <NutritionPanel />
      </Sheet>
      <Sheet open={goalsOpen} onClose={() => setGoalsOpen(false)} title="Goals & targets">
        <GoalsPanel />
      </Sheet>
      <Sheet open={familyOpen} onClose={() => setFamilyOpen(false)} title="Family">
        <FamilyPanel />
      </Sheet>
      <Sheet open={questsOpen} onClose={() => setQuestsOpen(false)} title="Progress">
        <QuestsPanel />
      </Sheet>
      <Sheet open={healthOpen} onClose={() => setHealthOpen(false)} title="Health">
        <HealthPanel />
      </Sheet>
      <Sheet open={prefsOpen} onClose={() => setPrefsOpen(false)} title="Preferences">
        <PreferencesPanel />
      </Sheet>
      <Sheet open={remindersOpen} onClose={() => setRemindersOpen(false)} title="Reminders">
        <RemindersPanel />
      </Sheet>
      <Sheet open={exerciseOpen} onClose={() => setExerciseOpen(false)} title="Exercise">
        <ExercisePanel />
      </Sheet>
      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & data">
        <PrivacyPanel />
      </Sheet>
    </div>
  );
}
