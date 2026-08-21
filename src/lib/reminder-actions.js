/**
 * The store's reminder actions, kept beside the rest of the reminder code.
 *
 * A reminder is validated on the way in — times normalised, days deduplicated,
 * label trimmed — so everything reading them can assume a clean shape. Ticking
 * one off records the single firing it was, not the reminder, so tomorrow's
 * arrives as it should.
 */

import { DEFAULT_TEXT, kindBy, MAX_REMINDERS } from '../data/reminders.js';
import { cleanTimes, slotKey } from './reminders.js';
import { uid } from './state.js';

/** Old ticks are noise; a fortnight is more than enough to answer "done?". */
const KEEP_DONE_DAYS = 14;

const prune = (done, today) => {
  const cutoff = new Date(`${today}T12:00:00`).getTime() - KEEP_DONE_DAYS * 86400000;
  return Object.fromEntries(
    Object.entries(done).filter(([key]) => new Date(`${key.slice(0, 10)}T12:00:00`).getTime() >= cutoff),
  );
};

const clean = (draft, fallbackKind = 'custom') => {
  const kind = kindBy[draft.kind] ? draft.kind : fallbackKind;
  return {
    kind,
    label: String(draft.label || '').trim().slice(0, 60) || DEFAULT_TEXT[kind],
    times: cleanTimes(draft.times),
    days: [...new Set((draft.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b),
    on: draft.on !== false,
  };
};

export const reminderActions = (set) => ({
  addReminder: (draft) =>
    set((s) => {
      const reminder = clean(draft);
      // A reminder with no times or no days would never go off; saying no is
      // kinder than storing something that quietly does nothing.
      if (!reminder.times.length || !reminder.days.length) return {};
      if (s.reminders.length >= MAX_REMINDERS) return {};
      return { reminders: [...s.reminders, { id: uid('r'), snoozeUntil: 0, ...reminder }] };
    }),
  updateReminder: (id, patch) =>
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...clean({ ...r, ...patch }, r.kind) } : r)),
    })),
  removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
  toggleReminder: (id) =>
    set((s) => ({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, on: !r.on } : r)) })),

  /** Ticking off one firing — today's 13:00, not every 13:00 from now on. */
  completeReminder: (id, stamp, time) =>
    set((s) => ({
      reminderDone: prune({ ...s.reminderDone, [slotKey({ id }, stamp, time)]: true }, s.day),
    })),
  /** Snoozing pauses the whole reminder briefly; its firings stay untouched. */
  snoozeReminder: (id, minutes) =>
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id
        ? { ...r, snoozeUntil: Date.now() + Math.max(1, Number(minutes) || 10) * 60000 }
        : r)),
    })),
  /** Adopt a suggestion the app made from your own records. */
  addSuggestedReminders: (list = []) =>
    set((s) => {
      const room = Math.max(0, MAX_REMINDERS - s.reminders.length);
      const fresh = list.slice(0, room)
        .map((suggested) => ({ id: uid('r'), createdAt: Date.now(), snoozeUntil: 0, ...clean(suggested) }))
        .filter((r) => r.times.length && r.days.length);
      return fresh.length ? { reminders: [...s.reminders, ...fresh] } : {};
    }),
  /** Marks how far the catch-up has been read to. */
  markRemindersSeen: () => set({ lastSeenAt: Date.now() }),
});
