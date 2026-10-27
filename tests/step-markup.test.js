import { describe, expect, it } from 'vitest';
import { ingredientTerms, stepSegments } from '../src/lib/step-markup.js';

const ingredients = [
  { name: 'Chicken thighs', qty: '8' },
  { name: 'New potatoes', qty: '600g' },
  { name: 'Olive oil', qty: '2 tbsp' },
  { name: 'Oregano', qty: '1 tsp' },
  { name: 'Chickpeas (tins)', qty: '2' },
];

describe('stepSegments', () => {
  it('turns a duration into a timer segment', () => {
    const segments = stepSegments('Rest for 5 minutes, then serve.', []);
    expect(segments).toEqual([
      { type: 'text', text: 'Rest for ' },
      { type: 'time', text: '5 minutes', seconds: 300 },
      { type: 'text', text: ', then serve.' },
    ]);
  });

  it('starts a range at its upper bound and reads hours and seconds', () => {
    expect(stepSegments('Simmer 10-12 mins.', []).find((s) => s.type === 'time').seconds).toBe(720);
    expect(stepSegments('Bake 1.5 hrs.', []).find((s) => s.type === 'time').seconds).toBe(5400);
    expect(stepSegments('Whisk for 30 seconds.', []).find((s) => s.type === 'time').seconds).toBe(30);
  });

  it('marks each ingredient once, with its amount, by the word the step uses', () => {
    const segments = stepSegments('Halve the potatoes, toss with oil and oregano, add the chicken. More oregano.', ingredients);
    const marked = segments.filter((s) => s.type === 'ingredient');
    expect(marked.map((s) => [s.text, s.qty])).toEqual([
      ['potatoes', '600g'],
      ['oil', '2 tbsp'],
      ['oregano', '1 tsp'],
      ['chicken', '8'],
    ]);
  });

  it('keeps the text exactly as written when joined back together', () => {
    const text = 'Toss the potatoes in olive oil and roast for 40 minutes.';
    expect(stepSegments(text, ingredients).map((s) => s.text).join('')).toBe(text);
  });

  it('returns a plain step untouched', () => {
    expect(stepSegments('Serve.', ingredients)).toEqual([{ type: 'text', text: 'Serve.' }]);
  });
});

describe('ingredientTerms', () => {
  it('never matches a describing word on its own', () => {
    expect(ingredientTerms('New potatoes')).not.toContain('new');
    expect(ingredientTerms('Chickpeas (tins)')).toContain('chickpeas');
  });
});
