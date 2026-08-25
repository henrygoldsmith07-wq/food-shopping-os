import { describe, expect, it } from 'vitest';
import {
  inventorySummary, MAX_ROWS, parseInventoryLine, parseInventoryText, splitInventoryText,
  toPantryItem,
} from '../src/lib/kitchen-inventory.js';
import { amountConfidence, pantryAvailability, pantryTruthForNeed } from '../src/lib/kitchen.js';
import {
  INVENTORY_SYSTEM, MAX_LINES, parseInventoryList,
} from '../src/server/inventory-extract.js';

const rowFor = (line) => parseInventoryLine(line);
const names = (rows) => rows.map((row) => row.name);

describe('breaking up what someone said', () => {
  it('splits on the separators people actually use', () => {
    expect(splitInventoryText('spinach, cheddar; eggs and milk\nrice')).toEqual([
      'spinach', 'cheddar', 'eggs', 'milk', 'rice',
    ]);
  });

  it('strips bullets and numbering without eating a decimal', () => {
    expect(splitInventoryText('- spinach\n2) cheddar\n• milk')).toEqual(['spinach', 'cheddar', 'milk']);
    // "1.5 kg" is not item 1 followed by "5 kg".
    expect(splitInventoryText('1.5 kg potatoes')).toEqual(['1.5 kg potatoes']);
  });

  it('turns a spoken number at the front into a countable amount', () => {
    expect(splitInventoryText('two tins of tomatoes')).toEqual(['2 tins of tomatoes']);
    expect(splitInventoryText('a dozen eggs')).toEqual(['12 eggs']);
    // A number word inside a name is part of the name.
    expect(splitInventoryText('five spice powder')).toEqual(['5 spice powder']);
    expect(splitInventoryText('chinese five spice')).toEqual(['chinese five spice']);
  });

  it('leaves prose out of the inventory', () => {
    const long = 'a'.repeat(200);
    expect(splitInventoryText(`spinach\n${long}`)).toEqual(['spinach']);
  });
});

describe('one line, one pantry row', () => {
  it('reads the amount off the front and the food off the rest', () => {
    expect(rowFor('400g chicken breast')).toMatchObject({
      name: 'Chicken breast, cooked', qty: '400 g', amountConfidence: 'exact', matched: true,
    });
    expect(rowFor('2 x 400g tins chickpeas')).toMatchObject({ qty: '800 g', cat: 'Tins & jars' });
    expect(rowFor('about 250 ml semi-skimmed milk')).toMatchObject({
      name: 'Semi-skimmed milk', qty: '250 ml', amountConfidence: 'approximate',
    });
  });

  it('does not let a forgiving quantity parser eat the food’s name', () => {
    // "400g chicken" parses as a quantity if you let it, leaving a row called
    // "breast". The amount stops at the last amount-ish word instead.
    expect(rowFor('400g chicken breast').name).toBe('Chicken breast, cooked');
    expect(rowFor('2 tins of chopped tomatoes').name).toBe('Chopped tomatoes, tinned');
  });

  it('refuses to invent an amount nobody gave', () => {
    for (const line of ['some cheddar', 'half a bag of spinach', 'leftover rice', 'a few lemons']) {
      expect(rowFor(line).amountConfidence, line).toBe('unknown');
      expect(rowFor(line).qty, line).toBe('');
    }
  });

  it('plans against the top of a range, and says the amount is approximate', () => {
    expect(rowFor('2-3 lemons')).toMatchObject({ qty: '3', amountConfidence: 'approximate' });
  });

  it('believes a recognised food and only half-believes an unrecognised one', () => {
    expect(rowFor('spinach')).toMatchObject({ confidence: 'definite', matched: true });
    expect(rowFor('unicorn steaks')).toMatchObject({ confidence: 'probable', matched: false, emoji: '🍽️' });
  });

  it('does not match a food just because the letters appear in its name', () => {
    // "eggs" must not become a Greggs baguette.
    const eggs = rowFor('6 eggs');
    expect(eggs.name).toBe('Egg');
    expect(eggs.foodId).toBe('egg');
  });

  it('matches the catalogue’s singular against a spoken plural', () => {
    expect(rowFor('salmon fillets').matched).toBe(true);
    expect(rowFor('salmon fillets').name).toMatch(/Salmon fillet/);
  });

  it('files things where they said, and otherwise where they belong', () => {
    expect(rowFor('peas in the freezer')).toMatchObject({ location: 'Freezer', cat: 'Frozen' });
    expect(rowFor('spinach (fridge)').location).toBe('Fridge');
    expect(rowFor('2 jars passata')).toMatchObject({ cat: 'Tins & jars', location: 'Cupboard' });
    expect(rowFor('olive oil')).toMatchObject({ cat: 'Sauces & oils', location: 'Cupboard' });
    expect(rowFor('leftover chilli').cat).toBe('Leftovers');
  });

  it('keeps a location word out of the item’s name', () => {
    expect(rowFor('frozen peas in the freezer').name).toBe('frozen peas');
    expect(rowFor('spinach (fridge)').name).toBe('Spinach');
  });

  it('takes an explicit location over anything guessed from the line', () => {
    expect(parseInventoryLine('spinach', { location: 'Garage' }).location).toBe('Garage');
  });

  it('drops a line with nothing nameable left in it', () => {
    expect(rowFor('some')).toBeNull();
    expect(rowFor('a')).toBeNull();
    expect(rowFor('')).toBeNull();
  });
});

describe('a whole dictation', () => {
  it('reads a spoken sentence into rows', () => {
    const rows = parseInventoryText('half a bag of spinach, two tins of chopped tomatoes and some cheddar');
    expect(names(rows)).toEqual(['Spinach', 'Chopped tomatoes, tinned', 'Cheddar']);
    expect(rows.every((row) => row.amountConfidence === 'unknown' || row.qty)).toBe(true);
  });

  it('merges a repeat instead of stocking the shelf twice', () => {
    const rows = parseInventoryText('tinned tomatoes\n2 tins of chopped tomatoes');
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe('800 g');
    // Two lines about one thing is not more certainty about the amount.
    expect(rows[0].amountConfidence).toBe('approximate');
  });

  it('stops before a paste becomes a thousand rows', () => {
    const huge = Array.from({ length: 200 }, (_, i) => `item ${i} thing`).join('\n');
    expect(parseInventoryText(huge).length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it('summarises what it found without overstating it', () => {
    const rows = parseInventoryText('400g chicken breast, some cheddar, unicorn steaks');
    const summary = inventorySummary(rows);
    expect(summary).toMatchObject({ total: 3, matched: 2, unmatched: 1, withAmounts: 1 });
    expect(summary.line).toBe('3 items · 2 recognised · 1 with an amount');
    expect(inventorySummary([]).line).toMatch(/Nothing readable/);
  });
});

describe('what the pantry then believes', () => {
  it('hands the truth system a row it can reason about', () => {
    const item = toPantryItem(rowFor('400g chicken breast'));
    expect(item.matched).toBeUndefined();
    expect(item.line).toBeUndefined();
    expect(amountConfidence(item)).toBe('exact');
    expect(pantryAvailability(item)).toBe('confirmed_sufficient');
    expect(pantryTruthForNeed(item, '200 g')).toBe('confirmed_sufficient');
    expect(pantryTruthForNeed(item, '900 g')).toBe('confirmed_insufficient');
  });

  it('will not promise an amount it was never told', () => {
    const item = toPantryItem(rowFor('some cheddar'));
    expect(amountConfidence(item)).toBe('unknown');
    // Having it is believed; having enough of it for a recipe is not claimed.
    expect(pantryAvailability(item)).toBe('confirmed_sufficient');
    expect(pantryTruthForNeed(item, '200 g')).toBe('confirmed_sufficient');
    expect(item.qty).toBe('');
  });

  it('marks an unrecognised item as something to confirm', () => {
    const item = toPantryItem(rowFor('unicorn steaks'));
    expect(item.confidence).toBe('probable');
    expect(pantryAvailability(item)).toBe('probably_available');
  });
});

describe('what a model is allowed to hand back', () => {
  it('is told to list only what is there, and never to estimate', () => {
    expect(INVENTORY_SYSTEM).toMatch(/Never add an item that is not there/);
    expect(INVENTORY_SYSTEM).toMatch(/Never estimate one/);
    // Plain lines, so a model can never supply a confidence level of its own.
    expect(INVENTORY_SYSTEM).toMatch(/No JSON/);
  });

  it('strips the fences, preambles and bullets a free model adds', () => {
    expect(parseInventoryList('```\nHere is what I can see:\n- 2 tins tomatoes\n1. 400 g chicken\n```'))
      .toEqual(['2 tins tomatoes', '400 g chicken']);
    expect(parseInventoryList('Sure!\nspinach')).toEqual(['spinach']);
    expect(parseInventoryList('')).toEqual([]);
  });

  it('caps a runaway answer', () => {
    const many = Array.from({ length: 300 }, (_, i) => `item ${i}`).join('\n');
    expect(parseInventoryList(many)).toHaveLength(MAX_LINES);
  });

  it('hands its lines to the same local parser, which decides the confidences', () => {
    const lines = parseInventoryList('- some cheddar\n- 400 g chicken breast');
    const rows = parseInventoryText(lines.join('\n'));
    expect(rows.map((row) => row.amountConfidence)).toEqual(['unknown', 'exact']);
  });
});
