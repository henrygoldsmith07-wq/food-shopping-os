/**
 * What can be answered without any network call at all.
 *
 * The adapter runs these first and only sends what they cannot answer to
 * classifier.dev, and only sends what neither can answer confidently to a
 * general model. Three cheap passes, in cost order:
 *
 *   1. keyword rules over the app's own vocabulary (here),
 *   2. classifier.dev — a zero-shot batch call costing a fraction of a chat
 *      completion,
 *   3. the general LLM, only where a real answer needs one.
 *
 * Every deterministic answer carries a confidence, and a low one is treated
 * exactly like no answer — the caller escalates rather than guessing. Nothing
 * here touches allergies, medical nutrition, food safety or health
 * interpretation: those are routed to the general assistant with its
 * constraint-aware system prompt, and never through any classifier.
 */

import { aisleForProductLabel as aisleForProduct } from './classify-taxonomies.js';

/* ---------- Products: what a shopping item is ---------- */

/** Ordered most-specific first; first hit wins. */
const PRODUCT_RULES = [
  // personal-care before household: "soap" is both, the bottle wins
  [/shampoo|conditioner|toothpaste|deodorant|soap|razor|shower gel|body wash|hand cream|moisturis|lip balm|dental floss|sanitary|tampon|shaving/i, 'personal-care'],
  [/washing|cleaner|bin bag|foil|cling ?film|detergent|fabric softener|sponge|bleach|polish|kitchen roll|toilet roll|tissue|dishwasher|air freshener|bin liner|scourer/i, 'household'],
  [/frozen|ice cream|icelolly|ice lolly/i, 'frozen'],
  [/bread|loaf|roll|bagel|croissant|brioche|baguette|muffin|scone|crumpet|tortilla|wrap|pitta|naan/i, 'bakery'],
  // Drinks before dairy and produce: "orange juice" is a drink, not an orange.
  [/cola|lemonade|juice|squash|water bottle|sparkling water|still water|tea bags?|coffee|latte|cappuccino|smoothie|energy drink|tonic|soda|cider|lager|beer|wine\b|prosecco|gin\b|vodka|whisky|rhum|rum\b/i, 'drinks'],
  // Spreads before dairy and the broad pantry rule: "peanut butter" is a jar,
  // not a tub of butter.
  [/peanut butter|almond butter|cashew butter|nut butter|chocolate spread|marmalade|jam\b|honey/i, 'pantry'],
  [/milk|cheese|yogurt|yoghurt|butter|cream|egg|halloumi|feta|mascarpone|mozzarella|cheddar|lactofree/i, 'dairy'],
  [/chicken|beef|pork|lamb|mince|bacon|sausage|steak|salmon|tuna|cod|haddock|prawn|turkey|ham|fish|mackerel|sardine/i, 'meat-fish'],
  [/apple|banana|berry|berries|strawberr|raspberr|blueberr|grape|orange|lemon|lime|pear|peach|plum|mango|pineapple|melon|kiwi|tomato|potato|onion|carrot|pepper|lettuce|spinach|kale|broccoli|cucumber|mushroom|garlic|ginger|salad|avocado|courgette|aubergine|cabbage|leek|parsnip|sprout|peas|fruit|veg/i, 'produce'],
  // Spreads before the broad pantry rule: "peanut butter" is a jar, not dairy.
  [/peanut butter|almond butter|cashew butter|nut butter|chocolate spread|marmalade|jam\b|honey/i, 'pantry'],
  // pantry is the broad shelf: tins, dry goods, baking, jars, spices
  [/tin\b|tinned|canned|beans|chickpea|lentil|rice|pasta|spaghetti|macaroni|penne|fusilli|tagliatelle|lasagne|noodle|flour|sugar|oats|oat ?cakes?|cereal|muesli|granola|honey|jam|marmalade|pickle|chutney|sauce|ketchup|mayo|mayonnaise|mustard|oil\b|vinegar|stock cube|stock pot|spice|herb|masala|curry paste|passata|chopped tomatoes|coconut milk|tahini|peanut butter|biscuit|cracker|crispbread|chocolate|sweet|snack bar|crisps|nuts\b|dried fruit|baking powder|bicarbonate|yeast|custard|jelly|gravy|yeast extract|marmite/i, 'pantry'],
];

/**
 * The product answer from the name alone, or null when the name says nothing.
 * Confidence is flat on purpose: a rule hit is a guess with good evidence, and
 * the caller's threshold decides whether it is worth acting on.
 */
export const deterministicProductCategory = (name) => {
  const text = String(name || '').trim();
  if (text.length < 2) return null;
  for (const [pattern, label] of PRODUCT_RULES) {
    if (pattern.test(text)) return { label, confidence: 0.85 };
  }
  return null;
};

/* ---------- Recipe meals: which slot a dish is for ---------- */

const MEAL_RULES = [
  [/porridge|granola|muesli|cereal\b|pancake|full english|fried egg|scrambled egg|omelette|avocado toast|french toast|waffle|kippers|bacon butty|breakfast/i, 'breakfast'],
  [/sandwich|soup\b|salad\b|wrap\b|toastie|ploughman|meal deal|packed lunch|lunch\b/i, 'lunch'],
  [/dessert|pudding|cake\b|brownie|cheesecake|tart\b|crumble|sponge|ice cream|trifle|jelly\b|meringue|fudge|sticky toffee/i, 'dessert'],
  [/crisps|hummus|dip\b|flapjack|energy ball|scotch egg|nibbles|snack/i, 'snack'],
  [/lemonade|juice\b|smoothie|latte|cappuccino|milkshake|cocktail|mocktail|cordial|iced tea|hot chocolate/i, 'drink'],
  [/side dish|chips\b|fries\b|mash(ed)? (potato)?|roast potatoes|coleslaw|slaw\b|greens\b|stuffing|garlic bread/i, 'side'],
  [/curry|roast\b|casserole|stew\b|chilli|pie\b|stir.?fry|spaghetti|bolognese|lasagne|lasagna|risotto|paella|hotpot|wellington|dinner\b|supper\b/i, 'dinner'],
];

export const deterministicRecipeMeal = (text) => {
  const source = String(text || '').trim();
  if (source.length < 3) return null;
  for (const [pattern, label] of MEAL_RULES) {
    if (pattern.test(source)) return { label, confidence: 0.8 };
  }
  return null;
};
/* ---------- Imported recipe text: what each line is ---------- */

const INGREDIENT_UNITS = /(?:\d\s*(?:kg|g|ml|l|oz|lb|fl oz)|\b(?:tbsp|tsp|tablespoon|teaspoon|dessertspoon|cup|cans?|tins?|packe?ts?|bunch(?:es)?|cloves?|handfuls?|pinch|sprigs?|slices?|dash)\b)/i;
const LEADING_QTY = /^(?:\d+(?:\.\d+)?|\d+\/\d+|½|¼|¾|⅓|⅔|one|two|three|four|five|six|seven|eight|nine|ten|half\s?an?\b)\b/i;
/** A line that is nothing but an amount — "400 g", "2", "1 x 400 g". */
const QUANTITY_ONLY = /^(?:\d+(?:\.\d+)?|\d+\/\d+|½|¼|¾|⅓|⅔|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(?:x\s*\d+(?:\.\d+)?)?\s*(?:kg|g|ml|l|oz|lb|fl oz|tbsp|tsp|cans?|tins?|packe?ts?|slices?)?\s*\.?$/i;
const INSTRUCTION_VERB = /^(?:heat|add|stir|mix|bake|cook|preheat|pre-heat|fry|deep.?fry|chop|slice|dice|pour|serve|whisk|simmer|roast|grill|boil|combine|season|place|remove|transfer|beat|fold|leave|rest|spread|assemble|drizzle|melt|reduce|garnish|cover|unwrap|brush|rub|marinate|knead|prove|proof|line\b|grease|turn|flip|toss|sprinkle|sieve|strain|drain|blend|steam|poach|braise|allow|once|when|meanwhile|check|taste|adjust|finish|plate)\b/i;
const NOISE_LINE = /^(?:advertisement|advert|share this|follow us|pin (?:this|it)|print recipe|leave a comment|sign up|subscribe|watch (?:how|the)|read more|©|all rights reserved|posted (?:in|by)|tags?:|share:)/i;
const METADATA_LINE = /^(?:serves|servings|makes|yield|prep time|cook time|total time|ready in|calories|kcal|difficulty|cuisine|author|method:|for the|nutrition)/i;
const SECTION_HEADINGS = /^(?:ingredients|method|instructions|directions|steps)$/i;

/**
 * One recipe-text line, read on its own. Order is the contract: quantity
 * before ingredient (a bare "200 g" is a quantity, not an ingredient),
 * metadata and noise before instruction, and the imperative-verb rule only
 * fires when the line is not already claimed by something more specific.
 */
export const deterministicRecipeLineKind = (line) => {
  const text = String(line || '').trim();
  if (!text) return { label: 'noise', confidence: 0.95 };
  if (NOISE_LINE.test(text) || /^https?:\/\//i.test(text)) return { label: 'noise', confidence: 0.9 };
  if (SECTION_HEADINGS.test(text)) return { label: 'metadata', confidence: 0.9 };
  if (METADATA_LINE.test(text)) return { label: 'metadata', confidence: 0.85 };
  if (QUANTITY_ONLY.test(text)) return { label: 'quantity', confidence: 0.85 };
  if (INGREDIENT_UNITS.test(text) && text.length <= 120) {
    return { label: 'ingredient', confidence: 0.8 };
  }
  if (LEADING_QTY.test(text) && text.length <= 60) {
    // "2 eggs" has no listed unit word but is unmistakably an ingredient.
    return { label: 'ingredient', confidence: 0.7 };
  }
  if (INSTRUCTION_VERB.test(text)) return { label: 'instruction', confidence: 0.75 };
  return null;
};

/**
 * The first line of a recipe is usually its title. That is an index judgement,
 * not a line judgement, so it lives here rather than in the per-line rule.
 * Returns null when a stronger per-line rule already claims the line.
 */
export const firstLineIsTitle = (line, lines = []) => {
  const text = String(line || '').trim();
  if (lines.length < 3 || text.length < 3 || text.length > 90) return null;
  if (deterministicRecipeLineKind(text)) return null;
  if (LEADING_QTY.test(text) || INSTRUCTION_VERB.test(text)) return null;
  return { label: 'title', confidence: 0.7 };
};

/* ---------- AI requests: deterministic routing before any model ---------- */

/**
 * Intents for /api/ai requests. `route` says who answers:
 *
 *   - 'deterministic' — a taxonomy lookup this module can answer outright.
 *   - 'llm'           — needs the assistant. Includes every allergy, medical
 *                       nutrition, food-safety and health-interpretation
 *                       request, which carry `guard: 'medical'`: they are
 *                       never sent to classifier.dev, because a probabilistic
 *                       label must never be the authority on someone's health.
 */
const MEDICAL_GUARD = /allerg|anaphyla|intoleran|coeliac|celiac|diabet|medic|doctor|nurse|prescri|pregnan|breastfeed|blood pressure|cholesterol|heart condition|kidney|iron level|vitamin d level|supplement dose|safe to eat|food poisoning|past its date|use.?by|sell.?by|is (?:this|it)\b[^?.]{0,40}(?:safe|edible|still good|still ok|gone off|gone bad)\b/i;

const AISLE_QUESTION = /(?:what|which) (?:aisle|category|section|shelf)\b/;
const MEAL_QUESTION = /(?:what|which) (?:meal|slot)\b/;
const LEADING_VERB = /^(?:does|do|would|will|is|are|should|for|to|can)\b\s*/i;
const LEADING_ARTICLE = /^(?:a|an|the|some|my)\b\s*/i;
const TRAILING_FILLER = /\s*\b(?:go|goes|going|belong|belongs|sit|sits|live|lives|be|in|on|under|at)\b\.?\s*$/i;

/**
 * The subject of an aisle/meal question, with the question's own grammar
 * stripped off: "what aisle do oats go in?" and "which meal is porridge?"
 * both reduce to the noun the rules can actually match.
 */
const tidySubject = (tail) => {
  let text = String(tail || '').replace(/[?.!]+$/, '').trim().replace(LEADING_VERB, '');
  let previous;
  do {
    previous = text;
    text = text.replace(TRAILING_FILLER, '').trim();
  } while (text && text !== previous);
  text = text.replace(LEADING_ARTICLE, '').trim();
  return text.length >= 2 && text.length <= 60 ? text : '';
};

const ruleRoute = (kind, subject) => {
  if (!subject) return null;
  const hit = kind === 'product'
    ? deterministicProductCategory(subject)
    : deterministicRecipeMeal(subject);
  if (!hit) return null; // no rule can answer, so "deterministic" would be a false promise
  return {
    route: 'deterministic',
    intent: kind === 'product' ? 'product-category' : 'recipe-meal',
    kind,
    subject,
    // Present and null on every route shape: a caller can read `guard`
    // without checking which branch answered.
    guard: null,
  };
};

export const classifyAiRequest = ({ task, prompt, context } = {}) => {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();

  // The medical guard is checked first and is unconditional. Whether the text
  // mentions an allergy, a condition, a medicine or a body, the honest answer
  // comes from the assistant's constraint-aware prompt, never from a label.
  if (MEDICAL_GUARD.test(lower)) {
    return { route: 'llm', intent: 'health-interpretation', guard: 'medical' };
  }

  if (AISLE_QUESTION.test(lower)) {
    const routed = ruleRoute('product',
      tidySubject(lower.slice(lower.search(AISLE_QUESTION)).replace(AISLE_QUESTION, '')));
    if (routed) return routed;
  }
  if (MEAL_QUESTION.test(lower)) {
    const routed = ruleRoute('recipe-meal',
      tidySubject(lower.slice(lower.search(MEAL_QUESTION)).replace(MEAL_QUESTION, '')));
    if (routed) return routed;
  }

  // A task already naming its taxonomy, with the item to classify in context.
  if ((task === 'shopping' || task === 'pantry') && /classif|categor|which aisle|what aisle|file under/.test(lower) && context?.item) {
    const routed = ruleRoute('product', String(context.item));
    if (routed) return routed;
  }
  if (task === 'recipe' && /classif|which meal|what meal|which slot/.test(lower) && context?.recipe) {
    const routed = ruleRoute('recipe-meal', String(context.recipe));
    if (routed) return routed;
  }

  return { route: 'llm', intent: 'assistant', guard: null };
};

/**
 * The deterministic answer itself, or null when the rules cannot answer — in
 * which case the caller escalates to the assistant as if routing never
 * happened. An answer that is actually a guess says so.
 */
export const deterministicAnswer = (routed) => {
  if (!routed || routed.route !== 'deterministic' || !routed.subject) return null;
  if (routed.kind === 'product') {
    const hit = deterministicProductCategory(routed.subject);
    if (!hit) return null;
    const aisle = aisleForProduct(hit.label);
    return `“${routed.subject}” files under ${hit.label} — I'd put it in the ${aisle} aisle.\n\nThat's a guess from the name, corrected by this household wherever you've moved an item yourself. Move it once on the list and it remembers.`;
  }
  if (routed.kind === 'recipe-meal') {
    const hit = deterministicRecipeMeal(routed.subject);
    if (!hit) return null;
    return `“${routed.subject}” reads as a ${hit.label} dish — the ${hit.label} slot of the plan.\n\nThat's from the name, not a rule about what anyone should eat. The plan takes any dish in any slot.`;
  }
  return null;
};

