import { afterEach, describe, expect, it } from 'vitest';
import {
  aiUsageId, aiUsageSummary, monthlyAiLimit, reclaimAiReservations, reserveAiBudget, tokenReservation,
} from '../src/server/ai-budget.js';

describe('AI household budget', () => {
  afterEach(() => { delete process.env.AI_MONTHLY_TOKEN_LIMIT; });

  it('keeps the estimate conservative so the database ceiling can reject it', () => {
    expect(monthlyAiLimit()).toBe(250000);
    process.env.AI_MONTHLY_TOKEN_LIMIT = '50000';
    expect(monthlyAiLimit()).toBe(50000);
    expect(tokenReservation({ prompt: 'hello' }, 1200, 500)).toBeGreaterThan(1200);
    expect(tokenReservation({ prompt: 'x'.repeat(50000) }, 1200, 500)).toBeGreaterThan(50000);
  });

  it('summarises used, in-flight and remaining tokens without going negative', () => {
    process.env.AI_MONTHLY_TOKEN_LIMIT = '1000';
    const date = new Date('2026-08-01T12:00:00Z');
    expect(aiUsageId('household-1', date)).toBe('household-1:2026-08');
    expect(aiUsageSummary({ used: 700, reserved: 400 }, date)).toEqual({
      month: '2026-08', used: 700, reserved: 400, limit: 1000, remaining: 0,
    });
    expect(aiUsageSummary(null, date).remaining).toBe(1000);
    expect(aiUsageSummary({ used: 700, reserved: 400, reservationExpiresAt: '2026-08-01T11:00:00Z' }, date).reserved).toBe(0);
    expect(aiUsageSummary({
      used: 100,
      reserved: 900,
      reservations: {
        live: { tokens: 250, expiresAt: '2026-08-01T12:15:00Z' },
        expired: { tokens: 650, expiresAt: '2026-08-01T11:00:00Z' },
      },
    }, date).reserved).toBe(250);
  });

  it('rejects an oversized request before touching the database', async () => {
    process.env.AI_MONTHLY_TOKEN_LIMIT = '1000';
    await expect(reserveAiBudget('household-1', 1001)).rejects.toMatchObject({ status: 429 });
  });

  it('reclaims expired reservations without removing a newer live lease', async () => {
    const calls = [];
    const updatedAt = new Date('2026-08-01T11:50:00Z');
    const db = { collection: () => ({
      findOne: async () => ({
        _id: 'household-1:2026-08',
        householdId: 'household-1',
        reserved: 750,
        reservationVersion: 4,
        updatedAt,
        reservations: {
          live: { tokens: 250, expiresAt: '2026-08-01T12:15:00Z' },
          expired: { tokens: 500, expiresAt: '2026-08-01T11:00:00Z' },
        },
      }),
      updateOne: async (...args) => calls.push(args),
    }) };
    const date = new Date('2026-08-01T12:00:00Z');
    await reclaimAiReservations(db, 'household-1', date);
    expect(calls[0][0]._id).toBe('household-1:2026-08');
    expect(calls[0][0].reservationVersion).toBe(4);
    expect(calls[0][1].$set).toMatchObject({ reserved: 250, reservationExpiresAt: new Date('2026-08-01T12:15:00Z') });
    expect(calls[0][1].$inc.used).toBe(500);
    expect(calls[0][1].$set.reservations).toEqual({
      live: { tokens: 250, expiresAt: '2026-08-01T12:15:00Z' },
    });
  });

  it('migrates an active legacy aggregate into an opaque lease', async () => {
    const calls = [];
    const db = { collection: () => ({
      findOne: async () => ({
        _id: 'household-1:2026-08', householdId: 'household-1', reserved: 300,
        reservationExpiresAt: '2026-08-01T12:10:00Z', reservationVersion: 2,
        updatedAt: new Date('2026-08-01T11:55:00Z'),
      }),
      updateOne: async (...args) => calls.push(args),
    }) };
    await reclaimAiReservations(db, 'household-1', new Date('2026-08-01T12:00:00Z'));
    expect(calls[0][1].$set.reservations.legacy.tokens).toBe(300);
    expect(calls[0][1].$set.reserved).toBe(300);
  });
});
