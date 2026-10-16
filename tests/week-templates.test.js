import { describe, it, expect } from 'vitest';
import { planActions } from '../src/lib/plan-actions.js';

/** Drive the real store slice the way useStoreApi composes it. */
const drivePlans = (state) => {
  const ref = { state };
  const actions = planActions((patch) => {
    const changes = typeof patch === 'function' ? patch(ref.state) : patch;
    ref.state = { ...ref.state, ...changes };
  });
  return { state: () => ref.state, run: (name, ...args) => actions[name](...args) };
};
import {
  weekdayIndex,
  snapshotWeekToTemplate,
  applyWeekTemplate,
  validateTemplateName,
  summariseWeekTemplate,
  MAX_WEEK_TEMPLATES,
} from '../src/lib/week-templates.js';

// 2026-08-31 is a Monday; the week helper dates below are Mon..Sun.
const WEEK = [
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-04', '2026-09-05', '2026-09-06',
];
const PLAN = {
  '2026-08-31': { breakfast: 'oats', dinner: 'r-mon' },
  '2026-09-02': { lunch: 'soup', dinner: 'r-wed' },
};

describe('week templates', () => {
  it('maps dates to Monday-first weekday slots', () => {
    expect(weekdayIndex('2026-08-31')).toBe(0); // Monday
    expect(weekdayIndex('2026-09-02')).toBe(2); // Wednesday
    expect(weekdayIndex('2026-09-06')).toBe(6); // Sunday
    expect(weekdayIndex('not-a-date')).toBeNull();
  });

  it('snapshots a week into weekday slots with a meal count', () => {
    const { template, error } = snapshotWeekToTemplate(PLAN, WEEK, 'Term-time');
    expect(error).toBeUndefined();
    expect(template.name).toBe('Term-time');
    expect(template.mealCount).toBe(4);
    expect(template.days[0]).toEqual({ breakfast: 'oats', dinner: 'r-mon' });
    expect(template.days[2]).toEqual({ lunch: 'soup', dinner: 'r-wed' });
    expect(template.days[1]).toEqual({});
    expect(template.id).toMatch(/^wt/);
  });

  it('refuses an empty name and an empty week', () => {
    expect(snapshotWeekToTemplate(PLAN, WEEK, '  ').error).toMatch(/name/);
    expect(snapshotWeekToTemplate({}, WEEK, 'Empty').error).toMatch(/no planned meals/);
  });

  it('applies onto any week, never overwriting decided slots', () => {
    const { template } = snapshotWeekToTemplate(PLAN, WEEK, 'Term-time');
    const nextWeek = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
    const current = { '2026-09-07': { dinner: 'already-decided' }, '2026-09-09': { lunch: 'kept' } };
    const { entries, count } = applyWeekTemplate(current, template, nextWeek);
    // Monday dinner kept, Monday breakfast still lands; Wednesday lunch kept, dinner lands.
    expect(count).toBe(2);
    expect(entries).toContainEqual({ date: '2026-09-07', slot: 'breakfast', recipeId: 'oats' });
    expect(entries).toContainEqual({ date: '2026-09-09', slot: 'dinner', recipeId: 'r-wed' });
    expect(entries.some((e) => e.date === '2026-09-07' && e.slot === 'dinner')).toBe(false);
  });

  it('applies nothing when the week already holds every slot', () => {
    const { template } = snapshotWeekToTemplate(PLAN, WEEK, 'Term-time');
    const full = {
      '2026-09-07': { breakfast: 'x', dinner: 'y' },
      '2026-09-09': { lunch: 'x', dinner: 'y' },
    };
    const nextWeek = ['2026-09-07', '2026-09-09'];
    expect(applyWeekTemplate(full, template, nextWeek).count).toBe(0);
  });

  it('treats a missing or malformed template as empty, not an error', () => {
    expect(applyWeekTemplate({}, null, WEEK)).toEqual({ entries: [], count: 0 });
    expect(applyWeekTemplate({}, { days: 'nope' }, WEEK)).toEqual({ entries: [], count: 0 });
  });

  it('validates names: blank, too long, and case-insensitive clashes', () => {
    const existing = [{ name: 'Term-time' }];
    expect(validateTemplateName('  ', existing)).toMatch(/name/);
    expect(validateTemplateName('x'.repeat(41), existing)).toMatch(/40|under/);
    expect(validateTemplateName('term-TIME', existing)).toMatch(/already/);
    expect(validateTemplateName('Batch week', existing)).toBeNull();
  });

  it('summarises counts and the weekday span honestly', () => {
    const { template } = snapshotWeekToTemplate(PLAN, WEEK, 'Term-time');
    expect(summariseWeekTemplate(template)).toBe('1 breakfast · 1 lunch · 2 dinners (Mon–Wed)');
    expect(summariseWeekTemplate(null)).toBe('No meals');
  });

  it('exports the shelf cap the store enforces', () => {
    expect(MAX_WEEK_TEMPLATES).toBe(20);
  });
});

describe('week template store actions', () => {
  const state = () => ({ plan: PLAN, weekTemplates: [], householdLedger: [] });

  it('saves the visible week under the given name', () => {
    const app = drivePlans(state());
    const result = app.run('saveWeekTemplate', { name: 'Term-time', dates: WEEK });
    expect(result.ok).toBe(true);
    expect(app.state().weekTemplates).toHaveLength(1);
    expect(app.state().weekTemplates[0].name).toBe('Term-time');
    expect(app.state().weekTemplates[0].days[0].dinner).toBe('r-mon');
  });

  it('rejects a duplicate name and an empty week without writing', () => {
    const app = drivePlans(state());
    app.run('saveWeekTemplate', { name: 'Term-time', dates: WEEK });
    expect(app.run('saveWeekTemplate', { name: 'term-time', dates: WEEK }).ok).toBe(false);
    expect(app.run('saveWeekTemplate', { name: 'Empty', dates: ['2026-09-14'] }).ok).toBe(false);
    expect(app.state().weekTemplates).toHaveLength(1);
  });

  it('renames and deletes, with clash protection', () => {
    const app = drivePlans(state());
    app.run('saveWeekTemplate', { name: 'Term-time', dates: WEEK });
    app.run('saveWeekTemplate', { name: 'Batch week', dates: WEEK });
    const [first] = app.state().weekTemplates;
    expect(app.run('renameWeekTemplate', { id: first.id, name: 'Batch week' }).ok).toBe(false);
    expect(app.run('renameWeekTemplate', { id: first.id, name: 'Autumn' }).ok).toBe(true);
    expect(app.state().weekTemplates[0].name).toBe('Autumn');
    app.run('deleteWeekTemplate', first.id);
    expect(app.state().weekTemplates).toHaveLength(1);
  });

  it('holds the shelf at twenty templates', () => {
    const app = drivePlans(state());
    for (let i = 0; i < MAX_WEEK_TEMPLATES; i += 1) {
      expect(app.run('saveWeekTemplate', { name: `Week ${i}`, dates: WEEK }).ok).toBe(true);
    }
    const full = app.run('saveWeekTemplate', { name: 'One more', dates: WEEK });
    expect(full.ok).toBe(false);
    expect(full.error).toMatch(/full/);
    expect(app.state().weekTemplates).toHaveLength(MAX_WEEK_TEMPLATES);
  });
});
