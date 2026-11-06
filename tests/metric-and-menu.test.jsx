import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { metricQty, metricRecipe, metricStep } from '../src/lib/recipe-metric.js';
import { menuAsText } from '../src/lib/plan-share.js';
import { setMyRecipes } from '../src/data/recipes.js';
import PlanSendMenu from '../src/components/PlanSendMenu.jsx';

describe('US measures in metric', () => {
  it('converts cups by density for dry goods and to ml for liquids', () => {
    expect(metricQty('2 cups', 'plain flour')).toBe('≈ 250 g');
    expect(metricQty('1/2 cup', 'sugar')).toBe('≈ 100 g');
    expect(metricQty('1 1/2 cups', 'long grain rice')).toBe('≈ 310 g');
    expect(metricQty('1 cup', 'chicken stock')).toBe('≈ 240 ml');
    expect(metricQty('1/2 cup', 'olive oil')).toBe('≈ 120 ml');
    expect(metricQty('1 cup', 'cheddar, grated')).toBe('≈ 115 g');
  });

  it('converts weights, sticks and quarts', () => {
    expect(metricQty('8 oz', 'cheddar')).toBe('≈ 225 g');
    expect(metricQty('1 lb', 'beef mince')).toBe('≈ 450 g');
    expect(metricQty('2.5 lbs', 'potatoes')).toBe('≈ 1.1 kg');
    expect(metricQty('1 stick', 'butter')).toBe('≈ 115 g');
    expect(metricQty('1 quart', 'stock')).toBe('≈ 950 ml');
  });

  it('leaves metric, spoons, counts and vague amounts as written', () => {
    for (const qty of ['400 g', '2 tbsp', '1 tsp', '1 tin', '3', 'a pinch', '', null]) {
      expect(metricQty(qty, 'anything')).toBeNull();
    }
  });

  it('gives oven temperatures in °C with the fan figure', () => {
    expect(metricStep('Heat the oven to 350°F. Bake 25 min.')).toBe('Heat the oven to 180°C (160°C fan). Bake 25 min.');
    expect(metricStep('Preheat to 425 degrees F and roast.')).toBe('Preheat to 220°C (200°C fan) and roast.');
    expect(metricStep('Oven 400F, then reduce.')).toBe('Oven 200°C (180°C fan), then reduce.');
    expect(metricStep('Bake at 180°C for 120 minutes, serves 4.')).toBe('Bake at 180°C for 120 minutes, serves 4.');
  });

  it('converts a recipe and says how much changed', () => {
    const recipe = {
      name: 'Cookies',
      ingredients: [{ name: 'Plain flour', qty: '2 cups' }, { name: 'Eggs', qty: '2' }],
      steps: [{ text: 'Heat oven to 375°F.' }, { text: 'Mix.' }],
    };
    const { recipe: metric, changed } = metricRecipe(recipe);
    expect(changed).toBe(2);
    expect(metric.ingredients[0]).toEqual({ name: 'Plain flour', qty: '≈ 250 g', qtyAsWritten: '2 cups' });
    expect(metric.ingredients[1]).toBe(recipe.ingredients[1]);
    expect(metric.steps[0].text).toBe('Heat oven to 190°C (170°C fan).');
    const metricOnly = { name: 'Soup', ingredients: [{ name: 'Leeks', qty: '500 g' }], steps: [{ text: 'Simmer.' }] };
    expect(metricRecipe(metricOnly)).toEqual({ recipe: metricOnly, changed: 0 });
  });
});

describe('the week menu as a message', () => {
  setMyRecipes([
    { id: 'm-pie', name: 'Fish pie', servings: 2, time: 30, costPerServing: 1, ingredients: [{ name: 'x', qty: '1' }] },
    { id: 'm-soup', name: 'Leek soup', servings: 2, time: 30, costPerServing: 1, ingredients: [{ name: 'x', qty: '1' }] },
  ]);
  const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
  const plan = { '2026-11-09': { dinner: 'm-pie', lunch: 'm-soup' }, '2026-11-11': { dinner: 'm-soup' } };

  it('lists dinners one line per day, skipping empty days', () => {
    expect(menuAsText(plan, dates, { slots: ['dinner'] })).toBe('Menu · Mon 9 Nov – Wed 11 Nov\n\nMon 9 Nov · Fish pie\nWed 11 Nov · Leek soup');
  });

  it('lists every meal by slot when asked', () => {
    expect(menuAsText(plan, dates)).toBe('Menu · Mon 9 Nov – Wed 11 Nov\n\nMon 9 Nov\n  Lunch: Leek soup\n  Dinner: Fish pie\n\nWed 11 Nov\n  Dinner: Leek soup');
  });

  it('is empty for an empty plan', () => {
    expect(menuAsText({}, dates)).toBe('');
  });

  describe('PlanSendMenu', () => {
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('copies the dinners where there is no share sheet', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      render(<PlanSendMenu plan={plan} dates={dates} />);
      fireEvent.click(screen.getByRole('button', { name: /Send this week's dinners/ }));
      expect(await screen.findByText('Menu copied')).toBeTruthy();
      expect(writeText).toHaveBeenCalledWith('Menu · Mon 9 Nov – Wed 11 Nov\n\nMon 9 Nov · Fish pie\nWed 11 Nov · Leek soup');
    });

    it('stays out of the way with nothing planned', () => {
      const { container } = render(<PlanSendMenu plan={{}} dates={dates} />);
      expect(container.textContent).toBe('');
    });
  });
});

describe('metric toggle on the ingredient list', () => {
  afterEach(cleanup);
  it('offers the switch only when there is something to convert', async () => {
    const { default: RecipeIngredients } = await import('../src/components/RecipeIngredients.jsx');
    const recipe = { id: 'c', name: 'Cookies', servings: 2, ingredients: [{ name: 'Plain flour', qty: '≈ 250 g', qtyAsWritten: '2 cups' }] };
    const props = {
      app: { householdAccess: { shopping: true }, prefs: {} }, recipe, original: recipe, servings: 2, setServings: () => {},
      missing: [], havePantry: 1, has: () => true, addedMissingKey: null, missingKey: '', addMissing: () => {},
      dislikeSwaps: [], onSwapDislike: () => {}, pantryRead: () => ({}),
    };
    const toggle = vi.fn();
    const { rerender } = render(<RecipeIngredients {...props} metric={{ on: true, toggle }} />);
    const button = screen.getByRole('button', { name: /Showing metric/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalled();
    expect(screen.getByText('≈ 250 g')).toBeTruthy();
    rerender(<RecipeIngredients {...props} metric={null} />);
    expect(screen.queryByRole('button', { name: /metric/ })).toBeNull();
  });
});
