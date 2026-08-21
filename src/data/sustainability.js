/**
 * Environmental reference figures for food.
 *
 * These are published mean values from Poore & Nemecek (2018), *Reducing
 * food's environmental impacts through producers and consumers*, Science
 * 360(6392) — the largest meta-analysis of food LCA data there is, covering
 * ~38,700 farms across 119 countries. Figures are kg CO₂-equivalent and litres
 * of fresh water per kilogram of food, cradle to retail.
 *
 * What that means for how they're used here: these are **category averages**,
 * not measurements of the thing in your fridge. The spread within a category
 * is enormous — the top 10% of beef producers emit several times what the
 * bottom 10% do — so a figure computed from these is the right order of
 * magnitude and nothing finer. Every surface that shows one says so.
 *
 * Nothing here is user data. Your footprint starts at zero because your diary
 * starts empty.
 */

const f = (id, label, co2, water, match) => ({ id, label, co2, water, match });

/** kg CO₂e and litres of water per kg of food. */
export const FOOD_FOOTPRINTS = [
  f('beef', 'Beef', 99.5, 15400, /\b(beef|steak|mince|brisket|veal|burger)\b/i),
  f('lamb', 'Lamb', 39.7, 10400, /\b(lamb|mutton|hogget)\b/i),
  f('cheese', 'Cheese', 23.9, 5600, /\b(cheese|parmesan|cheddar|mozzarella|feta|halloumi|brie)\b/i),
  f('chocolate', 'Chocolate', 46.7, 17000, /\b(chocolate|cocoa|cacao)\b/i),
  f('coffee', 'Coffee', 28.5, 15900, /\b(coffee|espresso)\b/i),
  f('prawns', 'Farmed prawns', 26.9, 4100, /\b(prawns?|shrimps?|langoustines?)\b/i),
  f('pork', 'Pork', 12.3, 5990, /\b(pork|bacon|ham|gammon|sausages?|chorizo|pancetta)\b/i),
  f('poultry', 'Poultry', 9.9, 4300, /\b(chicken|turkey|duck|poultry)\b/i),
  f('fish', 'Farmed fish', 13.6, 3700, /\b(salmon|trout|seabass|tilapia|farmed fish)\b/i),
  f('whiteFish', 'Wild white fish', 5.4, 0, /\b(cod|haddock|pollock|hake|plaice)\b/i),
  f('eggs', 'Eggs', 4.7, 3300, /\b(eggs?)\b/i),
  f('rice', 'Rice', 4.5, 2500, /\b(rice|risotto|basmati|jasmine rice)\b/i),
  f('milk', 'Milk', 3.2, 630, /\b(milk|cream|yogh?urt|butter|ghee)\b/i),
  f('oils', 'Vegetable oil', 6.3, 4300, /\b(oil|olive oil|rapeseed|sunflower oil|margarine)\b/i),
  f('nuts', 'Nuts', 0.4, 4100, /\b(almonds?|cashews?|walnuts?|hazelnuts?|peanuts?|pistachios?)\b/i),
  f('tofu', 'Tofu & soya', 3.2, 2000, /\b(tofu|soya|soy|tempeh|edamame)\b/i),
  f('bread', 'Bread & wheat', 1.6, 1600, /\b(bread|flour|pasta|noodles?|couscous|wheat|wrap|bagel|tortilla)\b/i),
  f('oats', 'Oats & cereals', 2.5, 1600, /\b(oats?|porridge|cereal|granola|muesli)\b/i),
  f('pulses', 'Beans & pulses', 0.8, 4100, /\b(beans?|lentils?|chickpeas?|peas|pulses|dhal|hummus)\b/i),
  f('potatoes', 'Potatoes', 0.5, 290, /\b(potatoes?|chips|fries|mash)\b/i),
  f('rootVeg', 'Root vegetables', 0.4, 290, /\b(carrots?|parsnips?|beetroot|swede|turnips?|onions?|garlic)\b/i),
  f('brassicas', 'Brassicas & greens', 0.5, 280, /\b(broccoli|cauliflower|cabbage|kale|sprouts|spinach|greens|lettuce|salad)\b/i),
  f('tomatoes', 'Tomatoes', 2.1, 370, /\b(tomatoes?|passata|pass?ata|tomato)\b/i),
  f('otherVeg', 'Other vegetables', 0.5, 320, /\b(peppers?|courgettes?|aubergines?|mushrooms?|cucumbers?|celery|leeks?|sweetcorn)\b/i),
  f('bananas', 'Bananas', 0.9, 790, /\b(bananas?)\b/i),
  f('apples', 'Apples & pears', 0.4, 720, /\b(apples?|pears?)\b/i),
  f('berries', 'Berries', 1.5, 400, /\b(berries|strawberr|raspberr|blueberr|blackberr)\b/i),
  f('citrus', 'Citrus', 0.4, 430, /\b(oranges?|lemons?|limes?|grapefruit|clementines?)\b/i),
  f('otherFruit', 'Other fruit', 1.1, 960, /\b(fruit|mango|pineapple|grapes?|melon|avocados?|kiwi|peach)\b/i),
  f('sugar', 'Sugar', 3.2, 1800, /\b(sugar|syrup|honey|jam)\b/i),
  f('wine', 'Wine & beer', 1.8, 870, /\b(wine|beer|lager|cider|ale)\b/i),
];

export const footprintBy = Object.fromEntries(FOOD_FOOTPRINTS.map((x) => [x.id, x]));

/**
 * What a typical UK diet emits per day, so a number has something to sit
 * beside. From the same dataset's per-capita figures for a high-income
 * omnivorous diet; used only as a comparison line, never as your figure.
 */
export const UK_DAILY_AVERAGE_CO2 = 5.2; // kg CO₂e per person per day, food only

/** Things a kilogram of CO₂e is roughly equivalent to, for scale. */
export const CO2_EQUIVALENTS = [
  { id: 'drive', label: 'km driven in an average petrol car', perKg: 5.6 },
  { id: 'kettle', label: 'kettles boiled', perKg: 30 },
  { id: 'phone', label: 'phone charges', perKg: 122 },
];

export const FOOTPRINT_SOURCE =
  'Poore & Nemecek (2018), Science 360(6392) — the largest meta-analysis of food production impacts published.';

export const FOOTPRINT_CAVEAT =
  'These are category averages across thousands of farms, not a measurement of what you bought. The spread within any category is wide — the same cut of beef can differ several-fold between producers — so treat this as an order of magnitude, not a reading.';

/**
 * A rough dietary pattern score, from the share of a week's food footprint
 * that comes from the heaviest categories. Not a grade for you — a description
 * of the shopping.
 */
export const IMPACT_BANDS = [
  { to: 2.5, label: 'Light', tone: 'good' },
  { to: 4.5, label: 'Moderate', tone: 'good' },
  { to: 7, label: 'Heavy', tone: 'warn' },
  { to: Infinity, label: 'Very heavy', tone: 'danger' },
];
