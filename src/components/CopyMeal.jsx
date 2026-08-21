import { useMemo, useState } from 'react';
import { Check, Copy, Layers, Trash2 } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { MEALS, mealLabel, sumMacros } from '../lib/nutrition.js';
import { Card, Chip, Pill } from './ui.jsx';
import { Glyph } from './icons.jsx';
import { MealPicker } from './FoodDetail.jsx';

const dayLabel = (stamp, today) => {
  const d = new Date(`${stamp}T12:00:00`);
  const diff = Math.round((new Date(`${today}T12:00:00`) - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
};

/**
 * Two ways to log a meal you have eaten before: copy the exact one you ate on
 * another day, or apply a saved template.
 */
export default function CopyMeal({ defaultMeal, initialMode = 'previous', onDone }) {
  const app = useApp();
  const [mode, setMode] = useState(initialMode);
  const [target, setTarget] = useState(defaultMeal || 'dinner');
  const [day, setDay] = useState(null);
  const [done, setDone] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [saveFrom, setSaveFrom] = useState(defaultMeal || 'dinner');

  const days = useMemo(
    () => Object.keys(app.log).filter((d) => (app.log[d] || []).length).sort().reverse().slice(0, 8),
    [app.log],
  );
  const activeDay = day || days.find((d) => d !== app.day) || days[0];
  const entries = app.log[activeDay] || [];

  const copy = (fromMeal) => {
    app.copyMeal({ fromDate: activeDay, fromMeal, toMeal: target });
    setDone(`${mealLabel(fromMeal)} copied to ${mealLabel(target)}`);
  };

  const todaysMeal = (app.log[app.day] || []).filter((e) => e.meal === saveFrom);

  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2">
        <Chip active={mode === 'previous'} onClick={() => setMode('previous')}>Previous meals</Chip>
        <Chip active={mode === 'templates'} onClick={() => setMode('templates')}>Templates</Chip>
      </div>

      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--faint)' }}>
          Add to which meal today
        </p>
        <MealPicker value={target} onChange={setTarget} />
      </div>

      {done && (
        <p className="text-center"><Pill tone="good"><Check size={11} strokeWidth={3} /> {done}</Pill></p>
      )}

      {mode === 'previous' ? (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {days.map((d) => (
              <Chip key={d} active={activeDay === d} onClick={() => { setDay(d); setDone(''); }}>
                {dayLabel(d, app.day)}
              </Chip>
            ))}
          </div>

          {MEALS.map((m) => {
            const meal = entries.filter((e) => e.meal === m.key);
            if (!meal.length) return null;
            const totals = sumMacros(meal);
            return (
              <Card key={m.key}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-[0.9375rem]">{m.label}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {meal.length} item{meal.length === 1 ? '' : 's'} · {totals.kcal} kcal · {totals.protein}g protein
                    </p>
                  </div>
                  <button
                    onClick={() => copy(m.key)}
                    className="press inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[0.78125rem] font-extrabold"
                    style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {meal.map((e) => (
                    <Pill key={e.id} tone="muted"><Glyph e={e.emoji} size={11} /> {e.name}</Pill>
                  ))}
                </div>
              </Card>
            );
          })}
          {entries.length === 0 && (
            <p className="text-center text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Nothing logged on that day.
            </p>
          )}
        </>
      ) : (
        <>
          {app.mealTemplates.map((t) => {
            const totals = sumMacros(t.entries);
            return (
              <Card key={t.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[0.9375rem] truncate">{t.name}</p>
                    <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                      {mealLabel(t.meal)} · {t.entries.length} items · {totals.kcal} kcal · {totals.protein}g protein
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { app.applyTemplate(t.id, target); setDone(`${t.name} added to ${mealLabel(target)}`); }}
                      className="press inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-[0.78125rem] font-extrabold"
                      style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                    >
                      <Layers size={13} /> Use
                    </button>
                    <button
                      onClick={() => app.deleteTemplate(t.id)}
                      aria-label={`Delete ${t.name}`}
                      className="press p-1.5"
                      style={{ color: 'var(--faint)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {t.entries.map((e) => (
                    <Pill key={e.id} tone="muted"><Glyph e={e.emoji} size={11} /> {e.name}</Pill>
                  ))}
                </div>
              </Card>
            );
          })}
          {app.mealTemplates.length === 0 && (
            <p className="text-center text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              No templates yet — save one from a meal you eat often.
            </p>
          )}

          {/* Save today's meal as a template */}
          <Card className="space-y-3">
            <div>
              <p className="font-extrabold text-[0.9375rem]">Save a meal as a template</p>
              <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Turn what you logged today into a one-tap meal.
              </p>
            </div>
            <MealPicker value={saveFrom} onChange={setSaveFrom} />
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`My ${mealLabel(saveFrom).toLowerCase()}`}
              aria-label="Template name"
              className="w-full rounded-2xl border px-4 py-3 text-[0.875rem] font-semibold outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            />
            <button
              disabled={!todaysMeal.length}
              onClick={() => {
                app.saveTemplate(templateName.trim() || `My ${mealLabel(saveFrom).toLowerCase()}`, saveFrom, todaysMeal);
                setTemplateName('');
                setDone('Template saved');
              }}
              className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              {todaysMeal.length
                ? `Save ${todaysMeal.length} item${todaysMeal.length === 1 ? '' : 's'} from today’s ${mealLabel(saveFrom).toLowerCase()}`
                : `Nothing logged for ${mealLabel(saveFrom).toLowerCase()} today`}
            </button>
          </Card>
        </>
      )}

      <button
        onClick={onDone}
        className="press w-full rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
        style={{ borderColor: 'var(--line)' }}
      >
        Back to the diary
      </button>
    </div>
  );
}
