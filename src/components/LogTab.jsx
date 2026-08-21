import { useEffect, useState } from 'react';
import {
  Activity, Camera, Clock, Cookie, Droplet, Layers, Mic, Plus, ScanBarcode, ScanText, Search, Utensils,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { YOUTH_COPY } from '../lib/youth.js';
import { prettyDate } from '../lib/utils.js';
import {
  MEALS, alcoholUnits, byTime, entryNumbers, mealForTime, mealLabel, nutrientAlerts,
  nutrientRows, remaining, snackSummary, sumMacros, timingInsight,
} from '../lib/nutrition.js';
import { formatAmount } from '../data/nutrients.js';
import { Card, Meter, Pill, Ring, Section, Sheet } from './ui.jsx';
import WaterGlasses from './WaterGlasses.jsx';
import PrimaryAction from './PrimaryAction.jsx';
import { Glyph } from './icons.jsx';
import AddFood from './AddFood.jsx';
import FoodDetail from './FoodDetail.jsx';
import CopyMeal from './CopyMeal.jsx';
import RecipeImport from './RecipeImport.jsx';
import NutritionPanel from './NutritionPanel.jsx';
import { BarcodeScanner, PhotoRecognise, VoiceLog } from './LogCapture.jsx';
import LabelScan from './LabelScan.jsx';

const SHORTCUTS = [
  { id: 'add', label: 'Search', Icon: Search },
  { id: 'barcode', label: 'Barcode', Icon: ScanBarcode },
  { id: 'photo', label: 'Photo', Icon: Camera },
  { id: 'voice', label: 'Voice', Icon: Mic },
  { id: 'label', label: 'Label', Icon: ScanText },
  { id: 'copy', label: 'Copy', Icon: Layers },
];

const SHEET_TITLES = {
  nutrition: 'Nutrition today',
  add: 'Add food',
  barcode: 'Scan a barcode',
  photo: 'Photo recognition',
  voice: 'Voice logging',
  label: 'Read a nutrition label',
  import: 'Import a recipe',
  copy: 'Copy a meal',
};

/** One logged food in the diary. */
const EntryRow = ({ entry, onEdit }) => {
  const m = entryNumbers(entry);
  // The serving label often already states the weight ("1 medium (118 g)") —
  // only spell it out again when it doesn't.
  const weight = entry.grams && !String(entry.servingLabel).includes(String(entry.grams))
    ? ` · ${entry.grams}${entry.unit}`
    : '';
  return (
    <button onClick={onEdit} className="press flex w-full items-center gap-3 p-3 text-left" style={{ borderColor: 'var(--line)' }}>
      <Glyph e={entry.emoji} size={19} style={{ color: 'var(--muted)' }} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[0.875rem] truncate">{entry.name}</span>
        <span className="block text-[0.71875rem] font-semibold truncate" style={{ color: 'var(--muted)' }}>
          {entry.servingLabel}{weight} · {entry.time}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block font-extrabold text-[0.875rem]">{m.kcal}</span>
        <span className="block text-[0.625rem] font-bold uppercase" style={{ color: 'var(--faint)' }}>kcal</span>
      </span>
    </button>
  );
};

export default function LogTab({ initialSheet = null, onIntentUsed }) {
  const app = useApp();
  const initialSheetId = typeof initialSheet === 'string' ? initialSheet : initialSheet?.sheet;
  const [sheet, setSheet] = useState(initialSheetId);
  const [initialQuery, setInitialQuery] = useState(typeof initialSheet === 'object' ? initialSheet?.query || '' : '');
  const [activeMeal, setActiveMeal] = useState(mealForTime());
  const [picked, setPicked] = useState(null); // catalogue food awaiting a portion
  const [editing, setEditing] = useState(null); // entry being adjusted
  const [copyMode, setCopyMode] = useState('previous'); // which half of the copy sheet

  // Arriving from a Home shortcut opens that capture flow straight away.
  useEffect(() => {
    if (!initialSheet) return;
    setSheet(typeof initialSheet === 'string' ? initialSheet : initialSheet.sheet);
    setInitialQuery(typeof initialSheet === 'object' ? initialSheet.query || '' : '');
    setActiveMeal(mealForTime());
    onIntentUsed?.();
  }, [initialSheet, onIntentUsed]);

  const entries = app.entries;
  const totals = app.totals;
  const left = remaining(totals, app);
  const snacks = snackSummary(entries);
  const timing = timingInsight(entries);
  const alerts = nutrientAlerts(totals, app.targets);
  const micro = nutrientRows(totals, app.targets)
    .filter((r) => ['fibre', 'sugar', 'satFat', 'sodium'].includes(r.key));

  const open = (id, meal) => {
    setActiveMeal(meal || mealForTime());
    setSheet(id);
  };

  const closeAll = () => {
    setSheet(null);
    setPicked(null);
    setEditing(null);
    setInitialQuery('');
  };

  const macros = [
    { key: 'protein', label: 'Protein', now: totals.protein, goal: app.proteinGoal, color: 'var(--series-1)' },
    { key: 'carbs', label: 'Carbs', now: totals.carbs, goal: app.carbsGoal, color: 'var(--series-3)' },
    { key: 'fat', label: 'Fat', now: totals.fat, goal: app.fatGoal, color: 'var(--series-2)' },
  ];

  return (
    <div className="pb-6 space-y-6">
      {/* Header + day totals */}
      <div className="hero-gradient px-5 pt-1 pb-2">
        <p className="text-[0.8125rem] font-semibold rise" style={{ color: 'var(--muted)' }}>{prettyDate()}</p>

        <Card className="mt-4 rise rise-1">
          <div className="flex items-center gap-5">
            <Ring
              value={totals.kcal}
              max={app.kcalGoal}
              size={92}
              stroke={9}
              color="var(--series-2)"
              label={totals.kcal.toLocaleString()}
              sub={`of ${app.kcalGoal.toLocaleString()}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
                Calories remaining
              </p>
              <p className="mt-1 text-[1.5rem] font-extrabold leading-none" style={{ color: left.kcal >= 0 ? 'var(--ink)' : 'var(--warn)' }}>
                {left.kcal >= 0 ? left.kcal.toLocaleString() : `${Math.abs(left.kcal).toLocaleString()} over`}
              </p>
              <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                {left.protein > 0 ? `${left.protein}g protein to go` : 'Protein target reached'}
              </p>
            </div>
          </div>
          <details className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <summary className="tap press cursor-pointer text-[0.8125rem] font-extrabold" style={{ color: 'var(--muted)' }}>
              Macros, nutrients and weekly progress
            </summary>
            <div className="mt-3 space-y-2.5">
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
          <p className="mt-3 pt-3 border-t text-[0.78125rem] font-bold" style={{ borderColor: 'var(--line)', color: left.kcal >= 0 ? 'var(--good)' : 'var(--warn)' }}>
            {left.kcal >= 0
              ? `${left.kcal.toLocaleString()} kcal left today · ${left.protein}g protein to go`
              : `${Math.abs(left.kcal).toLocaleString()} kcal over your goal`}
          </p>

          {/* Beyond the macros — the rest of what today added up to */}
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5" style={{ borderColor: 'var(--line)' }}>
            {micro.map((row) => (
              <Pill key={row.key} tone={row.tone === 'faint' ? 'muted' : row.tone}>
                {row.label} {formatAmount(row.key, row.value)}
              </Pill>
            ))}
          </div>
          {/* The week as a budget, not seven separate days */}
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
            <div className="flex justify-between text-[0.75rem] font-bold mb-1">
              <span>This week · {app.goalSummary}</span>
              <span style={{ color: 'var(--muted)' }}>
                {app.week.eaten.toLocaleString()} / {app.weeklyKcalTarget.toLocaleString()} kcal
              </span>
            </div>
            <Meter value={app.week.eaten} max={app.weeklyKcalTarget} color={app.week.onTrack ? 'var(--accent)' : 'var(--warn)'} height={5} />
            <p className="mt-1.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.week.left >= 0
                ? `${app.week.left.toLocaleString()} kcal left this week · about ${app.week.perDayLeft.toLocaleString()} a day`
                : `${Math.abs(app.week.left).toLocaleString()} kcal over for the week so far`}
            </p>
          </div>

          <button
            onClick={() => setSheet('nutrition')}
            className="press mt-3 w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Activity size={14} /> All 24 nutrients{alerts.over.length ? ` · ${alerts.over.length} over limit` : ''}
            </span>
          </button>
          </details>
        </Card>
      </div>

      {/* Capture shortcuts */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 rise rise-1">
        {SHORTCUTS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => open(id)}
            className="press shrink-0 inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-3 text-[0.78125rem] font-bold"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Meals */}
      {MEALS.map((m, i) => {
        const meal = entries.filter((e) => e.meal === m.key).sort(byTime);
        const sub = sumMacros(meal);
        return (
          <Section key={m.key} className={`rise rise-${Math.min(4, i + 1)}`}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[0.9375rem] font-bold tracking-tight">
                {m.label}
                <span className="ml-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  {sub.kcal} kcal
                </span>
              </h2>
              <button onClick={() => open('add', m.key)} className="tap press text-[0.8125rem] font-semibold" style={{ color: 'var(--accent)' }}>
                + Add food
              </button>
            </div>
            <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
              {meal.length === 0 ? (
                <button
                  onClick={() => open('add', m.key)}
                  className="press flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: 'var(--card-2)', color: 'var(--faint)' }}>
                    <Plus size={18} />
                  </span>
                  <span className="text-[0.84375rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    Nothing logged — search, scan, snap or say it
                  </span>
                </button>
              ) : (
                meal.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)} />
                ))
              )}
            </Card>
            {meal.length > 0 && (
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => { setCopyMode('previous'); open('copy', m.key); }}
                  className="press text-[0.75rem] font-bold"
                  style={{ color: 'var(--muted)' }}
                >
                  Copy an earlier {m.key === 'snack' ? 'snack' : m.label.toLowerCase()}
                </button>
                <button
                  onClick={() => { setCopyMode('templates'); open('copy', m.key); }}
                  className="press text-[0.75rem] font-bold"
                  style={{ color: 'var(--muted)' }}
                >
                  Save as template
                </button>
              </div>
            )}
          </Section>
        );
      })}

      {/* Snacks + timing insight */}
      <div className="type-responsive-pair px-5 grid gap-3 rise rise-4">
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
            <Cookie size={12} /> Snacking
          </p>
          <p className="mt-1.5 text-[1.375rem] font-extrabold leading-none">{snacks.count}</p>
          <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
            snacks · {snacks.kcal} kcal
          </p>
          <div className="mt-2"><Meter value={snacks.pctOfDay} max={100} height={5} /></div>
          <p className="mt-1.5 text-[0.6875rem] font-bold" style={{ color: 'var(--muted)' }}>
            {snacks.pctOfDay}% of today’s calories
          </p>
        </Card>
        <Card>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
            <Clock size={12} /> Meal timing
          </p>
          {timing ? (
            <>
              <p className="mt-1.5 text-[1.375rem] font-extrabold leading-none">{timing.windowLabel}</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                eating window · {timing.first}–{timing.last}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={timing.latePct > 30 ? 'warn' : 'muted'}>{timing.latePct}% after 8pm</Pill>
                {timing.longestGapMins >= 300 && (
                  <Pill tone="muted">{Math.round(timing.longestGapMins / 60)}h longest gap</Pill>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Log something and your eating window appears here.
            </p>
          )}
        </Card>
      </div>

      {/* Water, caffeine, alcohol */}
      <Section className="rise rise-4">
        <Card>
          <div className="flex items-baseline justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
              <Droplet size={12} /> Water
            </p>
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {app.hydration.total.toLocaleString()} / {app.targets.water.toLocaleString()} ml
            </p>
          </div>
          <div className="mt-2.5"><WaterGlasses /></div>
          <button
            onClick={() => app.addWaterMl(500)}
            className="tap press mt-2 rounded-full border px-3 py-3 text-[0.71875rem] font-extrabold"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            +500 ml
          </button>
          <div className="mt-2.5"><Meter value={app.hydration.total} max={app.targets.water} height={5} /></div>
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5" style={{ borderColor: 'var(--line)' }}>
            <Pill tone={totals.caffeine > app.targets.caffeine ? 'danger' : 'muted'}>
              Caffeine {formatAmount('caffeine', totals.caffeine)} of {formatAmount('caffeine', app.targets.caffeine)}
            </Pill>
            {app.youth.alcohol && (
              <Pill tone={totals.alcohol > app.targets.alcohol ? 'warn' : 'muted'}>
                Alcohol {alcoholUnits(totals.alcohol)} units
              </Pill>
            )}
            <Pill tone="muted">{app.hydration.fromDrinks.toLocaleString()} ml from food & drink</Pill>
          </div>
          {app.youth.on && (
            <p className="mt-2 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {YOUTH_COPY.caffeine}
            </p>
          )}
        </Card>
      </Section>

      <Section className="rise rise-4">
        <button
          onClick={() => open('import')}
          className="press w-full flex items-center gap-3 rounded-2xl border p-4 text-left"
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
        >
          <Utensils size={18} style={{ color: 'var(--muted)' }} />
          <span className="flex-1">
            <span className="block font-bold text-[0.875rem]">Import a recipe</span>
            <span className="block text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Paste a recipe or a link and log a serving with its nutrition worked out.
            </span>
          </span>
        </button>
      </Section>

      {/* ---------- Sheets ---------- */}
      <Sheet open={!!sheet && !picked} onClose={closeAll} title={SHEET_TITLES[sheet] || 'Add food'}>
        {sheet === 'add' && (
          <AddFood initialQuery={initialQuery} defaultMeal={activeMeal} onPick={setPicked} onCapture={(id) => setSheet(id)} />
        )}
        {sheet === 'barcode' && (
          <BarcodeScanner
            defaultMeal={mealLabel(activeMeal).toLowerCase()}
            onPick={setPicked}
            onCreateCustom={() => setSheet('add')}
          />
        )}
        {sheet === 'photo' && <PhotoRecognise defaultMeal={activeMeal} onDone={closeAll} />}
        {sheet === 'voice' && <VoiceLog defaultMeal={activeMeal} onDone={closeAll} />}
        {sheet === 'label' && <LabelScan onDone={() => setSheet('add')} />}
        {sheet === 'import' && <RecipeImport defaultMeal={activeMeal} onDone={closeAll} />}
        {sheet === 'copy' && <CopyMeal defaultMeal={activeMeal} initialMode={copyMode} onDone={closeAll} />}
        {sheet === 'nutrition' && <NutritionPanel />}
      </Sheet>

      {/* Portion + timing for a newly picked food */}
      <Sheet open={!!picked} onClose={() => setPicked(null)} title="How much?">
        {picked && (
          <FoodDetail
            food={picked}
            defaultMeal={activeMeal}
            onSave={({ grams, meal, time, servingLabel, nutrients }) => {
              app.logEntry({
                ...(nutrients ? { nutrients } : {}),
                id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                foodId: picked.id,
                name: picked.name,
                brand: picked.brand || null,
                emoji: picked.emoji,
                unit: picked.unit || 'g',
                grams,
                servingLabel,
                per100: picked.per100,
                meal,
                time,
                source: picked.source === 'restaurant' ? 'restaurant' : 'search',
              });
              closeAll();
            }}
          />
        )}
      </Sheet>

      {/* Adjust something already logged */}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Adjust portion">
        {editing && (
          <FoodDetail
            entry={editing}
            food={app.catalogue.find((f) => f.id === editing.foodId) || null}
            onSave={(patch) => { app.updateEntry(editing.id, patch); setEditing(null); }}
            onDelete={() => { app.removeEntry(editing.id); setEditing(null); }}
          />
        )}
      </Sheet>

      {/* The diary exists to have food put in it. */}
      <PrimaryAction label="Add food" onClick={() => open('add')} />
    </div>
  );
}
