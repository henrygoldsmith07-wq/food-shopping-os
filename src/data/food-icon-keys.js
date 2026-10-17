/**
 * Which icon a food reads as, from its name.
 *
 * Rows carry an `emoji` from the catalogue, but a typed-in item ("chopped
 * tomatoes", "oat milk", "bin bags") rarely matches it, and a miss used to
 * fall back to a generic plate. These rules read the name instead: the
 * packaging first (a tin of tomatoes is a tin, oat milk is a carton), then
 * what the food is. Specific patterns come before general ones — "peanut
 * butter" is a jar before "butter" is butter, "tortilla chips" are crisps
 * before "tortilla" is a wrap.
 *
 * Keys are plain strings; the UI maps them to monochrome stroke icons.
 */

const RULES = [
  // Names whose first word would mislead the rules below
  [/beef tomato/, 'tomato'],
  [/(egg|rice|glass) noodles/, 'noodles'],
  [/butter beans?/, 'bean'],
  [/fish ?cakes?|fish fingers/, 'fish'],
  [/(flour|corn) tortillas?/, 'wrap'],
  [/sugar ?snaps?/, 'peas'],
  [/burger buns?|hot dog rolls?/, 'bread'],
  [/tortilla chips|crisps|popcorn|nachos|pretzels/, 'crisps'],

  // Household and non-food
  [/toilet (roll|paper)|kitchen roll|tissues?\b|paper towel/, 'toiletRoll'],
  [/washing|detergent|soap|bleach|cleaner|cleaning|spray|sponges?\b|dishwasher|fabric|shampoo|toothpaste|deodorant/, 'spray'],
  [/bin bags?|foil|cling|baking paper|sandwich bags?|freezer bags?|batteries/, 'package'],
  [/nappies|nappy|baby|wipes/, 'baby'],
  [/\b(dog|cat|pet) (food|treats|biscuits)|cat litter|kibble/, 'paw'],

  // Packaging that decides the look
  [/\b(tins?|tinned|canned|cans?)\b|chopped tomatoes|plum tomatoes|passata|baked beans|coconut milk|tomato pur[eé]e/, 'tin'],
  [/oat milk|almond milk|soya? milk|coconut drink|rice milk|juice|smoothie|carton/, 'carton'],
  [/peanut butter|almond butter|nut butter|cashew butter|\bjam\b|honey|marmalade|pesto|mayo|mayonnaise|mustard|chutney|tahini|harissa|paste|spices?\b|paprika|cumin|cinnamon|turmeric|oregano|garam masala|(chill?i|chili) flakes|powder|seasoning|dried herbs|stock|bouillon|gravy|nutmeg|black pepper|peppercorns|pickles?\b|capers|olives|curry powder|lemon curd|nutella|marmite|hummus|houmous|salsa|relish|dip\b/, 'jar'],
  [/marinade|glaze|chimichurri|\boil\b|vinegar|sauce|ketchup|syrup|dressing|extract|essence|sriracha|tabasco|orange squash|cordial/, 'bottle'],
  [/\bsalt\b/, 'salt'],

  // Snacks and sweets, before bread and veg they share words with
  [/chocolate|cocoa nibs/, 'chocolate'],
  [/sweets|candy|jelly babies|gummies|toffee|fudge/, 'candy'],
  [/ice cream|gelato|sorbet|lolly|lollies|frozen yog/, 'iceCream'],
  [/doughnuts?|donuts?/, 'donut'],
  [/biscuits?|cookies?|digestives|crackers?|oatcakes?|rice cakes?|shortbread|flapjack/, 'cookie'],
  [/\bcakes?\b|brownies?|cupcakes?|muffins?|scones?|tarts?\b|pies?\b/, 'cake'],

  // Breakfast and dry goods
  [/cereal|granola|muesli|cornflakes|weetabix|shreddies|bran flakes|rice krispies/, 'cereal'],
  [/pancake mix|protein powder|whey|flour|sugar|baking soda|bicarb|yeast|\boats?\b|porridge|semolina|polenta|breadcrumbs|desiccated/, 'bag'],

  // Dairy and eggs
  [/yog(h)?urt|skyr|fromage frais|kefir|quark/, 'yoghurt'],
  [/butter\b|margarine|\bspread\b|ghee/, 'butter'],
  [/cheese|cheddar|mozzarella|feta|halloumi|parmesan|parmigiano|brie|camembert|ricotta|mascarpone|paneer|gouda|stilton|emmental|gruyere|manchego|pecorino|burrata|cottage/, 'cheese'],
  [/aubergines?|eggplants?/, 'aubergine'],
  [/\beggs?\b/, 'egg'],
  [/milk|cream\b|creme fraiche|crème fraîche|custard/, 'milk'],

  // Meat and fish
  [/bacon|pancetta|lardons|streaky/, 'bacon'],
  [/sausages?|chorizo|frankfurters?|hot dogs?|salami|pepperoni|bratwurst|black pudding/, 'sausage'],
  [/\bham\b|prosciutto|serrano|parma/, 'ham'],
  [/tofu|tempeh|quorn|seitan/, 'tofu'],
  [/chicken|turkey|drumsticks?|wings?\b|thighs?/, 'drumstick'],
  [/salmon|\bcod\b|haddock|tuna|fish|mackerel|trout|sardines?|anchov|sea ?bass|basa|pollock|kippers?|plaice|hake|sea bream|tilapia|monkfish|halibut/, 'fish'],
  [/lamb|pork|gammon|ribs?\b|duck|goat|joint/, 'ham'],
  [/beef|steak|mince|burgers?|brisket|veal|venison|meatballs?/, 'beef'],
  [/prawns?|shrimps?|lobster|crab|scampi|langoustine/, 'shrimp'],
  [/mussels?|clams?|oysters?|scallops?|squid|calamari|octopus/, 'shell'],

  // Bread, grains, pasta
  [/bagels?/, 'bagel'],
  [/croissants?|pastry|pastries|pain au|danish/, 'croissant'],
  [/tortillas?|wraps?\b|pitta|pita|flatbreads?|naan|chapati|roti/, 'wrap'],
  [/\btoast\b/, 'toast'],
  [/bread|loaf|sourdough|baguette|\bbuns?\b|\brolls?\b|crumpets?|brioche|ciabatta|focaccia|english muffins?|bloomer|bap\b/, 'bread'],
  [/\brice\b|risotto|arborio|basmati|jasmine|paella/, 'rice'],
  [/pasta|spaghetti|penne|fusilli|linguine|lasagne|lasagna|macaroni|tagliatelle|gnocchi|orzo|ravioli|tortellini|rigatoni|farfalle|conchiglie|pappardelle/, 'pasta'],
  [/noodles?|ramen|udon|soba|vermicelli/, 'noodles'],
  [/couscous|quinoa|bulgur|bulgar|barley|freekeh|grains?\b|farro/, 'grains'],

  // Veg
  [/spring onions?|scallions?|leeks?|celery|asparagus|lemongrass|rhubarb/, 'leek'],
  [/onions?|shallots?/, 'onion'],
  [/garlic/, 'garlic'],
  [/chips|fries|wedges|hash browns?|potato|potatoes|mash\b/, 'potato'],
  [/tomato|tomatoes/, 'tomato'],
  [/chill?ies|chill?i\b|chili|jalape[nñ]o|scotch bonnet/, 'chilli'],
  [/peppers?\b/, 'pepper'],
  [/mushrooms?/, 'mushroom'],
  [/broccoli|cauliflower|tenderstem|romanesco/, 'broccoli'],
  [/avocados?/, 'avocado'],
  [/lemons?\b|limes?\b/, 'lemon'],
  [/oranges?\b|clementines?|satsumas?|mandarins?|grapefruits?|tangerines?/, 'citrus'],
  [/sweetcorn|\bcorn\b|corn on the cob/, 'corn'],
  [/\bpeas\b|\bpea\b|edamame|mangetout|sugar ?snaps?|green beans|runner beans|broad beans/, 'peas'],
  [/beans?\b|chickpeas?|lentils?|kidney|cannellini|borlotti|black-eyed/, 'bean'],
  [/cucumbers?|courgettes?|zucchini|gherkins?/, 'cucumber'],
  [/carrots?|parsnips?|swede|turnips?|radish|beetroot/, 'carrot'],
  [/squash|pumpkin|butternut/, 'squash'],
  [/lettuce|spinach|kale|cabbage|rocket|salad|chard|pak choi|bok choy|greens|leaves|watercress|sprouts|brussels|lambs? lettuce|cress/, 'leafy'],
  [/basil|coriander|cilantro|parsley|mint|dill|thyme|rosemary|sage|chives|tarragon|bay leaves|herbs?/, 'herb'],
  [/ginger/, 'sprout'],

  // Fruit
  [/apples?\b|pineapple|mango|melon|kiwi|papaya|fruit/, 'apple'],
  [/pears?\b/, 'pear'],
  [/bananas?|plantain/, 'banana'],
  [/strawberr|raspberr|blueberr|blackberr|berries|cranberr|redcurrant/, 'strawberry'],
  [/grapes?\b|raisins|sultanas|currants/, 'grape'],
  [/cherr|plums?\b|peach|nectarines?|apricots?|dates\b|figs?\b|prunes/, 'cherry'],
  [/coconut|\bnuts?\b|almonds?|walnuts?|cashews?|pistachios?|peanuts?|hazelnuts?|pecans?|seeds?\b|macadamia|brazil/, 'nut'],

  // Drinks
  [/coffee|espresso|\btea\b|teabags|matcha/, 'coffee'],
  [/beer|lager|cider|\bale\b|stout|\bipa\b/, 'beer'],
  [/wine|prosecco|champagne|cava|\bport\b|sherry/, 'wine'],
  [/\bgin\b|vodka|\brum\b|whisky|whiskey|tequila|brandy|liqueur/, 'spirits'],
  [/water/, 'water'],
  [/cola|coke|lemonade|soda|fizzy|energy drink|tonic/, 'soda'],
  [/\bveg\b|vegetables/, 'carrot'],
  [/frozen/, 'frozen'],
  [/\bblocks?\b|\bcubes?\b/, 'package'],
];

/** The icon key for a food name, or null when nothing reads clearly. */
export function foodIconKey(name) {
  const text = String(name || '').toLowerCase().trim();
  if (!text) return null;
  for (const [pattern, key] of RULES) {
    if (pattern.test(text)) return key;
  }
  return null;
}

/** Catalogue emoji keys that have a food icon of their own. */
export const EMOJI_FOOD_KEY = {
  '🧅': 'onion', '🧄': 'garlic', '🥔': 'potato', '🍅': 'tomato', '🌶️': 'chilli', '🌶': 'chilli',
  '🫑': 'pepper', '🍄': 'mushroom', '🥦': 'broccoli', '🥑': 'avocado', '🍋': 'lemon', '🌽': 'corn',
  '🫛': 'peas', '🍆': 'aubergine', '🧀': 'cheese', '🧈': 'butter', '🍞': 'bread', '🥯': 'bagel',
  '🍚': 'rice', '🍝': 'pasta', '🍜': 'noodles', '🥫': 'tin', '🍯': 'jar', '🫙': 'jar', '🥓': 'bacon',
  '🌭': 'sausage', '🥞': 'pancakes', '🌮': 'taco', '🌯': 'wrap', '🥙': 'wrap', '🥒': 'cucumber',
  '🍐': 'pear', '🍓': 'strawberry', '🍫': 'chocolate', '🍪': 'cookie', '🧂': 'salt', '🥜': 'nut',
  '🌰': 'nut', '🥩': 'beef', '🍖': 'ham', '🦐': 'shrimp', '🦪': 'shell', '🍎': 'apple', '🍏': 'apple',
  '🍇': 'grape', '🍒': 'cherry', '🍑': 'cherry', '🍊': 'citrus', '🥕': 'carrot', '🎃': 'squash',
  '🌿': 'herb', '🧃': 'carton', '🍺': 'beer', '🍾': 'wine', '🥤': 'soda', '☕': 'coffee', '🍵': 'coffee',
  '🧁': 'cake', '🍰': 'cake', '🍩': 'donut', '🥐': 'croissant', '🥪': 'sandwich', '🍔': 'burger',
  '🥘': 'pot', '🍲': 'soup', '🧆': 'bean', '🫘': 'bean', '🥟': 'dumpling', '🍠': 'potato',
};

const FAMILY_KEY = {
  noodles: 'noodles', stirfry: 'wok', tacos: 'taco', chilli: 'chilli', pancakes: 'pancakes',
  bagel: 'bagel', porridge: 'porridge', overnight: 'jar', couscous: 'grains', bibimbap: 'rice',
  curry: 'curry', salmon: 'fish', tuna: 'fish',
};

/**
 * The icon key for a recipe: its dish family, sharpened by what it is made of.
 * A roast of beef is not a drumstick; a wrap is not a sandwich.
 *
 * @param {{ name?: string }} recipe
 * @param {string} family the recipe's dish family (see recipe-images.js)
 * @returns {string|null} a food key, or null to use the family's own icon
 */
export function recipeIconKey(recipe = {}, family = '') {
  const name = String(recipe?.name || '').toLowerCase();
  if (family === 'roast') {
    if (/beef|rag[uù]|mince|steak|meatball/.test(name)) return 'beef';
    if (/sausage|chorizo/.test(name)) return 'sausage';
    if (/lamb|pork|gammon|duck/.test(name)) return 'ham';
    if (/salmon|\bcod\b|fish|haddock|tuna|mackerel|trout/.test(name)) return 'fish';
    if (/prawn|shrimp/.test(name)) return 'shrimp';
    if (/chicken|turkey/.test(name)) return 'drumstick';
    // The family also catches every other dinner: name it by its main.
    if (/bake|roast/.test(name)) return 'traybake';
    if (/tofu|tempeh/.test(name)) return 'tofu';
    if (/feta|halloumi|paneer/.test(name)) return 'cheese';
    if (/lentil|chickpea|beans?\b/.test(name)) return 'bean';
    if (/\beggs?\b/.test(name)) return 'egg';
    if (/\brice\b/.test(name)) return 'rice';
    return 'pot';
  }
  if (family === 'roastveg') {
    if (/granola/.test(name)) return 'cereal';
    if (/toast/.test(name)) return 'toast';
    return /potato/.test(name) ? 'potato' : 'traybake';
  }
  if (family === 'sandwich') {
    if (/burger/.test(name)) return 'burger';
    if (/wrap|souvlaki|gyros?|kebab|shawarma|burrito/.test(name)) return 'wrap';
    if (/toastie|on toast|toast\b/.test(name)) return 'toast';
    return 'sandwich';
  }
  if (family === 'pasta') {
    if (/risotto/.test(name)) return 'rice';
    if (/lasagne|lasagna|bake/.test(name)) return 'traybake';
    return 'pasta';
  }
  if (family === 'tacos' && /fajita|burrito|quesadilla|wrap/.test(name)) return 'wrap';
  if (family === 'overnight' && /yog(h)?urt bowl/.test(name)) return 'yoghurt';
  if (family === 'breakfast') {
    const lead = foodIconKey(name.split(/\bwith\b|&|,/)[0]);
    return lead && lead !== 'bag' && lead !== 'milk' ? lead : 'porridge';
  }
  return FAMILY_KEY[family] || null;
}
