/**
 * Named week templates — save a good week, replay it later.
 *
 * Repeating last week covers the common case, but a household's best answer
 * is often not *last* week: the cheap term-time week, the batch-cook week,
 * the in-laws-are-visiting week. A template snapshots one week's plan as
 * seven weekday slots (Monday-first), so it can be laid onto any future
 * week. Applying never overwrites a slot the week already holds — the same
 * promise repeat-last-week makes — and locked meals stay locked, because the
 * apply path reuses applyPlanEntries() which already filters them.
 *
 * Pure + offline. Templates hold recipe ids, never recipe copies: a dish you
 * later delete from My recipes simply leaves an empty slot, never a ghost.
 */

export const WEEK_TEMPLATE_SLOTS = ['breakfast', 'lunch', 'dinner'];
export const MAX_WEEK_TEMPLATES = 20;
export const MAX_TEMPLATE_NAME = 40;

/** Monday-first weekday index for a YYYY-MM-DD date. */
export const weekdayIndex = (date) => {
  const day = new Date(`${date}T12:00:00`).getDay();
  if (!Number.isInteger(day)) return null;
  return (day + 6) % 7;
};

const cleanId = (value) => (typeof value === 'string' && value ? value : null);

/**
 * Snapshot the given dates into a template. Only real slots are kept; an
 * empty week is not a template. Returns { template } or { error }.
 */
export const snapshotWeekToTemplate = (plan = {}, dates = [], name = '', { at = Date.now() } = {}) => {
  const trimmed = String(name || '').trim().slice(0, MAX_TEMPLATE_NAME);
  if (!trimmed) return { error: 'Give the template a name first.' };
  const days = Array.from({ length: 7 }, () => ({}));
  let meals = 0;
  for (const date of dates || []) {
    const index = weekdayIndex(date);
    if (index == null) continue;
    const day = plan?.[date] || {};
    for (const slot of WEEK_TEMPLATE_SLOTS) {
      const recipeId = cleanId(day[slot]);
      if (recipeId) {
        days[index][slot] = recipeId;
        meals += 1;
      }
    }
  }
  if (!meals) return { error: 'This week has no planned meals to save yet.' };
  return {
    template: {
      id: `wt${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: at,
      days,
      mealCount: meals,
    },
  };
};

/**
 * Lay a template onto dates. Slots the week already holds are skipped, so
 * the honest count says only what actually moved. Returns { entries, count }.
 */
export const applyWeekTemplate = (plan = {}, template = null, dates = []) => {
  const days = Array.isArray(template?.days) ? template.days : [];
  const entries = [];
  for (const date of dates || []) {
    const index = weekdayIndex(date);
    if (index == null) continue;
    const source = days[index] || {};
    for (const slot of WEEK_TEMPLATE_SLOTS) {
      const recipeId = cleanId(source[slot]);
      if (recipeId && !plan?.[date]?.[slot]) entries.push({ date, slot, recipeId });
    }
  }
  return { entries, count: entries.length };
};

export const validateTemplateName = (name = '', existing = []) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Give the template a name first.';
  if (trimmed.length > MAX_TEMPLATE_NAME) return `Keep the name under ${MAX_TEMPLATE_NAME} characters.`;
  const clash = (existing || []).some(
    (t) => String(t?.name || '').trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return 'There is already a template with that name.';
  return null;
};

/** "6 dinners · 2 lunches" plus the weekday span, for the template row. */
export const summariseWeekTemplate = (template = null) => {
  const days = Array.isArray(template?.days) ? template.days : [];
  const counts = { breakfast: 0, lunch: 0, dinner: 0 };
  const weekdays = [];
  days.forEach((day, index) => {
    let touched = false;
    for (const slot of WEEK_TEMPLATE_SLOTS) {
      if (cleanId(day?.[slot])) {
        counts[slot] += 1;
        touched = true;
      }
    }
    if (touched) weekdays.push(index);
  });
  const parts = WEEK_TEMPLATE_SLOTS
    .filter((slot) => counts[slot])
    .map((slot) => `${counts[slot]} ${slot}${counts[slot] === 1 ? '' : 's'}`);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const span = weekdays.length
    ? `${names[weekdays[0]]}${weekdays.length > 1 ? `–${names[weekdays[weekdays.length - 1]]}` : ''}`
    : null;
  const total = parts.length ? parts.join(' · ') : 'No meals';
  return span ? `${total} (${span})` : total;
};
