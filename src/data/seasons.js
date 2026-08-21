/**
 * The UK growing calendar.
 *
 * Seasonality is a property of ingredients, not of dishes — so this file holds
 * roughly when things are at their best here, and a dish is "in season" only
 * because of what is actually in it. Months wrap: leeks run from September to
 * April, so `from` (9) is after `to` (4).
 *
 * Nothing here is user data. It shifts the planner's preferences, never its
 * hard rules — a January tomato is still allowed, just not suggested first.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Month number (1–12) for a YYYY-MM-DD stamp. */
export const monthOf = (stamp) => Number(String(stamp).slice(5, 7)) || new Date().getMonth() + 1;

const s = (name, match, from, to) => ({ name, match, from, to });

export const SEASONAL = [
  /* Spring */
  s('Purple sprouting broccoli', /sprouting broccoli/i, 2, 4),
  s('Wild garlic', /wild garlic/i, 3, 5),
  s('Rhubarb', /rhubarb/i, 1, 6),
  s('Asparagus', /asparagus/i, 4, 6),
  s('Radishes', /radish/i, 4, 9),
  s('Spring onions', /spring onion/i, 4, 9),
  s('Watercress', /watercress/i, 4, 9),
  s('Spinach', /spinach/i, 4, 9),
  s('New potatoes', /new potato/i, 5, 8),
  s('Lettuce', /lettuce|salad leaves|mixed leaves/i, 5, 9),
  s('Rocket', /rocket/i, 5, 9),
  s('Cucumber', /cucumber/i, 5, 9),
  s('Strawberries', /strawberr/i, 5, 8),

  /* Summer */
  s('Peas', /\bpeas\b/i, 6, 8),
  s('Broad beans', /broad bean/i, 6, 8),
  s('Cherries', /cherr/i, 6, 8),
  s('Gooseberries', /gooseberr/i, 6, 8),
  s('Samphire', /samphire/i, 6, 8),
  s('Raspberries', /raspberr/i, 6, 9),
  s('Courgette', /courgette/i, 6, 9),
  s('Tomatoes', /tomato/i, 6, 9),
  s('Beetroot', /beetroot/i, 6, 11),
  s('Chard', /chard/i, 6, 11),
  s('Fennel', /fennel/i, 6, 10),
  s('Garlic', /garlic/i, 6, 10),
  s('Broccoli', /broccoli/i, 6, 11),
  s('Blueberries', /blueberr/i, 7, 9),
  s('Sweetcorn', /sweetcorn|corn on the cob/i, 7, 9),
  s('Runner beans', /runner bean|green bean/i, 7, 9),
  s('Peppers', /(?<!black |white |chilli )peppers?\b/i, 7, 10),
  s('Aubergine', /aubergine/i, 7, 10),
  s('Mackerel', /mackerel/i, 5, 9),

  /* Autumn */
  s('Plums', /plum/i, 8, 10),
  s('Blackberries', /blackberr/i, 8, 10),
  s('Onions', /onion/i, 8, 3),
  s('Potatoes', /potato/i, 8, 3),
  s('Carrots', /carrot/i, 8, 12),
  s('Apples', /apple/i, 9, 11),
  s('Pears', /pear\b/i, 9, 11),
  s('Squash', /squash|pumpkin/i, 9, 12),
  s('Mushrooms', /mushroom/i, 9, 12),
  s('Parsnips', /parsnip/i, 9, 2),
  s('Celeriac', /celeriac/i, 9, 3),
  s('Swede', /swede/i, 9, 3),
  s('Leeks', /leek/i, 9, 4),
  s('Cabbage', /cabbage/i, 9, 4),
  s('Mussels', /mussel/i, 9, 4),

  /* Winter */
  s('Brussels sprouts', /brussels|sprouts/i, 10, 1),
  s('Kale', /kale/i, 10, 3),
  s('Turnips', /turnip/i, 10, 3),
  s('Cauliflower', /cauliflower/i, 10, 4),
];

/** Wrap-aware month test — September→April covers December. */
export const inMonth = (entry, month) =>
  (entry.from <= entry.to
    ? month >= entry.from && month <= entry.to
    : month >= entry.from || month <= entry.to);

export const inSeason = (month) => SEASONAL.filter((e) => inMonth(e, month));

/** Names of the produce in a dish that is at its best this month. */
export const seasonalHits = (recipe, month) => {
  const now = inSeason(month);
  const hits = new Set();
  for (const ing of recipe.ingredients || []) {
    const match = now.find((e) => e.match.test(ing.name));
    if (match) hits.add(match.name);
  }
  return [...hits];
};

export const seasonScore = (recipe, month) => seasonalHits(recipe, month).length;

/** What's worth buying this month, for the planner's "in season" note. */
export const peakNow = (month, limit = 6) => inSeason(month).slice(0, limit).map((e) => e.name);
