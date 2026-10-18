import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReminderDigest, localDay, remindersToday } from '../src/server/reminder-digest.js';
import { RECIPES } from '../src/data/recipes.js';

const NOW = new Date('2026-10-19T08:00:00Z'); // a Monday
const dinner = RECIPES[0];

describe('the morning digest', () => {
  it('reads days Monday-first, as the reminder form stores them', () => {
    expect(localDay(NOW, 'Europe/London')).toEqual({ day: '2026-10-19', weekday: 0 });
    const reminders = [
      { id: 'a', on: true, kind: 'meal', label: 'Lunch', times: ['13:00'], days: [0] },
      { id: 'b', on: true, kind: 'water', label: 'Water', times: ['10:00', '16:00'], days: [] },
      { id: 'c', on: true, kind: 'sleep', label: 'Sunday wind-down', times: ['22:00'], days: [6] },
      { id: 'd', on: false, kind: 'custom', label: 'Off', times: ['09:00'] },
    ];
    expect(remindersToday(reminders, 0)).toEqual([
      { time: '10:00', label: 'Water' },
      { time: '13:00', label: 'Lunch' },
      { time: '16:00', label: 'Water' },
    ]);
  });

  it('puts the day’s reminders, plan, list and use-soon food in one email', () => {
    const digest = buildReminderDigest({
      syncTimeZone: 'Europe/London',
      reminders: [{ id: 'a', on: true, kind: 'meal', label: 'Lunch', times: ['13:00'], days: [] }],
      plan: { '2026-10-19': { dinner: dinner.id } },
      shoppingList: [{ name: 'Milk' }, { name: 'Eggs', checked: true }],
      pantry: [{ name: 'Spinach', expiry: '2026-10-20' }, { name: 'Rice', expiry: '2027-01-01' }],
    }, { now: NOW, origin: 'https://forq.example' });
    expect(digest.subject).toBe('Today: 1 reminder · 1 meal planned');
    expect(digest.text).toContain('13:00 · Lunch');
    expect(digest.text).toContain(`Dinner: ${dinner.name}`);
    expect(digest.text).toContain('1 item still on the shopping list.');
    expect(digest.text).toContain('Use today or tomorrow: Spinach.');
    expect(digest.text).not.toContain('Rice');
    expect(digest.html).toContain('https://forq.example');
  });

  it('sends nothing on a day with nothing to say', () => {
    expect(buildReminderDigest({ reminders: [], plan: {}, shoppingList: [{ name: 'Milk' }] }, { now: NOW })).toBeNull();
  });
});

const db = vi.hoisted(() => ({ memberships: [], states: new Map(), outbox: [], sent: [] }));
vi.mock('../src/server/database.js', () => ({
  databaseConfigured: true,
  getDatabase: async () => ({
    collection: (name) => {
      if (name === 'memberships') return { find: (filter) => ({ toArray: async () => db.memberships.filter((m) => m.reminderDigest === filter.reminderDigest) }) };
      if (name === 'householdStates') return { findOne: async ({ householdId }) => db.states.get(householdId) || null };
      return {
        insertOne: async (doc) => {
          if (db.outbox.some((row) => row.dedupeKey === doc.dedupeKey)) throw Object.assign(new Error('dup'), { code: 11000 });
          db.outbox.push({ ...doc });
        },
        updateOne: async ({ dedupeKey }, { $set }) => Object.assign(db.outbox.find((row) => row.dedupeKey === dedupeKey), $set),
      };
    },
  }),
}));

const { GET: runJob } = await import('../src/app/api/jobs/reminders/route.js');
const call = (secret = 'cron-secret') => runJob(new Request('https://forq.example/api/jobs/reminders', { headers: { authorization: `Bearer ${secret}`, host: 'forq.example' } }));

describe('the daily job', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'Forq <hello@forq.example>';
    db.memberships.length = 0;
    db.states.clear();
    db.outbox.length = 0;
    db.sent.length = 0;
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { db.sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }));
    db.states.set('h1', { householdId: 'h1', state: { syncTimeZone: 'Europe/London', reminders: [{ id: 'a', on: true, label: 'Lunch', times: ['13:00'], days: [] }] } });
  });

  it('refuses a call without the cron secret', async () => {
    expect((await call('wrong-secret')).status).toBe(401);
  });

  it('emails only people who turned it on, once a day however often it runs', async () => {
    db.memberships.push(
      { householdId: 'h1', userId: 'u1', email: 'sam@example.com', reminderDigest: true },
      { householdId: 'h1', userId: 'u2', email: 'kim@example.com', reminderDigest: false },
    );
    expect(await (await call()).json()).toMatchObject({ sent: 1 });
    expect(db.sent.map((m) => m.to)).toEqual([['sam@example.com']]);
    expect(await (await call()).json()).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(db.sent).toHaveLength(1);
    expect(db.outbox[0]).toMatchObject({ status: 'sent', kind: 'digest' });
  });
});
