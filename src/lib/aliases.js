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
  ['Spring onions', ['spring onions', 'spring onion', 'scallions', 'scallion', 'green onions', 'green onion', 'salad onions']],
  ['Coriander', ['coriander', 'cilantro', 'fresh coriander', 'fresh cilantro', 'coriander leaves', 'cilantro leaves']],
  ['Parsley', ['parsley', 'parsley leaves', 'fresh parsley', 'flat leaf parsley', 'flat-leaf parsley']],
  ['Basil', ['basil', 'fresh basil', 'basil leaves', 'fresh basil leaves']],
  ['Mint', ['mint', 'fresh mint']],
  ['Chestnut mushrooms', ['chestnut mushrooms', 'mushrooms', 'button mushrooms', 'portobello mushrooms', 'brown mushrooms']],
  ['Closed-cup mushrooms', ['closed-cup mushrooms', 'white mushrooms']],
  ['Courgette', ['courgette', 'courgettes', 'zucchini']],
  ['Aubergine', ['aubergine', 'aubergines', 'eggplant']],
  ['Peppers', ['peppers', 'bell peppers', 'bell pepper', 'mixed peppers', 'mixed pepper', 'red pepper', 'red peppers', 'red bell pepper', 'green pepper', 'green peppers', 'green bell pepper', 'yellow pepper', 'yellow peppers', 'yellow bell pepper', 'orange pepper', 'orange peppers', 'sweet pepper', 'sweet peppers', 'capsicum', 'capsicums']],
  ['Red onion', ['red onion', 'red onions']],
  ['Onion', ['onion', 'onions', 'white onion', 'brown onion']],
  ['Garlic', ['garlic', 'garlic clove', 'garlic cloves', 'clove of garlic', 'cloves of garlic', 'cloves garlic', 'clove garlic', 'fresh garlic', 'garlic (bulb)', 'garlic bulb']],
  ['Ginger', ['ginger', 'fresh ginger', 'ginger root']],
  ['Carrots', ['carrots', 'carrot', 'baby carrots']],
  ['Celery', ['celery', 'celery sticks', 'celery stalks']],
  ['New potatoes', ['new potatoes', 'baby potatoes', 'salad potatoes']],
  ['Potatoes', ['potatoes', 'potato', 'white potatoes', 'maris piper potatoes']],
  ['Sweet potato', ['sweet potato', 'sweet potatoes', 'sweet potatoes (medium)']],
  ['Broccoli', ['broccoli', 'broccoli head', 'tenderstem broccoli']],
  ['Spinach', ['spinach', 'baby spinach', 'frozen spinach', 'leaf spinach']],
  ['Kale', ['kale', 'curly kale', 'cavolo nero']],
  ['Cherry tomatoes', ['cherry tomatoes', 'baby plum tomatoes', 'vine tomatoes', 'tomatoes', 'tomato', 'ripe tomatoes', 'fresh tomatoes', 'large tomatoes', 'medium tomatoes']],
  ['Cucumber', ['cucumber', 'cucumber (half)']],
  ['Lettuce', ['lettuce', 'little gem', 'romaine', 'romaine lettuce', 'cos lettuce', 'cos', 'baby gem', 'salad leaves', 'mixed leaves']],
  ['Mayonnaise', ['mayonnaise', 'mayo', 'real mayonnaise']],
  ['Rocket', ['rocket', 'arugula', 'wild rocket', 'rocket leaves', 'baby rocket']],
  ['Avocado', ['avocado', 'avocados', 'ripe avocado']],
  ['Lemons', ['lemons', 'lemon', 'lemon (juice and zest)', 'lemon juice', 'juice of a lemon', 'juice of 1 lemon', 'lemon zest']],
  ['Limes', ['limes', 'lime', 'lime juice', 'juice of a lime', 'juice of 1 lime', 'lime zest']],
  ['Chicken breast', ['chicken breast', 'chicken breasts', 'chicken breast fillets']],
  ['Chicken thighs', ['chicken thighs', 'chicken thigh', 'bone-in chicken thighs', 'skinless chicken thighs']],
  ['Chicken mince', ['chicken mince', 'minced chicken', 'ground chicken']],
  ['Beef mince', ['beef mince', 'minced beef', 'mince beef', 'beef mince (lean)', 'ground beef', 'beef (minced)', 'lean beef mince', '5% beef mince', 'mince', 'lean mince', 'minced meat']],
  ['Turkey mince', ['turkey mince', 'minced turkey', 'turkey breast mince', 'ground turkey']],
  ['Pork mince', ['pork mince', 'minced pork', 'ground pork']],
  ['Salmon fillets', ['salmon fillets', 'salmon fillet', 'salmon', 'fresh salmon fillets']],
  ['Cod fillets', ['cod fillets', 'cod', 'cod fillet']],
  ['Prawns', ['prawns', 'king prawns', 'cooked prawns', 'raw prawns', 'shrimp']],
  ['Firm tofu', ['firm tofu', 'tofu', 'extra firm tofu', 'tofu block']],
  ['Tempeh', ['tempeh', 'tempeh block']],
  ['Greek yogurt', ['greek yogurt', 'greek yoghurt', 'greek style yogurt', 'natural yogurt', 'natural yoghurt', 'plain yogurt', 'plain yoghurt', 'yogurt', 'yoghurt']],
  ['Coconut yogurt', ['coconut yogurt', 'coconut yoghurt', 'soy yogurt']],
  ['Semi-skimmed milk', ['semi-skimmed milk', 'milk', 'semi skimmed milk', 'whole milk', 'skimmed milk']],
  ['Cheddar', ['cheddar', 'cheddar cheese', 'mature cheddar']],
  ['Parmesan', ['parmesan', 'parmesan cheese', 'parmigiano', 'grated parmesan']],
  ['Feta', ['feta', 'feta cheese']],
  ['Halloumi', ['halloumi', 'halloumi cheese']],
  ['Eggs', ['eggs', 'egg', 'free range eggs', 'large eggs', 'medium eggs']],
  ['Butter', ['butter', 'unsalted butter', 'salted butter']],
  ['Oats', ['oats', 'porridge oats', 'rolled oats', 'jumbo oats']],
  ['Rice', ['rice', 'white rice', 'long grain rice', 'basmati rice', 'easy cook rice']],
  ['Brown rice', ['brown rice', 'wholegrain rice']],
  ['Sushi rice', ['sushi rice', 'short grain rice']],
  ['Pasta', ['pasta', 'penne', 'spaghetti', 'fusilli', 'rigatoni', 'macaroni', 'wholewheat pasta']],
  ['Pappardelle', ['pappardelle', 'tagliatelle', 'fettuccine']],
  // Plain "Noodles" is deliberately NOT an alias here: recipes using it mean
  // egg-noodle nests, and folding those into rice noodles would suppress a
  // purchase the household genuinely needs.
  ['Rice noodles', ['rice noodles']],
  ['Couscous', ['couscous', 'cous cous']],
  ['Quinoa', ['quinoa', 'white quinoa', 'tri-colour quinoa']],
  ['Flour', ['flour', 'plain flour', 'self raising flour', 'strong white flour', 'wholemeal flour', 'all-purpose flour', 'all purpose flour', 'plain white flour', 'white flour', 'bread flour']],
  ['Sugar', ['sugar', 'granulated sugar', 'caster sugar', 'brown sugar']],
  ['Icing sugar', ['icing sugar', 'powdered sugar', 'confectioners sugar', "confectioners' sugar"]],
  ['Beetroot', ['beetroot', 'beetroots', 'beet', 'beets', 'cooked beetroot']],
  ['Swede', ['swede', 'rutabaga']],
  ['Mange tout', ['mange tout', 'mangetout', 'snow peas']],
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
  ['Crusty bread', ['crusty bread', 'bread']],
  ['Frozen berries', ['frozen berries', 'frozen mixed berries']],
  ['Fresh berries', ['fresh berries', 'strawberries', 'raspberries', 'blueberries']],
  ['Bananas', ['bananas', 'banana', 'ripe bananas']],
  ['Double cream', ['double cream', 'cream', 'heavy cream', 'heavy whipping cream', 'whipping cream', 'thick cream']],
  ['Soured cream', ['soured cream', 'sour cream']],
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
].map(([canonical, aliases]) => ({ canonical: clean(canonical), display: String(canonical).trim(), aliases: aliases.map(clean) }));

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
  const direct = byAlias.get(key);
  if (direct) return direct;
  // "tinned chickpeas" / "canned black beans" are the
  // same shopping line as the plain name when the plain name is a known group.
  const bare = key
    .replace(/^(?:tinned|canned|tin of|can of|tins of|cans of)\s+/, '')
    .trim();
  return (bare !== key && byAlias.get(bare)) || key;
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

/**
 * The human name to show for a canonical ingredient: the curated group's
 * first entry (its everyday name) when the name belongs to a group — "White
 * onion" and "Onion" both show as "Onion" — and the name itself when it
 * stands alone. Grouping and arithmetic still key on `canonicalName`; this
 * only fixes what the user reads, so one ingredient never appears under two
 * different names on the same list.
 */
export const displayNameFor = (name, learned = {}) => {
  const key = canonicalName(name, learned);
  const group = ALIAS_GROUPS.find((g) => g.canonical === key);
  return group ? group.display : String(name || '').trim();
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
