import { describe, expect, it } from 'vitest';
import { confidenceLabel, confidenceTone, evidenceConfidence, confidenceSummary } from '../src/lib/confidence.js';

describe('confidence presentation', () => {
  it('labels and tones known levels consistently', () => {
    expect(confidenceLabel('high')).toBe('High confidence');
    expect(confidenceLabel('low')).toBe('Low confidence');
    expect(confidenceTone('medium')).toBe('accent');
  });

  it('makes inferred and checked evidence explicit', () => {
    const checked = evidenceConfidence({ confidence: 'high', source: 'live' });
    expect(confidenceSummary(checked)).toBe('High confidence · Price checked today');
    const inferred = evidenceConfidence({ confidence: 'low', source: 'planned-meals', inferred: true });
    expect(inferred.inferred).toBe(true);
    expect(confidenceSummary(inferred)).toMatch(/Quantity inferred from planned meals/);
  });
});
