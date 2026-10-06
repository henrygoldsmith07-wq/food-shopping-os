import { describe, it, expect } from 'vitest';
import { buildSafeAiContext, sanitiseAiContext, AI_CONTEXT_KEYS } from '../src/lib/ai-context.js';
import { aiRequestSchema } from '../src/server/schemas.js';

describe('AI context boundary', () => {
  it('builds only meal names, pantry items and list gaps', () => {
    const ctx = buildSafeAiContext({
      plan: { '2026-07-28': { dinner: 'chicken-traybake' } },
      pantry: [{ name: 'Olive oil' }, { name: 'Rice' }],
      shoppingList: [{ name: 'Milk', checked: false }, { name: 'Done', checked: true }],
      body: { weightKg: 80 },
      measurements: [{ weightKg: 80 }],
      log: { '2026-07-28': [{ name: 'Cake' }] },
    });
    expect(Object.keys(ctx).sort()).toEqual([...AI_CONTEXT_KEYS].sort());
    expect(ctx.mealNames).toContain('chicken-traybake');
    expect(ctx.pantryItems).toContain('Olive oil');
    expect(ctx.listGaps).toContain('Milk');
    expect(ctx.listGaps).not.toContain('Done');
    expect(JSON.stringify(ctx)).not.toMatch(/weightKg|80/);
  });

  it('rejects health fields in sanitiseAiContext', () => {
    expect(() => sanitiseAiContext({ mealNames: [], body: {} })).toThrow(/health fields/);
    expect(() => sanitiseAiContext({ pantryItems: [], allergies: ['milk'] })).toThrow(/health fields/);
    const { context, dropped } = sanitiseAiContext({ mealNames: ['a'], pantryItems: [], listGaps: [], extra: 1 });
    expect(context).toEqual({ mealNames: ['a'], pantryItems: [], listGaps: [] });
    expect(dropped).toContain('extra');
  });

  it('rejects health fields at the API schema', () => {
    const bad = aiRequestSchema.safeParse({
      task: 'shopping', prompt: 'hi', context: { mealNames: [], body: {} },
    });
    expect(bad.success).toBe(false);
    const good = aiRequestSchema.safeParse({
      task: 'shopping', prompt: 'hi', context: { mealNames: ['a'], pantryItems: ['b'], listGaps: [] },
    });
    expect(good.success).toBe(true);
  });
});
