import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_QUEUE_KEY, flushProductEvents, queuedProductEventCount, readAnalyticsConsent,
  recordProductEvent, setAnalyticsConsent,
} from '../src/lib/product-analytics.js';

describe('privacy-safe product analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not record anything until the user opts in', () => {
    expect(recordProductEvent('app_opened')).toBe(false);
    expect(localStorage.getItem(ANALYTICS_QUEUE_KEY)).toBeNull();
    expect(readAnalyticsConsent()).toBe(false);
  });

  it('keeps only coarse allowlisted properties', () => {
    setAnalyticsConsent(true);
    expect(recordProductEvent('plan_generated', {
      scope: 'A week',
      hasPantry: true,
      recipeName: 'A private recipe',
      count: 2,
    })).toBe(true);
    const queued = JSON.parse(localStorage.getItem(ANALYTICS_QUEUE_KEY));
    expect(queued[0].properties).toEqual({ scope: 'A week', hasPantry: true, count: 2 });
  });

  it('uploads a batch only for a selected household and clears sent events', async () => {
    setAnalyticsConsent(true);
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({ householdId: 'household-1' }));
    recordProductEvent('app_opened');
    localStorage.removeItem('forq-product-events-last-attempt-v1');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await flushProductEvents({ request });
    expect(result.sent).toBe(1);
    expect(queuedProductEventCount()).toBe(0);
    expect(request).toHaveBeenCalledWith('/api/analytics', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-forq-household-id': 'household-1' }),
    }));
  });

  it('flushes legacy queue entries with a stable generated id', async () => {
    setAnalyticsConsent(true);
    localStorage.setItem('forq-cloud-meta-v1', JSON.stringify({ householdId: 'household-1' }));
    localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify([{
      name: 'app_opened', properties: {}, householdId: 'household-1', at: '2026-08-01T00:00:00.000Z',
    }]));
    localStorage.removeItem('forq-product-events-last-attempt-v1');
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await flushProductEvents({ request });
    expect(queuedProductEventCount()).toBe(0);
  });

  it('clears queued events when consent is withdrawn', () => {
    setAnalyticsConsent(true);
    recordProductEvent('app_opened');
    setAnalyticsConsent(false);
    expect(queuedProductEventCount()).toBe(0);
    expect(readAnalyticsConsent()).toBe(false);
  });
});
