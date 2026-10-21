import { describe, it, expect } from 'vitest';
import { nutritionConfidence } from '../src/lib/nutrition-confidence.js';
import { auditSummary, LLM_CALLS } from '../src/lib/ai-audit.js';

describe('nutritionConfidence', () => {
  it('is unknown for a missing recipe or one with no ingredients', () => {
    expect(nutritionConfidence(null).kind).toBe('unknown');
    expect(nutritionConfidence({ name: 'x' }).kind).toBe('unknown');
    expect(nutritionConfidence({ ingredients: [] }).kind).toBe('unknown');
  });
  it('is unknown when no ingredient matches food tables', () => {
    expect(nutritionConfidence({ ingredients: [{ name: 'zzzz-not-food' }] }).kind).toBe('unknown');
  });
  it('calls inferred-from-name nutrition a rough estimate, even with a label flag', () => {
    const r = nutritionConfidence({ nutritionStatus: 'estimated-from-ingredients', nutritionSource: 'label' });
    expect(r.kind).toBe('estimated');
    expect(r.label).toMatch(/Rough estimate/);
  });
  it('treats signature, per100 or label source as a stated figure', () => {
    expect(nutritionConfidence({ signature: true }).kind).toBe('label');
    expect(nutritionConfidence({ per100: {} }).kind).toBe('label');
    expect(nutritionConfidence({ nutritionSource: 'label' }).kind).toBe('label');
  });
});

describe('auditSummary', () => {
  it('counts calls by keep status', () => {
    const s = auditSummary();
    expect(s.totalCalls).toBe(LLM_CALLS.length);
    expect(s.llmNeeded + s.removed + s.local).toBe(s.totalCalls);
  });
});
