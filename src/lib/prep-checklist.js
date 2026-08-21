/**
 * Weekly prep checklist (Mealime / Paprika style) derived from the meal plan.
 * Pure: no I/O.
 */
import { planDishes, planEntries } from './mealplan.js';

/**
 * Build actionable prep steps for a date range.
 * @returns {Array<{ id: string, label: string, detail?: string, kind: string }>}
 */
export function prepChecklist(plan = {}, dates = [], { shop = true } = {}) {
  const entries = planEntries(plan, dates);
  if (!entries.length) return [];

  const steps = [];
  if (shop) {
    steps.push({
      id: 'shop',
      kind: 'shop',
      label: 'Do the shop for this plan',
      detail: `${entries.length} meal slot${entries.length === 1 ? '' : 's'} planned`,
    });
  }

  const dishes = planDishes(plan, dates);
  // Batch cooks first (same dish ≥2 times)
  dishes
    .filter((d) => d.slots.length >= 2)
    .forEach((d) => {
      const days = d.slots.map((s) => s.date.slice(8, 10)).join(', ');
      steps.push({
        id: `batch-${d.recipe.id}`,
        kind: 'batch',
        label: `Batch cook ${d.recipe.name}`,
        detail: `Serves ${d.slots.length} slots (days ${days}) · ~${d.recipe.time} min`,
      });
    });

  // Single cooks by day order
  const seen = new Set(dishes.filter((d) => d.slots.length >= 2).map((d) => d.recipe.id));
  entries.forEach(({ date, slot, recipe }) => {
    if (seen.has(recipe.id)) return;
    seen.add(recipe.id);
    steps.push({
      id: `cook-${recipe.id}-${date}-${slot}`,
      kind: 'cook',
      label: `Cook ${recipe.name}`,
      detail: `${date} · ${slot} · ${recipe.time} min`,
    });
  });

  steps.push({
    id: 'leftovers',
    kind: 'leftovers',
    label: 'Label leftovers with a use-by',
    detail: 'Keeps the fridge honest and the plan accurate',
  });

  return steps;
}

export function prepProgress(checklist = [], doneIds = []) {
  const done = new Set(doneIds);
  const total = checklist.length;
  const complete = checklist.filter((s) => done.has(s.id)).length;
  return { total, complete, pct: total ? Math.round((complete / total) * 100) : 0 };
}
