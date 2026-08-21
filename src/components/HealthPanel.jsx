import { useMemo, useState } from 'react';
import {
  Activity, Camera, Droplet, HeartPulse, Info, Moon, RefreshCw, Ruler, Target, Trash2,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import { useApp, PHOTO_LIMIT } from '../lib/store.jsx';
import { prettyDate } from '../lib/utils.js';
import { MEASUREMENTS, MEDICAL_DISCLAIMER, VITALS } from '../data/health.js';
import { PRIVACY_COPY } from '../data/privacy.js';
import { series } from '../lib/health.js';
import { YOUTH_COPY, YOUTH_SIGNPOST } from '../lib/youth.js';
import { healthierSwaps } from '../lib/advice.js';
import { shrinkImage, storageEstimate } from '../lib/photos.js';
import { Card, Chip, Empty, Pill, Sparkline } from './ui.jsx';
import { NumberField } from './FoodDetail.jsx';
import { CycleView, RestView } from './WellbeingPanel.jsx';
import NutritionPanel from './NutritionPanel.jsx';
import GoalsPanel from './GoalsPanel.jsx';

const VIEWS = [
  ['body', 'Body', Ruler],
  ['nutrition', 'Nutrition', Activity],
  ['targets', 'Targets', Target],
  ['swaps', 'Swaps', RefreshCw],
  ['vitals', 'Vitals', HeartPulse],
  ['rest', 'Rest', Moon],
  ['cycle', 'Cycle', Droplet],
];

const Disclaimer = () => (
  <p className="text-[0.75rem] font-semibold inline-flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
    <Info size={13} className="mt-0.5 shrink-0" /> {MEDICAL_DISCLAIMER}
  </p>
);

function HealthySwapsView() {
  const app = useApp();
  const recent = app.recentFoods?.[0];
  const swaps = (recent
    ? healthierSwaps(recent, { catalogue: app.catalogue, diets: app.planDiets, limit: 5 })
    : []).filter((swap) => !(app.fitFor?.({
    name: swap.food.name,
    ingredients: [{ name: swap.food.name }],
    steps: [],
    time: 0,
  }).blocked.length));

  if (!recent) {
    return (
      <Card className="text-center py-8">
        <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Log a food first and healthy swaps will compare it with foods that do the same job.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Instead of</p>
        <p className="mt-1 text-[1.125rem] font-extrabold">{recent.name}</p>
        <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
          Every suggestion below improves a measured nutrient per calorie and respects your dietary filters.
        </p>
      </Card>
      {swaps.length ? swaps.map((swap) => (
        <Card key={swap.food.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-extrabold text-[0.875rem]">{swap.food.name}</p>
              <p className="mt-0.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{swap.why}</p>
            </div>
            <Pill tone={swap.kcalDiff <= 0 ? 'good' : 'muted'}>
              {swap.kcalDiff > 0 ? '+' : ''}{swap.kcalDiff} kcal
            </Pill>
          </div>
        </Card>
      )) : (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing in the catalogue clearly improves protein, fibre, saturated fat or sugar for this food.
          </p>
        </Card>
      )}
    </>
  );
}

/* ---------- Body ---------- */

function BodyView() {
  const app = useApp();
  const summary = app.body_;
  const [key, setKey] = useState('weight');
  const [value, setValue] = useState('');
  const points = useMemo(() => series(app.measurements, key).map((m) => m.value), [app.measurements, key]);
  const field = MEASUREMENTS.find((m) => m.key === key);

  const save = () => {
    if (!Number(value)) return;
    app.addMeasurement({ key, value: Number(value) });
    setValue('');
  };

  return (
    <>
      <Card>
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Take a reading</p>
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {MEASUREMENTS.map((m) => (
            <Chip key={m.key} active={key === m.key} onClick={() => { setKey(m.key); setValue(''); }}>{m.label}</Chip>
          ))}
        </div>
        <div className="mt-3 flex items-end gap-2.5">
          <div className="flex-1">
            <NumberField label={`${field.label} (${field.unit})`} value={value} onChange={setValue} suffix={field.unit} step={field.step} />
          </div>
          <button
            onClick={save}
            disabled={!Number(value)}
            className="press rounded-2xl px-5 py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Log
          </button>
        </div>
        {points.length > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <Sparkline points={points} />
            <p className="text-[0.75rem] font-semibold text-right" style={{ color: 'var(--muted)' }}>
              {points.length} readings
            </p>
          </div>
        )}
      </Card>

      {summary.count === 0 ? (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Nothing measured yet. Everything on this page is a reading you took — there are no
            estimates and no imports standing in for one.
          </p>
        </Card>
      ) : (
        <>
          {summary.bmi && app.youth.bodyComparisons && (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>BMI</p>
                  <p className="text-[1.375rem] font-extrabold">{summary.bmi.value}</p>
                </div>
                <Pill tone={summary.bmi.tone}>{summary.bmi.label}</Pill>
              </div>
              <p className="mt-1 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Computed from your latest weight and your height — never stored, so it can’t go stale.
              </p>
            </Card>
          )}
          {/* Adult BMI bands do not apply under 18: the NHS reads child weight
              against age- and sex-specific centiles, which is a clinical
              assessment rather than a number this app can band. */}
          {!app.youth.bodyComparisons && (
            <Card className="space-y-2">
              <p className="font-extrabold text-[0.875rem]">No BMI band here</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_COPY.measurement}</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{YOUTH_SIGNPOST}</p>
            </Card>
          )}
          {summary.needsHeight && app.youth.bodyComparisons && (
            <Card className="!p-3">
              <p className="text-[0.8125rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Add your height under Goals and this page can work out your BMI.
              </p>
            </Card>
          )}

          {MEASUREMENTS.map((m) => {
            const reading = summary.readings[m.key];
            const trend = summary.trends[m.key];
            if (!reading) return null;
            return (
              <Card key={m.key} className="!p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{m.label}</p>
                    <p className="text-[1.125rem] font-extrabold">{reading.value} {m.unit}</p>
                    <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{prettyDate(reading.date)}</p>
                  </div>
                  {trend ? (
                    <div className="text-right">
                      <p className="text-[0.8125rem] font-bold inline-flex items-center gap-1">
                        {trend.direction === 'up' ? <TrendingUp size={14} /> : trend.direction === 'down' ? <TrendingDown size={14} /> : null}
                        {trend.change > 0 ? '+' : ''}{trend.change} {m.unit}
                      </p>
                      <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
                        over {trend.spanDays} days · {trend.readings} readings
                      </p>
                    </div>
                  ) : (
                    <Pill tone="faint">one reading</Pill>
                  )}
                </div>
                {m.key === 'waist' && summary.waist && (
                  <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                    {summary.waist.label ? `${summary.waist.label} — ${summary.waist.note}` : summary.waist.note}
                  </p>
                )}
              </Card>
            );
          })}
        </>
      )}

      <PhotosCard />
      <Disclaimer />
    </>
  );
}

/* ---------- Progress photos ---------- */

function PhotosCard() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const storage = storageEstimate(app.photos);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFailed(false);
    const thumb = await shrinkImage(file);
    setBusy(false);
    if (!thumb) {
      setFailed(true);
      return;
    }
    app.addPhoto({ thumb });
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Progress photos</p>
        <Pill tone="muted">{app.photos.length}/{PHOTO_LIMIT}</Pill>
      </div>
      <label className="press mt-2 flex items-center justify-center gap-2 rounded-2xl border py-3 text-[0.84375rem] font-extrabold cursor-pointer"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
        <Camera size={15} /> {busy ? 'Shrinking…' : 'Add a photo'}
        <input type="file" accept="image/*" onChange={pick} className="hidden" aria-label="Add a progress photo" />
      </label>
      {failed && (
        <p className="mt-2 text-[0.78125rem] font-semibold" style={{ color: 'var(--danger)' }}>
          That image couldn’t be read here. Nothing was saved.
        </p>
      )}
      {app.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {[...app.photos].reverse().map((p) => (
            <div key={p.id} className="relative shrink-0">
              <img src={p.thumb} alt={`Progress photo from ${p.date}`} className="h-28 w-20 rounded-xl object-cover" />
              <button
                onClick={() => app.removePhoto(p.id)}
                aria-label={`Delete photo from ${p.date}`}
                className="press absolute top-1 right-1 rounded-full p-1"
                style={{ background: 'var(--card)', color: 'var(--muted)' }}
              >
                <Trash2 size={11} />
              </button>
              <p className="mt-1 text-[0.65625rem] font-semibold text-center" style={{ color: 'var(--faint)' }}>
                {prettyDate(p.date)}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {PRIVACY_COPY.photos} They’re shrunk to thumbnails and capped at {PHOTO_LIMIT}, because browser storage is small
        {storage.kb > 0 && ` (yours are using about ${storage.kb} KB)`}.
      </p>
    </Card>
  );
}

/* ---------- Vitals ---------- */

function VitalsView() {
  const app = useApp();
  const [key, setKey] = useState('bp');
  const [values, setValues] = useState({});
  const vital = VITALS.find((v) => v.key === key);
  const summary = app.vitalsSummary[key];

  const save = () => {
    if (!vital.fields.every((f) => Number(values[f.key]) > 0)) return;
    app.addVital({ key, values: Object.fromEntries(vital.fields.map((f) => [f.key, Number(values[f.key])])) });
    setValues({});
  };

  return (
    <>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {VITALS.map((v) => (
          <Chip key={v.key} active={key === v.key} onClick={() => { setKey(v.key); setValues({}); }}>{v.label}</Chip>
        ))}
      </div>

      <Card className="space-y-3">
        <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>
          New {vital.label.toLowerCase()} reading ({vital.unit})
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {vital.fields.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ''}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              step={f.step}
            />
          ))}
        </div>
        <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>{vital.note}</p>
        <button
          onClick={save}
          disabled={!vital.fields.every((f) => Number(values[f.key]) > 0)}
          className="press w-full rounded-2xl py-3 text-[0.875rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Save reading
        </button>
      </Card>

      {summary.count === 0 ? (
        <Empty title={`No ${vital.label.toLowerCase()} readings yet`}>
          Nothing here is estimated. Type a reading in above and this page starts keeping the
          run of them — one reading is a number, several are a direction.
        </Empty>
      ) : (
        <Card className="!p-0 divide-y" style={{ borderColor: 'var(--line)' }}>
          {app.vitals.filter((v) => v.key === key).slice().reverse().slice(0, 8).map((reading) => {
            const category = vital.categorise(reading.values || {});
            return (
              <div key={reading.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-bold text-[0.875rem]">
                    {vital.fields.map((f) => reading.values[f.key]).filter((n) => n !== undefined).join(' / ')} {vital.unit}
                  </p>
                  <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>{prettyDate(reading.date)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {category && <Pill tone={category.tone}>{category.label}</Pill>}
                  <button onClick={() => app.removeVital(reading.id)} aria-label="Delete reading" className="press p-1" style={{ color: 'var(--faint)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {summary.latest?.category?.advice && (
        <Card className="!p-3" style={{ borderColor: 'var(--warn)' }}>
          <p className="text-[0.8125rem] font-semibold">{summary.latest.category.advice}</p>
        </Card>
      )}
      <Disclaimer />
    </>
  );
}

/**
 * Health tracking: measurements, vitals, rest and cycle.
 *
 * Every figure on this page is a reading you took or arithmetic over readings
 * you took. Where a published reference range exists it is used to label a
 * number, always with the reminder that a label is not a diagnosis.
 */
export default function HealthPanel() {
  const app = useApp();
  const [view, setView] = useState('body');
  if (!app.householdAccess.health && app.activeMember) {
    return (
      <div className="px-5 pb-10">
        <Card className="py-8 text-center">
          <HeartPulse size={24} className="mx-auto" />
          <p className="mt-2 font-extrabold text-[0.9375rem]">Health access is off</p>
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            An adult can enable this separately under household permissions.
          </p>
        </Card>
      </div>
    );
  }
  if (app.healthVault.enabled && !app.healthVault.unlocked) {
    return (
      <div className="px-5 pb-10">
        <Card className="py-8 text-center">
          <HeartPulse size={24} className="mx-auto" />
          <p className="mt-2 font-extrabold text-[0.9375rem]">Health data is locked</p>
          <p className="mt-1 text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Open Privacy, storage &amp; deletion and unlock the encrypted health vault first.
          </p>
        </Card>
      </div>
    );
  }
  // The cycle page is there because you asked for it, not because of anything
  // the app decided about you.
  const views = VIEWS.filter(([key]) => key !== 'cycle' || (app.trackCycle && app.hasTool('cycle')));
  return (
    <div className="px-5 pb-10 space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {views.map(([key, label, Icon]) => (
          <Chip key={key} active={view === key} onClick={() => setView(key)}>
            <span className="inline-flex items-center gap-1.5"><Icon size={13} /> {label}</span>
          </Chip>
        ))}
      </div>
      {view === 'body' && <BodyView />}
      {view === 'nutrition' && <div className="-mx-5"><NutritionPanel /></div>}
      {view === 'targets' && <div className="-mx-5"><GoalsPanel /></div>}
      {view === 'swaps' && <HealthySwapsView />}
      {view === 'vitals' && <VitalsView />}
      {view === 'rest' && <RestView />}
      {view === 'cycle' && app.trackCycle && app.hasTool('cycle') && <CycleView />}
    </div>
  );
}
