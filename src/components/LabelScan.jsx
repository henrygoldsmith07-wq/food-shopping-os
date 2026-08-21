import { useMemo, useState } from 'react';
import { Camera, Check, Info, ScanText } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { labelToDraft } from '../lib/label.js';
import { makeCustomFood } from '../lib/foodlog.js';
import { nutrientBy } from '../data/nutrients.js';
import { Card, Pill } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';

const SAMPLE = `Nutrition per 100g
Energy 1046kJ / 250kcal
Fat 12g
of which saturates 5.1g
Carbohydrate 30g
of which sugars 2.4g
Fibre 3.1g
Protein 8.5g
Salt 1.2g`;

/**
 * Reading a nutrition label.
 *
 * The app ships no OCR and no product database beyond its own catalogue, so it
 * doesn't pretend to read the picture: you point the camera at the panel, then
 * type or paste what it says. The parsing is the real part — "of which"
 * lines, kJ/kcal pairs, salt converted to sodium, and a per-serving column
 * scaled back to 100 g, with anything it couldn't find listed as missing.
 */
export default function LabelScan({ onDone }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [serving, setServing] = useState('100');
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState([]);

  const read = useMemo(
    () => labelToDraft(text, { name: name.trim(), servingGrams: Number(serving) || 100 }),
    [text, name, serving],
  );

  const save = () => {
    const { errors: problems, food } = makeCustomFood(read.draft);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    app.addCustomFood(food);
    setSaved(true);
    setErrors([]);
    onDone?.(food);
  };

  return (
    <div className="px-5 pb-10 space-y-4">
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border"
        style={{ background: 'var(--card-2)', borderColor: 'var(--line)' }}
      >
        <div className="absolute inset-x-8 inset-y-6 rounded-xl border-2 border-dashed" style={{ borderColor: 'var(--line)' }} />
        <p className="relative px-6 text-center text-[0.78125rem] font-bold" style={{ color: 'var(--muted)' }}>
          <Camera size={16} className="mx-auto mb-1" />
          Line the panel up and copy it in below — this build reads text, not pixels.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        rows={8}
        placeholder={'Energy 250kcal\nFat 12g\nof which saturates 5.1g\nProtein 8.5g\nSalt 1.2g'}
        aria-label="Nutrition panel"
        className="w-full rounded-2xl border px-4 py-3 text-[0.84375rem] font-semibold outline-none resize-none"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      />
      <button
        onClick={() => setText(SAMPLE)}
        className="press inline-flex items-center gap-1.5 text-[0.78125rem] font-bold"
        style={{ color: 'var(--accent)' }}
      >
        <ScanText size={13} /> Use an example panel
      </button>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-[0.6875rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What is it?"
            aria-label="Food name"
            className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-[0.875rem] font-semibold outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--ink)' }}
          />
        </label>
        <NumberField label="Serving size" value={serving} onChange={setServing} suffix="g" step={10} />
      </div>

      {text.trim().length > 5 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>What it read</p>
            {read.basis && (
              <Pill tone={read.basis.stated ? 'good' : 'warn'}>
                {read.basis.stated ? `per ${read.basis.grams} ${read.basis.unit}` : 'basis not stated — assuming 100 g'}
              </Pill>
            )}
          </div>
          {read.found.length === 0 ? (
            <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Nothing recognisable yet. Panels read like “Protein 8.5g” — one nutrient a line.
            </p>
          ) : (
            <ul className="space-y-1">
              {read.found.map((key) => (
                <li key={key} className="flex justify-between text-[0.8125rem]">
                  <span className="font-semibold">{nutrientBy[key]?.label || key}</span>
                  <span className="font-bold" style={{ color: 'var(--muted)' }}>
                    {read.draft[key]} {nutrientBy[key]?.unit} per serving
                  </span>
                </li>
              ))}
            </ul>
          )}
          {read.missing.length > 0 && (
            <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
              <Info size={13} className="mt-0.5 shrink-0" />
              Couldn’t find {read.missing.map((k) => nutrientBy[k]?.label.toLowerCase() || k).join(', ')} — those stay blank rather than being guessed.
            </p>
          )}
        </Card>
      )}

      {errors.length > 0 && errors.map((e) => <Pill key={e} tone="danger">{e}</Pill>)}

      <button
        onClick={save}
        disabled={!read.ok || name.trim().length < 2 || saved}
        className="press w-full rounded-2xl py-3.5 text-[0.9375rem] font-extrabold disabled:opacity-40"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <span className="inline-flex items-center gap-2">
          {saved ? <><Check size={16} strokeWidth={3} /> Saved to My foods</> : 'Save as my food'}
        </span>
      </button>
      {!read.ok && text.trim().length > 5 && (
        <p className="text-[0.75rem] font-semibold text-center" style={{ color: 'var(--muted)' }}>
          A calorie figure is the one thing it can’t do without.
        </p>
      )}
    </div>
  );
}
