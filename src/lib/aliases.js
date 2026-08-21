/**
 * Ingredient aliases and entity resolution.
 *
 * The pantry and the recipe book rarely spell the same thing the same way:
 * "Chopped tomatoes" vs "tin tomatoes", "Coriander" vs "cilantro", "Spring
 * onions" vs "scallions". This module is the one place that knows they are the
 * same thing. A small curated table of everyday staples (kept honest — only
 * swaps that genuinely are the same ingredient) is layered with whatever the
 * user has taught us through scan corrections, so resolution gets better
 * without ever pretending two different foods are one.
 */

const clean = (value) => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Canonical → the everyday names that mean it. First entry is the canonical. */
export const ALIAS_GROUPS = [
  ['Chopped tomatoes', ['chopped tomatoes', 'tinned tomatoes', 'tin tomatoes', 'canned tomatoes', 'crushed tomatoes', 'plum tomatoes', 'whole tomatoes', 'tomatoes (tins)', 'chopped tomatoes (tins)']],
  ['Passata', ['passata', 'tomato passata', 'sieved tomatoes']],
  ['Tomato puree', ['tomato puree', 'tomato paste', 'tomato concentrate', 'double concentrate tomato puree']],
  ['Coconut milk', ['coconut milk', 'coconut milk (tins)', 'tinned coconut milk']],
  ['Chickpeas', ['chickpeas', 'chick peas', 'chickpeas (tins)', 'garbanzo beans', 'chick pea']],
  ['Kidney beans', ['kidney beans', 'red kidney beans', 'kidney beans (tins)']],
  ['Mixed beans', ['mixed beans', 'mixed beans (tins)', 'bean mix', 'three bean mix']],
  ['Cannellini beans', ['cannellini beans', 'cannellini', 'white beans', 'haricot beans', 'navy beans']],
  ['Lentils', ['lentils', 'red lentils', 'green lentils', 'puy lentils', 'dried lentils', 'lentils (tins)']],
  ['Olive oil', ['olive oil', 'extra virgin olive oil', 'olive oil (bottle)']],
  ['Vegetable oil', ['vegetable oil', 'sunflower oil', 'cooking oil']],
  ['Rapeseed oil', ['rapeseed oil', 'canola oil']],
  ['Soy sauce', ['soy sauce', 'soya sauce', 'dark soy sauce', 'light soy sauce']],
  ['Sesame oil', ['sesame oil', 'toasted sesame oil']],
  ['Sesame seeds', ['sesame seeds', 'sesame seed', 'toasted sesame seeds']],
  ['Spring onions', ['spring onions', 'spring onion', 'scallions', 'scallion', 'green onions', 'salad onions']],
  ['Coriander', ['coriander', 'cilantro', 'fresh coriander', 'fresh cilantro']],
  ['Parsley', ['parsley', 'fresh parsley', 'flat leaf parsley', 'flat-leaf parsley']],
  ['Basil', ['basil', 'fresh basil']],
  ['Mint', ['mint', 'fresh mint']],
  ['Chestnut mushrooms', ['chestnut mushrooms', 'mushrooms', 'button mushrooms', 'portobello mushrooms', 'brown mushrooms']],
  ['Closed-cup mushrooms', ['closed-cup mushrooms', 'white mushrooms']],
  ['Courgette', ['courgette', 'courgettes', 'zucchini']],
  ['Aubergine', ['aubergine', 'aubergines', 'eggplant']],
  ['Peppers', ['peppers', 'bell peppers', 'mixed peppers', 'red pepper', 'green pepper', 'yellow pepper', 'capsicum']],
  ['Red onion', ['red onion', 'red onions']],
  ['White onion', ['white onion', 'brown onion', 'onions', 'onion']],
  ['Garlic', ['garlic', 'garlic cloves', 'cloves of garlic', 'garlic (bulb)']],
  ['Ginger', ['ginger', 'fresh ginger', 'ginger root']],
  ['Carrots', ['carrots', 'carrot', 'baby carrots']],
  ['Celery', ['celery', 'celery sticks', 'celery stalks']],
  ['New potatoes', ['new potatoes', 'baby potatoes', 'salad potatoes']],
  ['Potatoes', ['potatoes', 'potato', 'white potatoes', 'maris piper potatoes']],
  ['Sweet potato', ['sweet potato', 'sweet potatoes', 'sweet potatoes (medium)']],
  ['Broccoli', ['broccoli', 'broccoli head', 'tenderstem broccoli']],
  ['Spinach', ['spinach', 'baby spinach', 'frozen spinach', 'leaf spinach']],
  ['Kale', ['kale', 'curly kale', 'cavolo nero']],
  ['Cherry tomatoes', ['cherry tomatoes', 'baby plum tomatoes', 'vine tomatoes', 'tomatoes']],
  ['Cucumber', ['cucumber', 'cucumber (half)']],
  ['Lettuce', ['lettuce', 'little gem', 'romaine', 'salad leaves', 'mixed leaves', 'rocket']],
  ['Avocado', ['avocado', 'avocados', 'ripe avocado']],
  ['Lemons', ['lemons', 'lemon', 'lemon (juice and zest)']],
  ['Limes', ['limes', 'lime']],
  ['Chicken breast', ['chicken breast', 'chicken breasts', 'chicken breast fillets']],
  ['Chicken thighs', ['chicken thighs', 'chicken thigh', 'bone-in chicken thighs', 'skinless chicken thighs']],
  ['Chicken mince', ['chicken mince', 'minced chicken']],
  ['Beef mince', ['beef mince', 'minced beef', 'lean beef mince', '5% beef mince']],
  ['Turkey mince', ['turkey mince', 'minced turkey', 'turkey breast mince']],
  ['Salmon fillets', ['salmon fillets', 'salmon fillet', 'salmon', 'fresh salmon fillets']],
  ['Cod fillets', ['cod fillets', 'cod', 'cod fillet']],
  ['Prawns', ['prawns', 'king prawns', 'cooked prawns', 'raw prawns', 'shrimp']],
  ['Firm tofu', ['firm tofu', 'tofu', 'extra firm tofu', 'tofu block']],
  ['Tempeh', ['tempeh', 'tempeh block']],
  ['Greek yogurt', ['greek yogurt', 'greek yoghurt', 'greek style yogurt', 'natural yogurt', 'natural yoghurt', 'plain yogurt', 'plain yoghurt', 'yogurt', 'yoghurt']],
  ['Coconut yogurt', ['coconut yogurt', 'coconut yoghurt', 'soy yogurt']],
  ['Semi-skimmed milk', ['semi-skimmed milk', 'milk', 'semi skimmed milk', 'whole milk', 'skimmed milk', 'oat milk', 'almond milk', 'soya milk']],
  ['Cheddar', ['cheddar', 'cheddar cheese', 'mature cheddar']],
  ['Parmesan', ['parmesan', 'parmesan cheese', 'parmigiano', 'grated parmesan']],
  ['Feta', ['feta', 'feta cheese']],
  ['Halloumi', ['halloumi', 'halloumi cheese']],
  ['Eggs', ['eggs', 'egg', 'free range eggs', 'large eggs', 'medium eggs']],
  ['Butter', ['butter', 'unsalted butter', 'salted butter']],
  ['Oats', ['oats', 'porridge oats', 'rolled oats', 'jumbo oats']],
  ['Rice', ['rice', 'white rice', 'long grain rice', 'basmati rice', 'easy cook rice']],
  ['Brown rice', ['brown rice', 'wholegrain rice']],
  ['Sushi rice', ['sushi rice', 'short grain rice', 'risotto rice', 'arborio rice']],
  ['Pasta', ['pasta', 'penne', 'spaghetti', 'fusilli', 'rigatoni', 'macaroni', 'wholewheat pasta']],
  ['Pappardelle', ['pappardelle', 'tagliatelle', 'fettuccine']],
  ['Rice noodles', ['rice noodles', 'noodles', 'egg noodles', 'udon noodles', 'glass noodles']],
  ['Couscous', ['couscous', 'cous cous', 'bulgur wheat']],
  ['Quinoa', ['quinoa', 'white quinoa', 'tri-colour quinoa']],
  ['Flour', ['flour', 'plain flour', 'self raising flour', 'strong white flour', 'wholemeal flour']],
  ['Sugar', ['sugar', 'granulated sugar', 'caster sugar', 'brown sugar']],
  ['Honey', ['honey', 'runny honey', 'set honey']],
  ['Maple syrup', ['maple syrup', 'maple syrup (bottle)']],
  ['Chia seeds', ['chia seeds', 'chia']],
  ['Mixed seeds', ['mixed seeds', 'pumpkin seeds', 'sunflower seeds', 'seed mix']],
  ['Peanut butter', ['peanut butter', 'smooth peanut butter', 'crunchy peanut butter']],
  ['Almond butter', ['almond butter', 'cashew butter']],
  ['Walnuts', ['walnuts', 'walnut halves', 'chopped walnuts']],
  ['Toasted almonds', ['toasted almonds', 'almonds', 'flaked almonds', 'ground almonds']],
  ['Mixed nuts', ['mixed nuts', 'cashews', 'pistachios', 'pecans', 'brazil nuts']],
  ['Dark chocolate', ['dark chocolate', 'dark chocolate (70%)', 'cooking chocolate']],
  ['Cocoa powder', ['cocoa powder', 'cocoa']],
  ['Vegetable stock', ['vegetable stock', 'vegetable stock cube', 'stock cube', 'vegetable stock pot']],
  ['Chicken stock', ['chicken stock', 'chicken stock cube', 'chicken stock pot']],
  ['Beef stock', ['beef stock', 'beef stock cube', 'beef stock pot']],
  ['Curry paste', ['curry paste', 'korma paste', 'tikka masala paste', 'madras paste']],
  ['Curry roux block', ['curry roux block', 'katsu curry block', 'japanese curry block']],
  ['Fajita seasoning', ['fajita seasoning', 'fajita spice mix', 'taco seasoning']],
  ['Smoked paprika', ['smoked paprika', 'paprika', 'sweet paprika', 'smoked paprika (powder)']],
  ['Cumin', ['cumin', 'ground cumin', 'cumin seeds']],
  ['Coriander seeds', ['coriander seeds', 'ground coriander', 'coriander powder']],
  ['Turmeric', ['turmeric', 'ground turmeric']],
  ['Cinnamon', ['cinnamon', 'ground cinnamon']],
  ['Oregano', ['oregano', 'dried oregano', 'dried mixed herbs']],
  ['Bay leaves', ['bay leaves', 'dried bay leaves', 'bay leaf']],
  ['Salt', ['salt', 'sea salt', 'table salt', 'kosher salt']],
  ['Black pepper', ['black pepper', 'pepper', 'cracked black pepper', 'ground black pepper']],
  ['Mixed grains pouch', ['mixed grains pouch', 'grain pouch', 'microwave grains', 'ready cooked grains']],
  ['Tortillas', ['tortillas', 'flour tortillas', 'wraps', 'corn tortillas']],
  ['Crusty bread', ['crusty bread', 'bread', 'sourdough', 'baguette', 'ciabatta']],
  ['Frozen berries', ['frozen berries', 'mixed berries', 'frozen mixed berries']],
  ['Fresh berries', ['fresh berries', 'strawberries', 'raspberries', 'blueberries']],
  ['Bananas', ['bananas', 'banana', 'ripe bananas']],
  ['Soured cream', ['soured cream', 'sour cream', 'creme fraiche']],
  ['Crème fraîche', ['crème fraîche', 'creme fraiche', 'half fat creme fraiche']],
  ['Mascarpone', ['mascarpone', 'mascarpone cheese']],
  ['Peanut oil', ['peanut oil', 'groundnut oil']],
  ['Coconut oil', ['coconut oil', 'coconut oil (jar)']],
  ['Cornflour', ['cornflour', 'corn starch', 'cornstarch']],
  ['Panko breadcrumbs', ['panko breadcrumbs', 'breadcrumbs', 'panko', 'dried breadcrumbs']],
  ['Protein powder', ['protein powder', 'whey protein', 'vanilla protein powder', 'chocolate protein powder']],
  ['Stir-fry veg', ['stir-fry veg', 'stir fry vegetables', 'stir fry veg pack', 'stir-fry mix']],
  ['Mixed veg', ['mixed vegetables', 'frozen mixed veg', 'frozen vegetables', 'frozen peas and sweetcorn']],
  ['Frozen peas', ['frozen peas', 'peas', 'garden peas']],
  ['Sweetcorn', ['sweetcorn', 'tinned sweetcorn', 'frozen sweetcorn', 'corn']],
  ['Hummus', ['hummus', 'houmous', 'humous']],
  ['Tahini', ['tahini', 'tahini paste']],
  ['Sriracha', ['sriracha', 'sriracha sauce']],
  ['Chilli flakes', ['chilli flakes', 'red chilli flakes', 'chilli powder', 'dried chilli']],
  ['Fresh chilli', ['fresh chilli', 'red chilli', 'green chilli', 'bird eye chilli']],
  ['Grated cheese', ['grated cheese', 'grated cheddar', 'cheese (grated)']],
  ['Mozzarella', ['mozzarella', 'fresh mozzarella', 'mozzarella ball']],
  ['Yeast', ['yeast', 'fast action yeast', 'dried yeast']],
  ['Bicarbonate of soda', ['bicarbonate of soda', 'bicarb', 'baking soda']],
  ['Baking powder', ['baking powder', 'baking powder (raising agent)']],
  ['Vanilla extract', ['vanilla extract', 'vanilla essence', 'vanilla']],
  ['Frozen chips', ['frozen chips', 'chips', 'oven chips', 'fries']],
  ['Ice cream', ['ice cream', 'vanilla ice cream', 'ice cream (tub)']],
  ['Mince pies', ['mince pies', 'mince pie']],
  ['Gravy granules', ['gravy granules', 'gravy', 'instant gravy']],
].map(([canonical, aliases]) => ({ canonical: clean(canonical), aliases: aliases.map(clean) }));

const byAlias = new Map();
for (const group of ALIAS_GROUPS) {
  for (const alias of group.aliases) byAlias.set(alias, group.canonical);
}

/** User-taught corrections (scan corrections, pantry fixes): raw → canonical. */
const resolveLearned = (name, learned = {}) => {
  if (!learned || typeof learned !== 'object') return null;
  return learned[name] || null;
};

/**
 * The canonical name for an ingredient — a user-taught correction first, then
 * the curated table, then the name itself, normalised.
 */
export const canonicalName = (name, learned = {}) => {
  const key = clean(name);
  if (!key) return '';
  const taught = resolveLearned(key, learned);
  if (taught) return clean(taught);
  return byAlias.get(key) || key;
};

/** Two names refer to the same ingredient (canonical match, or substring fallback). */
export const sameIngredient = (a, b, learned = {}) => {
  const ca = canonicalName(a, learned);
  const cb = canonicalName(b, learned);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return long.includes(short) && short.length >= 4;
};

/** The canonical name for a shopping-list or pantry row, for grouping. */
export const entityKey = (name, learned = {}) => canonicalName(name, learned);

/** Where to file a learned alias: strip punctuation, singular form. */
export const learnAlias = (learned = {}, raw, canonical) => {
  const key = clean(raw);
  const value = clean(canonical);
  if (!key || !value || key === value) return learned;
  return { ...learned, [key]: value };
};
