import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_QUEUE_KEY, flushProductEvents, queuedProductEventCount, readAnalyticsConsent,
  recordProductEvent, setAnalyticsConsent, setDemoAnalyticsSuppressed,
} from '../src/lib/product-analytics.js';
import { EMPTY_STATE } from '../src/lib/state.js';

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

  /* A child profile must not hold product-insights consent, whatever the flag
     says. The store's revocation effect used to be keyed to the age field
     alone, so a grant restored from a backup — or granted before a birthday —
     survived an unrelated profile edit and kept emitting. */
  describe('a child profile cannot hold consent', () => {
    const child = () => ({ ...EMPTY_STATE, body: { ...EMPTY_STATE.body, age: 15 } });
    const adult = () => ({ ...EMPTY_STATE, body: { ...EMPTY_STATE.body, age: 30 } });

    it('refuses to store a grant for a child', () => {
      expect(setAnalyticsConsent(true, child())).toBe(false);
      expect(readAnalyticsConsent(child())).toBe(false);
      expect(recordProductEvent('app_opened', {}, undefined, child())).toBe(false);
    });

    it('does not honour a grant restored from a backup for a child', () => {
      localStorage.setItem('forq-product-analytics-consent-v1', 'granted');
      expect(readAnalyticsConsent(child())).toBe(false);
      expect(recordProductEvent('app_opened', {}, undefined, child())).toBe(false);
      expect(queuedProductEventCount()).toBe(0);
    });

    it('still refuses to upload a queue built while consent was valid', async () => {
      setAnalyticsConsent(true, adult());
      recordProductEvent('app_opened', {}, undefined, adult());
      expect(queuedProductEventCount()).toBe(1);
      const fetch = vi.fn().mockResolvedValue({ ok: true });
      expect((await flushProductEvents({ request: fetch, householdId: 'hh', state: child() })).sent).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('drops a child profile consent and its queue when consent is denied', () => {
      setAnalyticsConsent(true, adult());
      recordProductEvent('app_opened', {}, undefined, adult());
      expect(setAnalyticsConsent(false, child())).toBe(true);
      expect(readAnalyticsConsent(child())).toBe(false);
      expect(queuedProductEventCount()).toBe(0);
    });

    it('leaves an adult household unaffected', () => {
      expect(setAnalyticsConsent(true, adult())).toBe(true);
      expect(readAnalyticsConsent(adult())).toBe(true);
      expect(recordProductEvent('app_opened', {}, undefined, adult())).toBe(true);
      expect(queuedProductEventCount()).toBe(1);
    });
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

  it('never records while a demo session is open, consent or not', () => {
    setAnalyticsConsent(true);
    setDemoAnalyticsSuppressed(true);
    try {
      expect(recordProductEvent('app_opened')).toBe(false);
      expect(queuedProductEventCount()).toBe(0);
    } finally {
      setDemoAnalyticsSuppressed(false);
    }
    // ...and recording resumes when the demo ends.
    expect(recordProductEvent('app_opened')).toBe(true);
  });
});
