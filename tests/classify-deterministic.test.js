import { describe, expect, it } from 'vitest';
import {
  classifyAiRequest, deterministicAnswer, deterministicProductCategory,
  deterministicRecipeLineKind, deterministicRecipeMeal, firstLineIsTitle,
} from '../src/server/classify-deterministic.js';
import {
  PRODUCT_LABEL_TO_AISLE, PRODUCT_TAXONOMY, RECIPE_LINE_TAXONOMY,
  RECIPE_MEAL_TAXONOMY, aisleForProductLabel, isLabel,
} from '../src/server/classify-taxonomies.js';
import { AISLE_ORDER } from '../src/data/stores.js';

/**
 * The labelled corpus for the rules layer. Every case names the label it must
 * produce; a rule that drifts shows up here as a failing label, not as a
 * mysteriously wrong aisle months later.
 */

describe('deterministicProductCategory — labelled', () => {
  const cases = [
    ['bananas', 'produce'],
    ['2 avocados', 'produce'],
    ['cherry tomatoes', 'produce'],
    ['chicken breast fillets', 'meat-fish'],
    ['smoked salmon', 'meat-fish'],
    ['semi-skimmed milk', 'dairy'],
    ['mature cheddar', 'dairy'],
    ['free range eggs', 'dairy'],
    ['sourdough loaf', 'bakery'],
    ['wholemeal wraps', 'bakery'],
    ['frozen peas', 'frozen'],
    ['vanilla ice cream', 'frozen'],
    ['baked beans', 'pantry'],
    ['wholewheat pasta', 'pantry'],
    ['plain flour', 'pantry'],
    ['olive oil', 'pantry'],
    ['peanut butter', 'pantry'],
    ['orange juice', 'drinks'],
    ['sparkling water', 'drinks'],
    ['tea bags', 'drinks'],
    ['washing up liquid', 'household'],
    ['bin bags', 'household'],
    ['toilet roll', 'household'],
    ['shampoo', 'personal-care'],
    ['toothpaste', 'personal-care'],
  ];

  for (const [name, label] of cases) {
    it(`labels "${name}" as ${label}`, () => {
      const hit = deterministicProductCategory(name);
      expect(hit, `no rule matched "${name}"`).not.toBeNull();
      expect(hit.label).toBe(label);
      expect(isLabel('product', hit.label)).toBe(true);
      expect(hit.confidence).toBeGreaterThanOrEqual(0.6);
    });
  }

  it('returns nothing rather than guessing for a name no rule knows', () => {
    expect(deterministicProductCategory('blorp')).toBeNull();
    expect(deterministicProductCategory('')).toBeNull();
    expect(deterministicProductCategory('x')).toBeNull();
  });

  it('only ever returns a label from the product taxonomy', () => {
    for (const [name] of cases) {
      expect(PRODUCT_TAXONOMY).toContain(deterministicProductCategory(name).label);
    }
  });
});

describe('product labels map onto the app’s own aisle order', () => {
  it('files every label somewhere the shopping list already walks', () => {
    for (const label of PRODUCT_TAXONOMY) {
      expect(AISLE_ORDER).toContain(aisleForProductLabel(label));
    }
    expect(Object.keys(PRODUCT_LABEL_TO_AISLE).sort()).toEqual([...PRODUCT_TAXONOMY].sort());
  });

  it('files an unknown label under Other rather than inventing an aisle', () => {
    expect(aisleForProductLabel('livestock')).toBe('Other');
    expect(aisleForProductLabel(undefined)).toBe('Other');
  });

  it('maps the obvious ones one-to-one', () => {
    expect(aisleForProductLabel('produce')).toBe('Fruit & veg');
    expect(aisleForProductLabel('meat-fish')).toBe('Meat & fish');
    expect(aisleForProductLabel('dairy')).toBe('Dairy & eggs');
    expect(aisleForProductLabel('bakery')).toBe('Bakery');
  });
});
describe('deterministicRecipeMeal — labelled', () => {
  const cases = [
    ['porridge with berries', 'breakfast'],
    ['scrambled eggs on toast', 'breakfast'],
    ['chicken salad wrap', 'lunch'],
    ['tomato soup and a roll', 'lunch'],
    ['spaghetti bolognese', 'dinner'],
    ['chicken curry', 'dinner'],
    ['sticky toffee pudding', 'dessert'],
    ['chocolate brownies', 'dessert'],
    ['oat flapjacks', 'snack'],
    ['hummus and crisps', 'snack'],
    ['roast potatoes', 'side'],
    ['classic coleslaw', 'side'],
    ['homemade lemonade', 'drink'],
  ];

  for (const [name, label] of cases) {
    it(`reads "${name}" as ${label}`, () => {
      const hit = deterministicRecipeMeal(name);
      expect(hit, `no meal rule matched "${name}"`).not.toBeNull();
      expect(hit.label).toBe(label);
      expect(RECIPE_MEAL_TAXONOMY).toContain(hit.label);
    });
  }

  it('returns nothing for a dish it has no evidence about', () => {
    expect(deterministicRecipeMeal('the special')).toBeNull();
    expect(deterministicRecipeMeal('')).toBeNull();
  });
});

describe('deterministicRecipeLineKind — labelled', () => {
  const cases = [
    ['Serves 4', 'metadata'],
    ['Prep time: 10 mins', 'metadata'],
    ['Ingredients', 'metadata'],
    ['Method', 'metadata'],
    ['400 g', 'quantity'],
    ['2', 'quantity'],
    ['200 g spaghetti', 'ingredient'],
    ['1 tbsp olive oil', 'ingredient'],
    ['2 eggs', 'ingredient'],
    ['2 tins chopped tomatoes', 'ingredient'],
    ['Heat the oven to 200C.', 'instruction'],
    ['Stir until the sauce thickens.', 'instruction'],
    ['https://example.com/some-recipe', 'noise'],
    ['Advertisement', 'noise'],
  ];

  for (const [line, label] of cases) {
    it(`labels "${line}" as ${label}`, () => {
      const hit = deterministicRecipeLineKind(line);
      expect(hit, `no line rule matched "${line}"`).not.toBeNull();
      expect(hit.label).toBe(label);
      expect(RECIPE_LINE_TAXONOMY).toContain(hit.label);
    });
  }

  it('leaves a line it cannot place unlabelled, for the adapter to escalate', () => {
    expect(deterministicRecipeLineKind('Creamy Tomato Pasta')).toBeNull();
  });

  it('calls the first line of a real recipe its title', () => {
    const lines = ['Creamy Tomato Pasta', '200 g spaghetti', 'Heat the pan.'];
    expect(firstLineIsTitle(lines[0], lines)).toMatchObject({ label: 'title' });
  });

  it('does not call the first line a title when a stronger rule already claims it', () => {
    expect(firstLineIsTitle('400 g', ['400 g', '2 eggs', 'Heat the pan.'])).toBeNull();
    expect(firstLineIsTitle('Heat the oven.', ['Heat the oven.', '2 eggs', 'Stir.'])).toBeNull();
  });

  it('does not call a two-line scrap a recipe with a title', () => {
    expect(firstLineIsTitle('Creamy Tomato Pasta', ['Creamy Tomato Pasta', '200 g spaghetti'])).toBeNull();
  });
});
describe('classifyAiRequest — deterministic routing before any model', () => {
  it('routes an aisle question to the rules and answers it without a model', () => {
    const routed = classifyAiRequest({ task: 'shopping', prompt: 'What aisle do oats go in?' });
    expect(routed).toMatchObject({ route: 'deterministic', intent: 'product-category', subject: 'oats' });
    const answer = deterministicAnswer(routed);
    expect(answer).toContain('pantry');
    expect(answer).toContain('Tins & dry');
  });

  it('routes a meal-slot question to the rules and answers it without a model', () => {
    const routed = classifyAiRequest({ task: 'recipe', prompt: 'Which meal is porridge?' });
    expect(routed).toMatchObject({ route: 'deterministic', intent: 'recipe-meal', subject: 'porridge' });
    expect(deterministicAnswer(routed)).toContain('breakfast');
  });

  it('answers from context when the task names the taxonomy', () => {
    const routed = classifyAiRequest({
      task: 'pantry', prompt: 'Please classify this item', context: { item: 'bin bags' },
    });
    expect(routed.subject).toBe('bin bags');
    expect(deterministicAnswer(routed)).toContain('household');
  });

  it('hands an item no rule can place straight to the assistant, never promising a deterministic answer', () => {
    const routed = classifyAiRequest({ task: 'shopping', prompt: 'What aisle does blorp go in?' });
    expect(routed.route).toBe('llm');
    expect(deterministicAnswer(routed)).toBeNull();
  });

  it('never names a subject it cannot reduce to something matchable', () => {
    const routed = classifyAiRequest({ task: 'shopping', prompt: 'What aisle should I use?' });
    expect(routed.route).toBe('llm');
  });

  it('leaves an ordinary assistant question to the assistant', () => {
    expect(classifyAiRequest({ task: 'meal-plan', prompt: 'Plan my week' }))
      .toMatchObject({ route: 'llm', intent: 'assistant', guard: null });
    expect(classifyAiRequest({ task: 'budget', prompt: 'Where is my money going?' }).route).toBe('llm');
  });
});

describe('the medical guard — the classifier is never the authority', () => {
  const medical = [
    'Is this safe to eat if I have a nut allergy?',
    'Which aisle is safe for a coeliac?',
    'How much iron do I need with my medication?',
    'I am pregnant — can I eat this cheese?',
    'My doctor said to watch my blood pressure. What should I buy?',
    'Is this chicken still safe after two days?',
  ];

  for (const prompt of medical) {
    it(`never routes "${prompt}" to the classifier`, () => {
      const routed = classifyAiRequest({ task: 'shopping', prompt });
      expect(routed.route).toBe('llm');
      expect(routed.guard).toBe('medical');
      expect(routed.intent).toBe('health-interpretation');
    });
  }

  it('lets the medical guard win even when the question looks like an aisle lookup', () => {
    const routed = classifyAiRequest({
      task: 'pantry',
      prompt: 'What aisle for milk if my child has a dairy intolerance?',
      context: { item: 'milk' },
    });
    expect(routed.route).toBe('llm');
    expect(routed.guard).toBe('medical');
  });

  it('does not treat ordinary food talk as a medical question', () => {
    expect(classifyAiRequest({ task: 'recipe', prompt: 'Which meal is chicken curry?' }).guard).toBeNull();
    expect(classifyAiRequest({ task: 'shopping', prompt: 'What aisle do baked beans go in?' }).route).toBe('deterministic');
  });
});