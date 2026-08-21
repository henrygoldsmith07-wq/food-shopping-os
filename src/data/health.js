/**
 * Health reference data: what can be measured, in what units, and the
 * published categories a reading falls into.
 *
 * The ranges below are the ordinary public-health ones (NHS/WHO for BMI and
 * blood pressure, NICE/Diabetes UK for glucose, NHS for cholesterol). They are
 * here so a number can be *labelled* rather than left bare — the app never
 * diagnoses anything, and every surface that uses them says so and says to
 * talk to a clinician about anything that matters.
 *
 * Nothing here is user data. Your readings live in app state and start empty.
 */

export const MEASUREMENTS = [
  { key: 'weight', label: 'Weight', unit: 'kg', step: 0.1, min: 20, max: 400 },
  { key: 'bodyFat', label: 'Body fat', unit: '%', step: 0.1, min: 2, max: 70 },
  { key: 'waist', label: 'Waist', unit: 'cm', step: 0.5, min: 40, max: 200 },
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', step: 1, min: 30, max: 140 },
];

export const measurementBy = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, m]));

/** BMI bands as the NHS publishes them. */
export const BMI_BANDS = [
  { to: 18.5, label: 'Underweight', tone: 'warn' },
  { to: 25, label: 'Healthy weight', tone: 'good' },
  { to: 30, label: 'Overweight', tone: 'warn' },
  { to: Infinity, label: 'Obese', tone: 'danger' },
];

/**
 * Waist thresholds are sex-specific in every published guideline; when sex
 * isn't stated the app says so rather than picking one for you.
 */
export const WAIST_LIMITS = {
  female: { raised: 80, high: 88 },
  male: { raised: 94, high: 102 },
};

/* ---------- Vitals ---------- */

const vital = (key, label, fields, unit, categorise, note) => ({ key, label, fields, unit, categorise, note });

/** Blood pressure categories, following the NHS/ESC bandings. */
export const bpCategory = ({ systolic, diastolic }) => {
  if (!systolic || !diastolic) return null;
  if (systolic >= 180 || diastolic >= 120) return { label: 'Very high', tone: 'danger', advice: 'A reading this high is worth urgent medical advice.' };
  if (systolic >= 140 || diastolic >= 90) return { label: 'High', tone: 'warn', advice: 'Consistently high readings are worth a GP appointment.' };
  if (systolic >= 130 || diastolic >= 80) return { label: 'Slightly raised', tone: 'warn', advice: 'Worth keeping an eye on over a few weeks.' };
  if (systolic < 90 || diastolic < 60) return { label: 'Low', tone: 'muted', advice: 'Low readings are often normal, but mention them if you feel faint.' };
  return { label: 'Normal', tone: 'good', advice: null };
};

/** Fasting glucose, in mmol/L, as Diabetes UK publishes it. */
export const glucoseCategory = ({ glucose }) => {
  if (!glucose) return null;
  if (glucose < 4) return { label: 'Low', tone: 'warn', advice: 'Below the usual fasting range.' };
  if (glucose <= 5.9) return { label: 'Normal', tone: 'good', advice: null };
  if (glucose <= 6.9) return { label: 'Raised', tone: 'warn', advice: 'In the range often called pre-diabetes — worth a conversation with your GP.' };
  return { label: 'High', tone: 'danger', advice: 'Above the usual fasting range; a GP can say what it means for you.' };
};

/** Total cholesterol and HDL, mmol/L, against NHS reference values. */
export const cholesterolCategory = ({ total, hdl }) => {
  if (!total) return null;
  if (total > 5) return { label: 'Above target', tone: 'warn', advice: hdl && hdl >= 1 ? 'Total is above 5 mmol/L, though your HDL is in range.' : 'Total is above the 5 mmol/L reference.' };
  return { label: 'In range', tone: 'good', advice: null };
};

/**
 * A blood panel, banded against ordinary adult reference ranges. Labs differ
 * slightly and your own report's ranges are the ones that count — which is why
 * each row carries its range rather than just a verdict.
 */
const blood = (key, label, unit, low, high, note) => ({ key, label, unit, low, high, note });

export const BLOOD_MARKERS = [
  blood('hb', 'Haemoglobin', 'g/L', 120, 180, 'Ranges differ by sex; 120–150 female, 130–180 male is typical.'),
  blood('ferritin', 'Ferritin', 'µg/L', 30, 300, 'Iron stores. Rises with inflammation, so a single value can mislead.'),
  blood('b12', 'Vitamin B12', 'pmol/L', 150, 700, 'Low-normal can still be symptomatic.'),
  blood('folate', 'Folate', 'nmol/L', 7, 45, ''),
  blood('vitD', 'Vitamin D', 'nmol/L', 50, 125, 'Below 25 is deficiency in UK guidance.'),
  blood('hba1c', 'HbA1c', 'mmol/mol', 20, 42, '42–47 is the pre-diabetes range; 48 and above is diagnostic.'),
  blood('tsh', 'TSH', 'mIU/L', 0.4, 4.0, ''),
  blood('crp', 'CRP', 'mg/L', 0, 5, 'A general inflammation marker, not specific to anything.'),
];

export const bloodBy = Object.fromEntries(BLOOD_MARKERS.map((b) => [b.key, b]));

/** Where one result sits in its range. Never a diagnosis, always a position. */
export const bloodCategory = (key, value) => {
  const marker = bloodBy[key];
  const n = Number(value);
  if (!marker || !Number.isFinite(n)) return null;
  if (n < marker.low) return { label: 'Below range', tone: 'warn', range: `${marker.low}–${marker.high} ${marker.unit}` };
  if (n > marker.high) return { label: 'Above range', tone: 'warn', range: `${marker.low}–${marker.high} ${marker.unit}` };
  return { label: 'In range', tone: 'good', range: `${marker.low}–${marker.high} ${marker.unit}` };
};

export const BLOOD_CAVEAT =
  'Your own report’s reference ranges are the ones that count — labs differ, and ranges vary by age and sex. Forq stores what you type and bands it against ordinary adult ranges so you can see a trend. It cannot interpret a result, and the person who ordered the test can.';

export const VITALS = [
  vital('bp', 'Blood pressure', [
    { key: 'systolic', label: 'Systolic', min: 60, max: 260, step: 1 },
    { key: 'diastolic', label: 'Diastolic', min: 30, max: 160, step: 1 },
  ], 'mmHg', bpCategory, 'Sitting, arm supported, after five minutes still.'),
  vital('glucose', 'Blood glucose', [
    { key: 'glucose', label: 'Glucose', min: 1, max: 35, step: 0.1 },
  ], 'mmol/L', glucoseCategory, 'Ranges quoted are for a fasting reading.'),
  vital('cholesterol', 'Cholesterol', [
    { key: 'total', label: 'Total', min: 1, max: 15, step: 0.1 },
    { key: 'hdl', label: 'HDL', min: 0.1, max: 5, step: 0.1 },
    { key: 'ldl', label: 'LDL', min: 0.1, max: 12, step: 0.1 },
  ], 'mmol/L', cholesterolCategory, 'Usually measured after fasting, from a blood test.'),
];

export const vitalBy = Object.fromEntries(VITALS.map((v) => [v.key, v]));

/** Every surface that shows a category shows this with it. */
export const MEDICAL_DISCLAIMER =
  'These are published reference ranges, not a diagnosis. Forq is a food app — anything that matters is a conversation with a clinician.';

/* ---------- Sleep and stress ---------- */

export const SLEEP_QUALITY = [
  { value: 1, label: 'Awful' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

export const STRESS_LEVELS = [
  { value: 1, label: 'Calm' },
  { value: 2, label: 'Fine' },
  { value: 3, label: 'Stretched' },
  { value: 4, label: 'Stressed' },
  { value: 5, label: 'Overwhelmed' },
];

/* ---------- Cycle ---------- */

export const FLOW_LEVELS = ['Spotting', 'Light', 'Medium', 'Heavy'];
export const CYCLE_SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Tired', 'Low mood', 'Cravings', 'Sore', 'Nausea'];

/** Typical figures, used only to explain an estimate — never to fill one in. */
export const CYCLE_TYPICAL = { length: 28, period: 5 };
