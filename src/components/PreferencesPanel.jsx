import { useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Info, LayoutGrid, Ruler, ShieldAlert, Utensils } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  ALLERGENS, CUISINES, INTOLERANCES, MATCH_CAVEAT, RELIGIOUS_DIETS, SKILL_LEVELS,
  TIME_BUDGETS, UNIT_CHOICES, WIDGETS,
} from '../data/preferences.js';
import { DIET_PATTERNS } from '../data/goals.js';
import { Card, Chip, Meter, Pill, Toggle } from './ui.jsx';
import ModesView from './ModesPanel.jsx';

const VIEWS = [
  ['focus', 'Focus', Compass],
  ['safety', 'Can’t eat', ShieldAlert],
  ['taste', 'Taste', Utensils],
  ['units', 'Units', Ruler],
  ['home', 'Home', LayoutGrid],
];

const Caveat = () => (
  <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
    <Info size={13} className="mt-0.5 shrink-0" /> {MATCH_CAVEAT}
  </p>
);

/* ---------- Hard lines ---------- */

function SafetyView() {
  const app = useApp();
  const { total, left, removed, pct } = app.recipeReach;

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What this leaves you</p>
        <p className="mt-0.5 text-[1.375rem] font-extrabold">
          {left.toLocaleString()} <span className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>of {total.toLocaleString()} dishes</span>
        </p>
        <div className="mt-2"><Meter value={left} max={total || 1} /></div>
        <p className="mt-1.5 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {removed === 0
            ? 'Nothing is being filtered out. Add an allergen below and the book shrinks immediately.'
            : `${removed.toLocaleString()} removed — ${pct}% of the book is still on the table.`}
        </p>
      </Card>

      <Card className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-bold text-[0.875rem]">Allergies</p>
          {app.allergies.length > 0 && <Pill tone="danger">{app.allergies.length} set</Pill>}
        </div>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          A recipe naming one of these is <strong>never offered</strong> — not ranked down, not shown
          with a warning. The fourteen below are the ones UK labelling law makes declarable.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((a) => (
            <Chip key={a.id} active={app.allergies.includes(a.id)} onClick={() => app.toggleAllergy(a.id)}>{a.label}</Chip>
          ))}
        </div>
        {app.allergies.length > 0 && (
          <div className="rounded-2xl p-3" style={{ background: 'var(--card-2)' }}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--faint)' }}>Where these hide</p>
            {app.allergies.map((id) => {
              const found = ALLERGENS.find((a) => a.id === id);
              if (!found?.also?.length) return null;
              return (
                <p key={id} className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                  <span className="font-bold">{found.label}:</span> {found.also.join(', ')}
                </p>
              );
            })}
          </div>
        )}
        <Caveat />
      </Card>

      <Card className="space-y-2.5">
        <p className="font-bold text-[0.875rem]">Religious & cultural</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Treated as a hard line, like an allergy. Forq matches ingredient words — it doesn’t
          certify anything, and no app can.
        </p>
        <div className="flex flex-wrap gap-2">
          {RELIGIOUS_DIETS.map((r) => (
            <Chip key={r.id} active={app.religious.includes(r.id)} onClick={() => app.toggleReligious(r.id)}>{r.label}</Chip>
          ))}
        </div>
      </Card>

      <Card className="space-y-2.5">
        <p className="font-bold text-[0.875rem]">Intolerances</p>
        <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          These <strong>flag</strong> rather than remove. The amount is the point, and only you know
          your threshold — so the recipe stays and tells you what’s in it.
        </p>
        <div className="flex flex-wrap gap-2">
          {INTOLERANCES.map((i) => (
            <Chip key={i.id} active={app.intolerances.includes(i.id)} onClick={() => app.toggleIntolerance(i.id)}>{i.label}</Chip>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------- Taste and circumstance ---------- */

function TasteView() {
  const app = useApp();
  return (
    <>
      <Card className="space-y-2.5">
        <p className="font-bold text-[0.875rem]">How you eat</p>
        <div className="flex flex-wrap gap-2">
          {DIET_PATTERNS.map((d) => (
            <Chip key={d.id} active={app.diets.includes(d.id)} onClick={() => app.toggleDiet(d.id)}>{d.label}</Chip>
          ))}
        </div>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          These shape your macro split as well as the recipes, which is why they live with your goals too.
        </p>
      </Card>

      <Card className="space-y-2.5">
        <p className="font-bold text-[0.875rem]">Cuisines you like</p>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <Chip key={c} active={app.cuisines.includes(c)} onClick={() => app.toggleCuisine(c)}>{c}</Chip>
          ))}
        </div>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          A preference, not a filter — these come first, nothing else disappears.
        </p>
      </Card>

      <Card className="space-y-2.5">
        <p className="font-bold text-[0.875rem]">How much cooking do you fancy?</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {SKILL_LEVELS.map((s) => (
            <Chip key={s.id} active={app.skill === s.id} onClick={() => app.setSkill(s.id)}>{s.label}</Chip>
          ))}
        </div>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {SKILL_LEVELS.find((s) => s.id === app.skill)?.blurb}.
        </p>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide pt-1" style={{ color: 'var(--faint)' }}>Time you usually have</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TIME_BUDGETS.map((t) => (
            <Chip key={t.id} active={app.timeBudget === t.id} onClick={() => app.setTimeBudget(t.id)}>{t.label}</Chip>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------- Units ---------- */

function UnitsView() {
  const app = useApp();
  const example = {
    weight: app.body?.weightKg || 82,
    height: app.body?.heightCm || 178,
    energy: app.targets?.kcal || 2200,
    volume: 250,
    clock: '13:05',
  };
  const shown = {
    weight: app.fmt.weight(example.weight),
    height: app.fmt.height(example.height),
    energy: app.fmt.energy(example.energy),
    volume: app.fmt.volume(example.volume),
    clock: app.fmt.time(example.clock),
  };

  return (
    <>
      {UNIT_CHOICES.map((choice) => (
        <Card key={choice.key} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-[0.875rem]">{choice.label}</p>
            <p className="text-[0.8125rem] font-extrabold">{shown[choice.key]}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {choice.options.map(([id, label]) => (
              <Chip key={id} active={app.fmt.units[choice.key] === id} onClick={() => app.setUnit(choice.key, id)}>{label}</Chip>
            ))}
          </div>
        </Card>
      ))}
      <p className="text-[0.75rem] font-semibold px-1" style={{ color: 'var(--muted)' }}>
        Only the display changes. Everything is stored and calculated in kg, cm, kcal and ml —
        a unit preference that reached the maths would compound into a real error over months.
      </p>
    </>
  );
}

/* ---------- Home layout ---------- */

function HomeView() {
  const app = useApp();
  const [dragging, setDragging] = useState(null);
  const order = app.homeWidgets;
  const off = WIDGETS.filter((w) => !order.includes(w.id));

  return (
    <>
      <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
        {order.map((id, i) => {
          const widget = WIDGETS.find((w) => w.id === id);
          if (!widget) return null;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragging(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging) app.moveWidgetTo(dragging, id);
                setDragging(null);
              }}
              className="flex items-center gap-2 p-3 cursor-grab"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[0.84375rem]">{widget.label}</p>
                {widget.fixed && <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--faint)' }}>Always shown</p>}
              </div>
              <button onClick={() => app.moveWidget(id, -1)} disabled={i === 0} aria-label={`Move ${widget.label} up`} className="press p-1 disabled:opacity-25" style={{ color: 'var(--muted)' }}>
                <ChevronUp size={16} />
              </button>
              <button onClick={() => app.moveWidget(id, 1)} disabled={i === order.length - 1} aria-label={`Move ${widget.label} down`} className="press p-1 disabled:opacity-25" style={{ color: 'var(--muted)' }}>
                <ChevronDown size={16} />
              </button>
              <Toggle label={`Show ${widget.label}`} on onChange={() => app.toggleWidget(id)} />
            </div>
          );
        })}
      </Card>

      {off.length > 0 && (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {off.map((widget) => (
            <div key={widget.id} className="flex items-center gap-3 p-3">
              <p className="min-w-0 flex-1 font-bold text-[0.84375rem]" style={{ color: 'var(--muted)' }}>{widget.label}</p>
              <Toggle label={`Show ${widget.label}`} on={false} onChange={() => app.toggleWidget(widget.id)} />
            </div>
          ))}
        </Card>
      )}

      <button
        onClick={app.resetWidgets}
        className="press w-full rounded-2xl border py-2.5 text-[0.8125rem] font-extrabold"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        Back to the default layout
      </button>
      <p className="text-[0.75rem] font-semibold px-1" style={{ color: 'var(--muted)' }}>
        Hiding a card hides a panel — it never changes a number. Everything you turn off is still
        counted, and still there on its own tab.
      </p>
    </>
  );
}

/**
 * Personalisation: the lines you can't cross, the ones you'd rather not, and
 * how you want numbers written.
 *
 * The split down the middle of this page is deliberate. Allergies and observed
 * rules remove food. Tastes and time reorder it. Conflating the two is how an
 * app ends up gently suggesting you eat a peanut.
 */
export default function PreferencesPanel() {
  const [view, setView] = useState('safety');
  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {VIEWS.map(([key, label, Icon]) => (
          <Chip key={key} active={view === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>
      {view === 'focus' && <ModesView />}
      {view === 'safety' && <SafetyView />}
      {view === 'taste' && <TasteView />}
      {view === 'units' && <UnitsView />}
      {view === 'home' && <HomeView />}
    </div>
  );
}
