import { describe, it, expect } from 'vitest';
import {
  evidenceScoreFor, confidenceForCount, confidenceForEvidence, decayEvidence,
  calibratedConfidence, applyCalibration, confidenceCalibration,
} from '../src/lib/confidence-calibration.js';

describe('count and evidence confidence', () => {
  it('maps counts to levels', () => {
    expect(confidenceForCount(0)).toBe('none');
    expect(confidenceForCount(2)).toBe('low');
    expect(confidenceForCount(5)).toBe('medium');
    expect(confidenceForCount(8)).toBe('high');
    expect(confidenceForCount('x')).toBe('none');
  });
  it('weights sources, with a default for unknown ones', () => {
    expect(evidenceScoreFor(10, 'pantry')).toBeCloseTo(4);
    expect(evidenceScoreFor(10, 'mystery')).toBeCloseTo(5);
    expect(confidenceForEvidence(0)).toBe('none');
    expect(confidenceForEvidence(10, 'taste-ratings')).toBe('high');
    expect(confidenceForEvidence(1, 'pantry')).toBe('low');
  });
});

describe('decayEvidence', () => {
  it('halves evidence after 28 days', () => {
    expect(decayEvidence(1, ['2026-09-23'], '2026-10-21')).toBeCloseTo(0.5, 2);
  });
  it('keeps fresh and undated evidence whole, never above the count', () => {
    expect(decayEvidence(2, ['2026-10-21'], '2026-10-21')).toBeCloseTo(2, 2);
    expect(decayEvidence(3, ['2026-10-21'], '2026-10-21')).toBeLessThanOrEqual(3);
  });
  it('takes undated counts with a haircut and ignores zero', () => {
    expect(decayEvidence(5, [], '2026-10-21')).toBe(4);
    expect(decayEvidence(0, ['2026-10-21'], '2026-10-21')).toBe(0);
  });
});

describe('calibratedConfidence', () => {
  const today = '2026-10-21';
  it('is none with no evidence', () => {
    expect(calibratedConfidence({ today }).level).toBe('none');
  });
  it('demotes high to medium on conflicting evidence', () => {
    const base = { count: 10, source: 'taste-ratings', dates: Array(10).fill(today), today };
    expect(calibratedConfidence(base).level).toBe('high');
    const c = calibratedConfidence({ ...base, conflicting: 3 });
    expect(c.level).toBe('medium');
    expect(c.conflicting).toBe(true);
  });
});

describe('applyCalibration and confidenceCalibration', () => {
  const snaps = (conf, outcomes, probability) =>
    outcomes.map((o) => ({ type: 'prediction_snapshot', confidence: conf, outcome: o, probability }));
  it('is not ready without resolved snapshots', () => {
    expect(confidenceCalibration([{ type: 'prediction_snapshot', confidence: 'high' }]).ready).toBe(false);
    expect(confidenceCalibration(null).ready).toBe(false);
  });
  it('flags an overconfident high and steps it down one level', () => {
    const cal = confidenceCalibration(snaps('high', [true, false, false, false, false], 0.9));
    expect(cal.byConfidence.high.verdict).toBe('overconfident');
    expect(applyCalibration('high', cal)).toBe('medium');
  });
  it('needs enough history and never touches none', () => {
    const cal = confidenceCalibration(snaps('high', [false, false], 0.9));
    expect(applyCalibration('high', cal)).toBe('high');
    expect(applyCalibration('none', cal)).toBe('none');
  });
  it('lifts an underconfident low but never beyond high', () => {
    const cal = confidenceCalibration(snaps('low', [true, true, true, true, true], 0.2));
    expect(applyCalibration('low', cal)).toBe('medium');
  });
});
