/**
 * Seed diary. Gives a first-time user a believable history so "recent foods",
 * "copy a previous meal" and the weekly calorie chart have something real to
 * work with. Dates are relative to today, so the app never looks stale.
 */

import { CATALOGUE } from './foods.js';

const stamp = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

/** [foodId, meal, time, grams] → a fully-formed log entry. */
const entry = (dayOffset, [foodId, meal, time, grams], i) => {
  const food = CATALOGUE.find((f) => f.id === foodId);
  if (!food) return null;
  const serving = food.servings[0];
  const weight = grams ?? serving.grams;
  return {
    id: `seed-${dayOffset}-${i}`,
    foodId: food.id,
    name: food.name,
    brand: food.brand || null,
    emoji: food.emoji,
    unit: food.unit,
    grams: weight,
    servingLabel: weight === serving.grams ? serving.label : `${weight} ${food.unit}`,
    per100: food.per100,
    meal,
    time,
    source: 'search',
  };
};

const DAYS = {
  // today — a morning and a midday behind us, dinner still to come (~1,240 kcal)
  0: [
    ['porridge-oats', 'breakfast', '07:40', 60],
    ['semi-skimmed-milk', 'breakfast', '07:40', 200],
    ['banana', 'breakfast', '07:45', 118],
    ['cappuccino', 'breakfast', '08:20', 240],
    ['chicken-breast', 'lunch', '12:45', 150],
    ['brown-rice', 'lunch', '12:45', 180],
    ['broccoli', 'lunch', '12:45', 80],
    ['greek-yogurt', 'snack', '15:30', 170],
    ['almonds', 'snack', '15:30', 15],
  ],
  1: [
    ['wholemeal-bread', 'breakfast', '08:05', 72],
    ['egg', 'breakfast', '08:05', 116],
    ['avocado', 'breakfast', '08:05', 75],
    ['pret-a-manger--chicken-avocado-protein-pot', 'lunch', '13:10', 210],
    ['apple', 'lunch', '13:30', 150],
    ['pasta', 'dinner', '19:20', 200],
    ['cheddar', 'dinner', '19:20', 30],
    ['dark-chocolate', 'snack', '21:15', 20],
  ],
  2: [
    ['greek-yogurt', 'breakfast', '07:55', 170],
    ['granola', 'breakfast', '07:55', 45],
    ['blueberries', 'breakfast', '07:55', 40],
    ['tortilla-wrap', 'lunch', '12:30', 62],
    ['tuna-tinned', 'lunch', '12:30', 112],
    ['salmon-fillet', 'dinner', '18:50', 130],
    ['potato', 'dinner', '18:50', 180],
    ['spinach', 'dinner', '18:50', 30],
    ['crisps', 'snack', '16:10', 25],
  ],
  3: [
    ['porridge-oats', 'breakfast', '07:35', 40],
    ['semi-skimmed-milk', 'breakfast', '07:35', 200],
    ['chickpeas', 'lunch', '12:50', 240],
    ['hummus', 'lunch', '12:50', 40],
    ['wholemeal-bread', 'lunch', '12:50', 36],
    ['nando-s--butterfly-chicken-breast', 'dinner', '19:40', 230],
    ['nando-s--spicy-rice', 'dinner', '19:40', 230],
    ['lager', 'dinner', '20:10', 330],
  ],
  4: [
    ['wholemeal-bread', 'breakfast', '08:15', 36],
    ['peanut-butter', 'breakfast', '08:15', 32],
    ['banana', 'snack', '10:40', 118],
    ['greggs--chicken-bacon-mayo-baguette', 'lunch', '13:00', 200],
    ['tofu', 'dinner', '19:05', 140],
    ['white-rice', 'dinner', '19:05', 180],
    ['broccoli', 'dinner', '19:05', 150],
    ['protein-bar', 'snack', '21:30', 60],
  ],
  5: [
    ['egg', 'breakfast', '09:10', 174],
    ['wholemeal-bread', 'breakfast', '09:10', 72],
    ['halloumi', 'lunch', '13:25', 60],
    ['sweet-potato', 'lunch', '13:25', 150],
    ['wagamama--chicken-katsu-curry', 'dinner', '19:50', 620],
    ['ice-cream', 'snack', '21:40', 100],
  ],
  6: [
    ['porridge-oats', 'breakfast', '08:00', 40],
    ['blueberries', 'breakfast', '08:00', 40],
    ['whey-protein', 'snack', '11:20', 30],
    ['chicken-breast', 'lunch', '13:15', 150],
    ['pasta', 'lunch', '13:15', 200],
    ['lentils', 'dinner', '18:40', 150],
    ['olive-oil', 'dinner', '18:40', 14],
    ['orange', 'snack', '16:00', 140],
  ],
};

/** `{ 'YYYY-MM-DD': entry[] }` for the last week, today included. */
export const seedLog = () =>
  Object.fromEntries(
    Object.entries(DAYS).map(([offset, rows]) => [
      stamp(Number(offset)),
      rows.map((row, i) => entry(offset, row, i)).filter(Boolean),
    ]),
  );

/** Meal templates a user might plausibly have saved already. */
export const SEED_TEMPLATES = [
  {
    id: 'tpl-gym-breakfast',
    name: 'Gym-day breakfast',
    meal: 'breakfast',
    items: [
      ['porridge-oats', 60], ['semi-skimmed-milk', 200], ['whey-protein', 30], ['banana', 118],
    ],
  },
  {
    id: 'tpl-desk-lunch',
    name: 'Desk lunch',
    meal: 'lunch',
    items: [['wholemeal-bread', 72], ['tuna-tinned', 112], ['mayonnaise', 13], ['apple', 150]],
  },
  {
    id: 'tpl-chicken-rice',
    name: 'Chicken, rice & greens',
    meal: 'dinner',
    items: [['chicken-breast', 150], ['brown-rice', 180], ['broccoli', 80], ['olive-oil', 8]],
  },
].map((t) => ({
  ...t,
  entries: t.items
    .map(([foodId, grams], i) => entry(`tpl-${t.id}`, [foodId, t.meal, '00:00', grams], i))
    .filter(Boolean),
}));
