/**
 * The week's menu as a message: what Plan to Eat and Mealime call sharing
 * the meal plan. Plain text, one day per block, so it reads the same in a
 * family group chat, a text or a note on the fridge.
 */

import { planEntries } from './mealplan.js';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner'];

const dayLabel = (date) => new Date(`${date}T12:00:00Z`)
  .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * "Menu · Mon 9 Nov – Sun 15 Nov" then each planned day with its meals.
 * Empty days are left out; an empty plan gives ''.
 *
 * @param {Record<string, Record<string, string>>} plan
 * @param {string[]} dates the days shown (a week or a month)
 * @param {{ slots?: string[] }} [options] which meals to include (default all)
 */
export const menuAsText = (plan, dates, { slots = SLOT_ORDER } = {}) => {
  const days = Array.isArray(dates) ? dates : [];
  const byDate = new Map();
  for (const entry of planEntries(plan || {}, days)) {
    if (!slots.includes(entry.slot)) continue;
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  if (!byDate.size) return '';
  const blocks = days.filter((date) => byDate.has(date)).map((date) => {
    const meals = byDate.get(date)
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
      .map((entry) => (slots.length === 1 ? entry.recipe.name : `${SLOT_LABEL[entry.slot] || entry.slot}: ${entry.recipe.name}`));
    return slots.length === 1 ? `${dayLabel(date)} · ${meals.join(', ')}` : [dayLabel(date), ...meals.map((m) => `  ${m}`)].join('\n');
  });
  const heading = `Menu · ${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`;
  return `${heading}\n\n${blocks.join(slots.length === 1 ? '\n' : '\n\n')}`;
};
