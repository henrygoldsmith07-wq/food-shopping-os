/**
 * Showing a number the way you read it.
 *
 * Only the *display* changes. Everything is stored in kg, cm, kcal, ml and
 * 24-hour time, and every calculation runs on those — a unit preference that
 * reached the maths would be a rounding error compounding quietly for months.
 * These functions are the last step before a number reaches your eyes.
 */

import { DEFAULT_UNITS } from '../data/preferences.js';

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const KJ_PER_KCAL = 4.184;
const ML_PER_FLOZ = 28.4130625; // UK fluid ounce

const round = (n, dp = 0) => {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
};

export const units = (prefs = {}) => ({ ...DEFAULT_UNITS, ...(prefs.units || {}) });

/* ---------- Weight ---------- */

export const kgToLb = (kg) => round(kg / KG_PER_LB, 1);
export const lbToKg = (lb) => round(lb * KG_PER_LB, 2);

/** Stone and pounds, the way British scales still read. */
export const kgToStone = (kg) => {
  const totalLb = kg / KG_PER_LB;
  const stone = Math.floor(totalLb / 14);
  return { stone, pounds: round(totalLb - stone * 14, 1) };
};

export const formatWeight = (kg, unit = 'kg') => {
  if (kg === null || kg === undefined || Number.isNaN(Number(kg))) return null;
  if (unit === 'lb') return `${kgToLb(kg)} lb`;
  if (unit === 'st') {
    const { stone, pounds } = kgToStone(kg);
    return `${stone} st ${pounds} lb`;
  }
  return `${round(kg, 1)} kg`;
};

/* ---------- Height ---------- */

export const cmToFtIn = (cm) => {
  const totalIn = cm / CM_PER_INCH;
  const feet = Math.floor(totalIn / 12);
  return { feet, inches: round(totalIn - feet * 12) };
};

export const formatHeight = (cm, unit = 'cm') => {
  if (!cm) return null;
  if (unit === 'ftin') {
    const { feet, inches } = cmToFtIn(cm);
    return `${feet}′ ${inches}″`;
  }
  return `${round(cm)} cm`;
};

/* ---------- Energy ---------- */

export const kcalToKj = (kcal) => Math.round(kcal * KJ_PER_KCAL);

/** The number alone, for places that print their own unit. */
export const energyValue = (kcal, unit = 'kcal') => (unit === 'kJ' ? kcalToKj(kcal) : Math.round(kcal));

export const energyLabel = (unit = 'kcal') => (unit === 'kJ' ? 'kJ' : 'kcal');

export const formatEnergy = (kcal, unit = 'kcal') => {
  if (kcal === null || kcal === undefined) return null;
  return `${energyValue(kcal, unit).toLocaleString()} ${energyLabel(unit)}`;
};

/* ---------- Volume ---------- */

export const mlToFloz = (ml) => round(ml / ML_PER_FLOZ, 1);

export const formatVolume = (ml, unit = 'ml') =>
  (unit === 'floz' ? `${mlToFloz(ml)} fl oz` : `${Math.round(ml).toLocaleString()} ml`);

/* ---------- Clock ---------- */

/** "13:05" → "1:05 pm", leaving a 24-hour preference untouched. */
export const formatTime = (time, unit = '24h') => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!match) return time || '';
  const h = Number(match[1]);
  const m = match[2];
  if (unit !== '12h') return `${String(h).padStart(2, '0')}:${m}`;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m} ${suffix}`;
};

/**
 * One object of formatters bound to your choices, so a component asks for
 * `fmt.weight(82)` and never has to know which system you picked.
 */
export const formatters = (prefs = {}) => {
  const u = units(prefs);
  return {
    units: u,
    weight: (kg) => formatWeight(kg, u.weight),
    height: (cm) => formatHeight(cm, u.height),
    energy: (kcal) => formatEnergy(kcal, u.energy),
    energyValue: (kcal) => energyValue(kcal, u.energy),
    energyLabel: () => energyLabel(u.energy),
    volume: (ml) => formatVolume(ml, u.volume),
    time: (time) => formatTime(time, u.clock),
  };
};
