/**
 * Capture layer for the food diary: search, barcode lookup, voice parsing,
 * photo recognition and recipe import.
 *
 * These local capture surfaces do not call the backend or OpenAI relay. Photo
 * and barcode demos resolve against the bundled catalogue deterministically;
 * voice and recipe paste parse what the user actually supplied.
 */

import { CATALOGUE, FOODS } from '../data/foods.js';
import { NUTRIENT_KEYS } from '../data/nutrients.js';
import { EMPTY, buildEntry, nutrientNumber, nutrientValue, recipeAsFood, timeStamp, mealForTime } from './nutrition.js';

export { recipeTextFromMarkup } from './recipe-markup.js';

const norm = (str) => String(str || '').toLowerCase().trim();

/* ---------- Search ---------- */

const score = (food, q) => {
  const name = norm(food.name);
  const brand = norm(food.brand);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (brand.includes(q)) return 40;
  if ((food.tags || []).some((t) => norm(t).includes(q))) return 25;
  return 0;
};

export const searchFoods = (query, catalogue = CATALOGUE, limit = 40) => {
  const q = norm(query);
  if (!q) return catalogue.slice(0, limit);
  const words = q.split(/\s+/).filter(Boolean);
  return catalogue
    .map((food) => {
      const scores = words.map((w) => score(food, w));
      const ownFoodBoost = food.source === 'custom' ? 15 : 0;
      return scores.some((sc) => sc === 0)
        ? null
        : { food, total: scores.reduce((a, b) => a + b, ownFoodBoost) };
    })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((r) => r.food);
};

export const foodById = (id, catalogue = CATALOGUE) => catalogue.find((f) => f.id === id) || null;

/* ---------- Barcode ---------- */

export const isBarcode = (code) => /^\d{8}$|^\d{12,13}$/.test(String(code || '').trim());

export const lookupBarcode = (code, catalogue = CATALOGUE) => {
  const c = String(code || '').trim();
  return catalogue.find((f) => f.barcode === c) || null;
};

export const SCANNABLE = FOODS.filter((f) => f.barcode);

export const scanAt = (n) => SCANNABLE[Math.abs(Math.trunc(n)) % SCANNABLE.length];

/* ---------- Voice logging ---------- */

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, 'a half': 0.5, couple: 2, few: 3,
};

const UNIT_WORDS = {
  g: 1, gram: 1, grams: 1, gramme: 1, grammes: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000,
  ml: 1, millilitre: 1, millilitres: 1, l: 1000, litre: 1000, litres: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
};

const PORTION_WORDS = ['slice', 'slices', 'scoop', 'scoops', 'bowl', 'bowls', 'glass', 'glasses',
  'cup', 'cups', 'piece', 'pieces', 'handful', 'handfuls', 'tbsp', 'tsp', 'spoon', 'spoons',
  'pot', 'pots', 'bar', 'bars', 'tin', 'tins', 'can', 'cans', 'pint', 'pints', 'portion', 'portions',
  'serving', 'servings', 'square', 'squares', 'bag', 'bags', 'punnet'];

const STOPWORDS = new Set(['of', 'some', 'the', 'my', 'i', 'had', 'ate', 'have', 'eaten',
  'just', 'and', 'with', 'a', 'an', 'plus', 'then', 'today', 'this', 'morning', 'evening']);

const MEAL_WORDS = {
  breakfast: 'breakfast', brunch: 'breakfast', lunch: 'lunch', dinner: 'dinner',
  tea: 'dinner', supper: 'dinner', snack: 'snack', snacks: 'snack', snacking: 'snack',
};

const extractMeal = (text) => {
  let meal = null;
  const cleaned = norm(text).replace(/\bfor\s+(breakfast|brunch|lunch|dinner|tea|supper|snacks?)\b/g, (_, word) => {
    meal = MEAL_WORDS[word];
    return ' ';
  });
  return { meal, text: cleaned };
};

const splitChunks = (text) =>
  text
    .split(/,| and | plus | then | with /)
    .map((c) => c.trim())
    .filter(Boolean);

export const parsePhrase = (phrase) => {
  const words = norm(phrase).replace(/[.!?]/g, '').split(/\s+/).filter(Boolean);
  let qty = null;
  let grams = null;
  let portionWord = null;
  const rest = [];

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const numeric = /^\d+(\.\d+)?$/.test(w) ? Number(w) : null;
    const glued = w.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l|oz)$/);

    if (glued) {
      grams = Number(glued[1]) * UNIT_WORDS[glued[2]];
      qty = qty ?? 1;
      continue;
    }
    if (numeric !== null) { qty = numeric; continue; }
    if (WORD_NUMBERS[w] !== undefined && qty === null && rest.length === 0) { qty = WORD_NUMBERS[w]; continue; }
    if (UNIT_WORDS[w] !== undefined && qty !== null && grams === null) {
      grams = qty * UNIT_WORDS[w];
      continue;
    }
    if (PORTION_WORDS.includes(w) && !portionWord) { portionWord = w; continue; }
    if (STOPWORDS.has(w)) continue;
    rest.push(w);
  }

  return { qty: qty ?? 1, grams, portionWord, query: rest.join(' ').trim() };
};

export const parseVoiceLog = (text, catalogue = CATALOGUE, now = new Date()) => {
  const { meal: spokenMeal, text: body } = extractMeal(text);
  const meal = spokenMeal || mealForTime(now);
  const items = splitChunks(body).map((chunk) => {
    const { qty, grams, portionWord, query } = parsePhrase(chunk);
    if (!query) return null;
    const food = searchFoods(query, catalogue, 1)[0] || null;
    const serving = food?.servings?.[0];
    const weight = grams ?? (serving ? serving.grams * qty : null);
    return {
      text: chunk.trim(),
      query,
      qty,
      portionWord,
      food,
      grams: weight,
      entry: food
        ? buildEntry(food, {
            grams: weight,
            meal,
            time: timeStamp(now),
            source: 'voice',
            servingLabel: grams
              ? `${weight} ${food.unit || 'g'}`
              : qty === 1 ? serving?.label : `${qty} × ${serving?.label}`,
          })
        : null,
    };
  }).filter(Boolean);

  return { meal, items, matched: items.filter((i) => i.entry).length };
};

/* ---------- Photo recognition (on-device demo) ---------- */

const hash = (str) => {
  let h = 7;
  for (let i = 0; i < String(str).length; i += 1) h = (h * 31 + String(str).charCodeAt(i)) % 1e9;
  return h;
};

const PLATES = [
  ['chicken-breast', 'white-rice', 'broccoli'],
  ['porridge-oats', 'banana', 'semi-skimmed-milk'],
  ['wholemeal-bread', 'egg', 'avocado'],
  ['salmon-fillet', 'potato', 'spinach'],
  ['pasta', 'cheddar', 'olive-oil'],
  ['greek-yogurt', 'granola', 'blueberries'],
  ['tortilla-wrap', 'chicken-breast', 'hummus'],
  ['tofu', 'brown-rice', 'broccoli'],
];

export const recognisePlate = (seed, catalogue = CATALOGUE, now = new Date()) => {
  const h = hash(seed);
  const plate = PLATES[h % PLATES.length];
  const meal = mealForTime(now);
  return plate.map((id, i) => {
    const food = foodById(id, catalogue) || foodById(id, CATALOGUE);
    const serving = food.servings[0];
    const factor = [1, 0.85, 1.25][(h + i) % 3];
    const grams = Math.round(serving.grams * factor);
    return {
      food,
      confidence: 68 + ((h >> (i * 3)) % 30),
      grams,
      entry: buildEntry(food, { grams, meal, time: timeStamp(now), source: 'photo', servingLabel: `${grams} ${food.unit}` }),
    };
  });
};

/* ---------- Shelf recognition (pantry capture) ---------- */

const SHELVES = [
  ['semi-skimmed-milk', 'greek-yogurt', 'cheddar', 'egg'],
  ['chickpeas', 'baked-beans', 'pasta', 'white-rice'],
  ['spinach', 'broccoli', 'avocado', 'apple'],
  ['porridge-oats', 'granola', 'peanut-butter', 'banana'],
  ['chicken-breast', 'salmon-fillet', 'tuna-tinned'],
  ['olive-oil', 'butter', 'mayonnaise', 'hummus'],
  ['tofu', 'lentils', 'brown-rice', 'almonds'],
  ['blueberries', 'orange', 'sweet-potato', 'potato'],
];

const shelfQty = (food, n) => {
  if (food.unit === 'ml') return `${[500, 1000, 2000][n % 3]} ml`;
  const serving = food.servings[0]?.grams || 100;
  return serving >= 100 ? `${Math.round(serving * [2, 3, 4][n % 3])} g` : `${[2, 4, 6][n % 3]} × ${food.name.toLowerCase()}`;
};

export const recogniseShelf = (seed, catalogue = CATALOGUE) => {
  const h = hash(seed);
  const shelf = SHELVES[h % SHELVES.length];
  return shelf.map((id, i) => {
    const food = foodById(id, catalogue) || foodById(id, CATALOGUE);
    return {
      food,
      name: food.name,
      emoji: food.emoji,
      confidence: 64 + ((h >> (i * 4)) % 34),
      qty: shelfQty(food, h + i),
      cat: (food.tags || []).includes('tinned') || (food.tags || []).includes('grain') ? 'Tins & jars' : 'Fresh',
      location: (food.tags || []).some((t) => ['dairy', 'veg', 'fruit', 'meat', 'fish'].includes(t)) ? 'Fridge' : 'Cupboard',
    };
  });
};

/* ---------- Recipe import ---------- */

const QTY_LINE = /^\s*(?:[-*•]\s*)?(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|½|¼|¾)?\s*((?:kg|g|ml|l|tbsp|tbs|tablespoons?|tsp|teaspoons?|cups?|cloves?|tins?|cans?|handfuls?|slices?|kilograms?|grams?|grammes?|litres?|liters?|millilitres?|milliliters?)\b)?\s*(?:of\s+)?(.+?)\s*$/i;
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
const UNIT_ALIASES = {
  kilogram: 'kg', kilograms: 'kg', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  litre: 'l', litres: 'l', liter: 'l', liters: 'l', millilitre: 'ml', millilitres: 'ml',
  milliliter: 'ml', milliliters: 'ml', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp',
};
const GRAMS_PER = { kg: 1000, g: 1, l: 1000, ml: 1, tbsp: 15, tsp: 5, cup: 240, cups: 240, clove: 5, cloves: 5, tin: 240, tins: 240, can: 240, cans: 240, handful: 30, handfuls: 30, slice: 36, slices: 36 };

const ingredientTokens = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const singularToken = (token) => {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
};

const sameIngredientToken = (left, right) => left === right || singularToken(left) === singularToken(right);
const PREPARATION_WORDS = new Set(['baked', 'boiled', 'canned', 'cooked', 'diced', 'dried', 'frozen', 'grilled', 'raw', 'roasted', 'sliced', 'steamed', 'tinned']);

const matchIngredientFood = (name, catalogue) => {
  const query = ingredientTokens(name);
  if (!query.length) return null;
  return catalogue
    .map((food) => {
      const foodTokens = ingredientTokens(food.name);
      const overlap = foodTokens.filter((token) => query.some((part) => sameIngredientToken(part, token))).length;
      if (!overlap) return null;
      const coverage = overlap / Math.max(foodTokens.length, query.length);
      const exact = foodTokens.length === query.length
        && foodTokens.every((token, index) => sameIngredientToken(token, query[index]));
      const queryMatchesAll = query.every((part) => foodTokens.some((token) => sameIngredientToken(part, token)));
      const foodMatchesAll = foodTokens.every((token) => query.some((part) => sameIngredientToken(part, token)));
      const extraWordsArePreparation = foodTokens
        .filter((token) => !query.some((part) => sameIngredientToken(part, token)))
        .every((token) => PREPARATION_WORDS.has(token));
      if (!exact && !foodMatchesAll && !(queryMatchesAll && extraWordsArePreparation)) return null;
      const exactTokenHits = foodTokens.filter((token) => query.includes(token)).length;
      const staple = (food.tags || []).some((tag) => ['grain', 'dairy', 'veg', 'fruit', 'meat', 'fish', 'fat', 'tinned', 'bread', 'spread', 'drink', 'high-protein'].includes(tag));
      const noisy = food.source === 'restaurant' || (food.tags || []).includes('eating out') || (food.tags || []).includes('treat');
      return { food, exact, exactTokenHits, coverage, overlap, staple, noisy };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.exactTokenHits - a.exactTokenHits
      || Number(b.staple) - Number(a.staple) || Number(a.noisy) - Number(b.noisy)
      || b.coverage - a.coverage || b.overlap - a.overlap
      || a.food.name.localeCompare(b.food.name))[0]?.food || null;
};

export const parseIngredientLine = (line, catalogue = CATALOGUE) => {
  const m = String(line).match(QTY_LINE);
  if (!m) return null;
  const [, rawQty, rawUnit, rawName] = m;
  const name = rawName.replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim();
  if (!name || name.length < 2) return null;
  const cleanQty = String(rawQty || '').replace(',', '.').replace(/\s+/g, '');
  const slash = cleanQty.match(/^(\d+)\/(\d+)$/);
  if (slash && Number(slash[2]) === 0) return null;
  const qty = rawQty
    ? (FRACTIONS[rawQty] ?? (slash ? Number(slash[1]) / Number(slash[2]) : Number(cleanQty)))
    : 1;
  if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return null;
  const rawUnitKey = (rawUnit || '').toLowerCase();
  const unit = UNIT_ALIASES[rawUnitKey] || rawUnitKey;
  const food = matchIngredientFood(name, catalogue);
  const perUnit = GRAMS_PER[unit];
  const grams = perUnit ? qty * perUnit : (food?.servings?.[0]?.grams || 100) * qty;
  return { line: String(line).trim(), name, qty, unit, grams: Math.round(grams), food };
};

/** Sum only measured nutrient cells — never treat missing as zero. */
const addMeasured = (acc, per100, grams) => {
  const k = grams / 100;
  for (const key of NUTRIENT_KEYS) {
    const raw = per100?.[key];
    const n = nutrientNumber(raw);
    if (n === null || n === undefined) continue;
    if (acc[key] === null || acc[key] === undefined) acc[key] = 0;
    acc[key] += n * k;
  }
  return acc;
};

export const importRecipeText = (text, catalogue = CATALOGUE) => {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const title = lines[0].replace(/^#+\s*/, '').slice(0, 80);
  const servingsLine = lines.find((l) => /serves|servings|makes/i.test(l));
  const servings = Math.max(1, Number(servingsLine?.match(/(\d+)/)?.[1]) || 4);
  const methodStart = lines.findIndex((l, index) => index > 0 && /^(method|steps?|instructions?|directions?)\b/i.test(l));
  const ingredientLines = lines
    .slice(1, methodStart > 0 ? methodStart : lines.length)
    .filter((l) => l !== servingsLine)
    .filter((l) => l.length < 90);

  const ingredients = ingredientLines.map((l) => parseIngredientLine(l, catalogue)).filter(Boolean);
  const matched = ingredients.filter((i) => i.food);
  const total = matched.reduce((acc, i) => addMeasured(acc, i.food.per100, i.grams), {});

  const grams = Math.max(1, matched.reduce((g, i) => g + i.grams, 0)) / servings;
  const servingGrams = Math.max(1, Math.round(grams));
  const perServing = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      if (total[key] === undefined || total[key] === null) return [key, null];
      return [key, Math.round((total[key] / servings) * 10) / 10];
    }),
  );
  if (perServing.kcal != null) perServing.kcal = Math.round(perServing.kcal);

  return {
    title,
    servings,
    ingredients,
    matchedCount: matched.length,
    perServing,
    food: {
      id: `import--${Date.now().toString(36)}`,
      name: title,
      brand: 'Imported recipe',
      emoji: '🍽️',
      unit: 'g',
      source: 'custom',
      tags: ['imported'],
      per100: Object.fromEntries(NUTRIENT_KEYS.map((key) => {
        if (perServing[key] === null || perServing[key] === undefined) return [key, null];
        return [
          key,
          key === 'kcal'
            ? Math.round((perServing.kcal / servingGrams) * 100)
            : Math.round((perServing[key] / servingGrams) * 1000) / 10,
        ];
      })),
      servings: [
        { label: '1 serving', grams: servingGrams },
        { label: 'Half serving', grams: Math.max(1, Math.round(servingGrams / 2)) },
      ],
    },
  };
};

export const importRecipeUrl = (url) => {
  const clean = String(url).trim();
  if (!/^https?:\/\/.+\..+/.test(clean)) return null;
  const domain = clean.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  return { domain, url: clean, needsText: true };
};

/* ---------- Recipes ---------- */

export const estimateRecipeMicros = (recipe, catalogue = CATALOGUE) => {
  const parsed = (recipe.ingredients || [])
    .map((i) => parseIngredientLine(`${i.qty} ${i.name}`, catalogue))
    .filter((i) => i && i.food);
  const grams = parsed.reduce((g, i) => g + i.grams, 0);
  if (!grams) return null;
  const totals = parsed.reduce((acc, i) => addMeasured(acc, i.food.per100, i.grams), {});
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      if (totals[key] === undefined || totals[key] === null) return [key, null];
      return [key, Math.round((totals[key] / grams) * 100 * 100) / 100];
    }),
  );
};

export const recipeFood = (recipe, catalogue = CATALOGUE) =>
  recipeAsFood(recipe, estimateRecipeMicros(recipe, catalogue));

/* ---------- Custom foods ---------- */

/**
 * Validate + normalise the custom-food form at the boundary.
 * Fields the user left blank stay null (unknown), never zero-filled.
 * Explicit 0 means measured none.
 */
export const makeCustomFood = (draft) => {
  const name = String(draft.name || '').trim();
  const servingGrams = Number(draft.servingGrams);
  const rawKcal = String(draft.kcal ?? '').trim();
  const kcal = Number(rawKcal);
  const errors = [];
  if (name.length < 2) errors.push('Give it a name');
  if (!(servingGrams > 0)) errors.push('Serving size must be greater than 0');
  if (rawKcal === '' || !(kcal >= 0)) errors.push('Calories must be a number');
  if (errors.length) return { errors, food: null };

  const k = 100 / servingGrams;
  const per100 = {};
  for (const key of NUTRIENT_KEYS) {
    if (key === 'kcal') {
      per100.kcal = Math.round(kcal * k);
      continue;
    }
    const raw = draft[key];
    // Blank / undefined → unknown (null). Explicit 0 → measured zero.
    if (raw === undefined || raw === null || raw === '') {
      per100[key] = null;
    } else {
      const n = Number(raw);
      per100[key] = Number.isFinite(n) ? Math.round(Math.max(0, n) * k * 10) / 10 : null;
    }
  }
  return {
    errors: [],
    food: {
      id: `custom--${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name,
      brand: String(draft.brand || '').trim() || 'My food',
      emoji: '🍽️',
      unit: draft.unit === 'ml' ? 'ml' : 'g',
      source: 'custom',
      tags: ['mine'],
      per100,
      servings: [
        { label: `1 serving (${servingGrams} ${draft.unit === 'ml' ? 'ml' : 'g'})`, grams: servingGrams },
        { label: `Half serving`, grams: servingGrams / 2 },
      ],
    },
  };
};
