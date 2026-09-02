/**
 * Broad recipe discovery catalogue for Forq.
 *
 * These are discovery-ready recipe shells: the existing recipe generator and
 * imported recipes remain the source of detailed ingredient maths. Each shell
 * carries enough metadata for search, meal planning, cuisine and dietary
 * filters, while its nutrition is explicitly marked as an estimate.
 */

import { estimateRecipe } from './recipe-estimate.js';

const slug = (value) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const unique = (items) => [...new Set(items.filter(Boolean))];

const CUISINE_WORDS = {
  Italian: ['pasta', 'pizza', 'risotto', 'lasagne', 'carbonara', 'bolognese', 'gnocchi', 'cannelloni', 'ravioli', 'tortellini', 'bruschetta', 'caprese', 'focaccia', 'calzone', 'arancini', 'tiramisu', 'panna cotta', 'cacio', 'puttanesca', 'arrabbiata', 'alfredo', 'parmigiana'],
  Indian: ['curry', 'tikka', 'korma', 'madras', 'jalfrezi', 'vindaloo', 'balti', 'saag', 'paneer', 'dal', 'biryani', 'masala', 'rogan', 'bhaji', 'pakora', 'samosa', 'naan', 'chapati', 'paratha', 'aloo', 'rajma'],
  Mexican: ['taco', 'burrito', 'enchilada', 'fajita', 'quesadilla', 'nacho', 'chilli', 'guacamole', 'salsa', 'elote', 'bowl'],
  Chinese: ['chow mein', 'fried rice', 'sweet and sour', 'kung pao', 'black bean', 'wonton', 'bao', 'dumpling', 'gyoza', 'spring roll', 'prawn toast', 'chilli beef'],
  Japanese: ['katsu', 'teriyaki', 'ramen', 'udon', 'soba', 'yakisoba', 'sushi', 'sashimi', 'tempura', 'miso', 'onigiri', 'poke', 'yakitori', 'okonomiyaki'],
  Thai: ['thai', 'pad thai', 'pad see ew', 'tom yum', 'tom kha', 'satay', 'massaman', 'panang', 'laksa'],
  Korean: ['korean', 'bulgogi', 'bibimbap', 'japchae', 'kimchi', 'tteokbokki', 'gochujang'],
  Greek: ['greek', 'souvlaki', 'gyros', 'moussaka', 'spanakopita', 'tzatziki', 'keftedes', 'dolmades'],
  Mediterranean: ['mediterranean', 'hummus', 'falafel', 'couscous', 'tagine', 'fattoush', 'tabbouleh', 'ratatouille', 'shakshuka', 'harissa'],
  British: ['english', 'british', 'bangers', 'toad in the hole', 'fish and chips', 'cottage pie', 'shepherd', 'roast', 'yorkshire', 'bubble and squeak', 'rarebit', 'ploughman', 'pasty', 'hotpot', 'scotch egg', 'scone'],
  American: ['american', 'burger', 'buffalo', 'mac and cheese', 'meatloaf', 'steak', 'sloppy joe', 'hot dog', 'corn dog', 'waffle', 'clam chowder', 'pecan pie', 'pumpkin pie', 'brownie', 'cookie', 'donut'],
  'Middle Eastern': ['shawarma', 'falafel', 'hummus', 'baba ganoush', 'tabbouleh', 'fattoush', 'kofta', 'kibbeh', 'fatah', 'manakish', 'labneh', 'baklava', 'turkish delight'],
};

const DIET_TAGS = {
  vegan: ['vegan', 'tofu', 'tempeh', 'seitan', 'jackfruit', 'falafel', 'hummus', 'lentil', 'chickpea', 'bean', 'vegetable', 'ratatouille', 'mujaddara', 'dal'],
  vegetarian: ['vegetarian', 'cheese', 'paneer', 'halloumi', 'frittata', 'omelette', 'risotto', 'mushroom', 'egg', 'shakshuka', 'margherita'],
};

const OCCASION_TAGS = {
  breakfast: ['breakfast', 'porridge', 'oats', 'eggs', 'toast', 'pancake', 'crepe', 'burrito', 'muffin', 'granola', 'smoothie'],
  lunch: ['sandwich', 'wrap', 'salad', 'soup', 'bowl', 'focaccia', 'falafel'],
  quick: ['quick', 'stir fry', 'fajita', 'fried rice', 'noodles', 'pasta', 'quesadilla', 'wrap', 'toast', 'omelette'],
  'one-pot': ['one-pot', 'casserole', 'stew', 'curry', 'chilli', 'risotto', 'paella', 'jambalaya', 'hotpot'],
  'air-fryer': ['air fryer', 'air-fried'],
  'slow-cooker': ['slow cooker', 'slow-cooked'],
  'meal-prep': ['meal-prep', 'meal prep'],
  batch: ['batch', 'freezer', 'meal-prep', 'slow cooker', 'casserole', 'stew', 'chilli', 'lasagne'],
  comfort: ['pie', 'pudding', 'mac and cheese', 'casserole', 'stew', 'curry', 'lasagne', 'roast', 'mash', 'burger', 'fried'],
};

const inferCuisine = (name) => Object.entries(CUISINE_WORDS).find(([, words]) => words.some((word) => name.includes(word)))?.[0] || 'Global';
const inferTags = (name, cuisine) => {
  const tags = [cuisine.toLowerCase()];
  for (const [tag, words] of Object.entries({ ...DIET_TAGS, ...OCCASION_TAGS })) {
    if (words.some((word) => name.includes(word))) tags.push(tag);
  }
  if (name.includes('chicken') || name.includes('beef') || name.includes('pork') || name.includes('lamb') || name.includes('turkey') || name.includes('duck') || name.includes('steak') || name.includes('sausage')) tags.push('meat', 'high-protein');
  if (name.includes('fish') || name.includes('salmon') || name.includes('cod') || name.includes('tuna') || name.includes('prawn') || name.includes('seafood') || name.includes('mackerel')) tags.push('fish', 'high-protein');
  if (name.includes('protein')) tags.push('high-protein');
  return unique(tags);
};

const inferMeal = (name, tags) => tags.includes('breakfast') ? 'breakfast' : tags.includes('lunch') ? 'lunch' : 'dinner';
const inferDifficulty = (name) => name.includes('slow cooker') || name.includes('one-pot') || name.includes('air fryer') || name.includes('sandwich') || name.includes('salad') || name.includes('toast') ? 'Easy' : name.includes('wellington') || name.includes('benedict') || name.includes('soufflé') ? 'Hard' : 'Medium';

const makeRecipe = (name) => {
  const lower = name.toLowerCase();
  const cuisine = inferCuisine(lower);
  const { dietTags, ...estimated } = estimateRecipe(name);
  /* Diet tags come from the estimated ingredients, not the name keywords. */
  const tags = unique([
    ...inferTags(lower, cuisine).filter((t) => !['vegan', 'vegetarian', 'meat', 'fish'].includes(t)),
    ...dietTags,
    ...(estimated.ingredients.some((i) => /chicken|beef|pork|lamb|duck|sausage|bacon|steak|burger|meatball|wing/i.test(i.name)) ? ['meat'] : []),
    ...(estimated.ingredients.some((i) => /salmon|cod|haddock|tuna|prawn|mackerel|sardine|crab|lobster|squid/i.test(i.name)) ? ['fish'] : []),
  ]);
  const meal = inferMeal(lower, tags);
  const isBreakfast = meal === 'breakfast';
  const isDessert = ['cake', 'pie', 'pudding', 'brownie', 'blondie', 'mousse', 'tiramisu', 'tart', 'ice cream', 'panna cotta', 'pavlova', 'trifle', 'profiterole', 'cannoli', 'sundae', 'cookie', 'donut', 'doughnut', 'baklava', 'delight'].some((word) => lower.includes(word));
  if (isDessert) tags.push('dessert');
  return {
    id: `master-recipe-${slug(name)}`,
    name,
    title: name,
    emoji: isDessert ? '🍰' : isBreakfast ? '🍳' : '🍲',
    cuisine,
    meal,
    tags: unique(tags),
    time: tags.includes('quick') ? 20 : tags.includes('slow-cooker') ? 480 : tags.includes('air-fryer') ? 30 : isDessert ? 45 : 40,
    prep: tags.includes('quick') ? 5 : 15,
    difficulty: inferDifficulty(lower),
    servings: 4,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
    nutritionStatus: 'estimated-from-ingredients',
    ...estimated,
    discoverable: true,
  };
};

const RAW_GROUPS = {
  breakfast: `Scrambled eggs on toast|Fried eggs on toast|Poached eggs on toast|Boiled eggs and soldiers|Omelette|Cheese omelette|Mushroom omelette|Spanish omelette|Vegetable frittata|Egg muffins|Shakshuka|Eggs Benedict|Eggs Florentine|Eggs Royale|Breakfast burrito|Breakfast quesadilla|Classic porridge|Banana porridge|Apple cinnamon porridge|Berry porridge|Chocolate porridge|Peanut butter porridge|Overnight oats|Berry overnight oats|Chocolate overnight oats|Apple overnight oats|Protein overnight oats|Bircher muesli|Baked oats|Banana baked oats|Chocolate baked oats|Blueberry baked oats|Beans on toast|Cheese on toast|Avocado toast|Avocado and egg toast|Mushroom toast|Tomato toast|Peanut butter toast|Jam toast|Honey toast|French toast|Cinnamon French toast|Breakfast bruschetta|American pancakes|Banana pancakes|Blueberry pancakes|Chocolate pancakes|Protein pancakes|Oat pancakes|Crepes|Lemon and sugar crepes|Nutella-style crepes|Strawberry crepes|Granola bowl|Yoghurt and granola|Fruit and yoghurt bowl|Smoothie bowl|Breakfast smoothie|Breakfast muffin|Breakfast wrap|Breakfast bagel|Sausage sandwich|Bacon sandwich|Sausage and egg muffin|Breakfast hash|Potato breakfast hash`,
  lunch: `Ham and cheese sandwich|Chicken sandwich|Chicken mayo sandwich|Chicken salad sandwich|Tuna mayo sandwich|Egg mayo sandwich|Prawn mayo sandwich|BLT|Club sandwich|Steak sandwich|Roast beef sandwich|Turkey sandwich|Cheese and pickle sandwich|Mozzarella and tomato sandwich|Hummus sandwich|Falafel sandwich|Chicken Caesar wrap|Chicken fajita wrap|Chicken salad wrap|Chicken and bacon wrap|Tuna wrap|Tuna melt wrap|Falafel wrap|Hummus and vegetable wrap|Halloumi wrap|Mexican bean wrap|Buffalo chicken wrap|BBQ chicken wrap|Chicken Caesar salad|Greek salad|Tuna salad|Egg salad|Cobb salad|Garden salad|Pasta salad|Chicken pasta salad|Tuna pasta salad|Potato salad|Quinoa salad|Couscous salad|Lentil salad|Chickpea salad|Halloumi salad|Caprese salad|Fattoush|Tabbouleh|Tomato soup|Chicken soup|Vegetable soup|Lentil soup|Pea soup|Leek and potato soup|Mushroom soup|Carrot and coriander soup|Butternut squash soup|Broccoli and cheese soup|French onion soup|Minestrone|Chicken noodle soup|Miso soup`,
  quick: `Chicken stir fry|Beef stir fry|Prawn stir fry|Vegetable stir fry|Chicken fajitas|Beef fajitas|Prawn fajitas|Chicken wraps|Beef wraps|Chicken fried rice|Egg fried rice|Vegetable fried rice|Chicken noodles|Beef noodles|Prawn noodles|Tuna pasta|Tomato pasta|Garlic pasta|Pesto pasta|Carbonara|Arrabbiata|Pasta primavera|Mac and cheese|Cheese quesadillas|Chicken quesadillas|Beef quesadillas|Bean quesadillas|Loaded baked potato|Tuna baked potato|Cheese baked potato|Beans and cheese baked potato|Chicken baked potato`,
  chicken: `Roast chicken|Roast chicken dinner|Chicken pie|Chicken casserole|Chicken stew|Chicken soup|Chicken pasta|Chicken and mushroom pasta|Creamy chicken pasta|Chicken pesto pasta|Chicken parmesan|Chicken schnitzel|Chicken Kiev|Chicken burgers|Chicken goujons|Chicken nuggets|Chicken skewers|Chicken tikka masala|Chicken korma|Chicken madras|Chicken jalfrezi|Butter chicken|Chicken saag|Chicken vindaloo|Chicken dhansak|Chicken balti|Thai green chicken curry|Thai red chicken curry|Massaman chicken curry|Japanese chicken curry|Teriyaki chicken|Chicken katsu|Chicken katsu curry|Sweet and sour chicken|Kung pao chicken|Orange chicken|Korean fried chicken|Korean BBQ chicken|Chicken chow mein|Chicken fried rice|Chicken ramen|Chicken udon|Chicken yakisoba|Chicken satay|Chicken tacos|Chicken burritos|Chicken enchiladas|Chicken fajitas|Chicken quesadillas|Chicken nachos|Chicken burrito bowl|Mexican chicken rice|BBQ chicken|Honey garlic chicken|Lemon garlic chicken|Garlic butter chicken|Creamy garlic chicken|Creamy mushroom chicken|Honey mustard chicken|Cajun chicken|Peri-peri chicken|Chicken shawarma|Chicken kebab|Chicken souvlaki`,
  beef: `Beef steak|Steak and chips|Steak sandwich|Beef burger|Cheeseburger|Beef meatballs|Beef stew|Beef casserole|Roast beef|Beef pie|Steak pie|Beef stroganoff|Beef Wellington|Beef chilli|Spaghetti bolognese|Beef lasagne|Beef cannelloni|Beef ragu|Beef meatball pasta|Beef mince pasta bake|Beef tacos|Beef burritos|Beef enchiladas|Beef fajitas|Beef quesadillas|Beef nachos|Chilli con carne|Beef burrito bowl|Beef stir fry|Beef chow mein|Beef fried rice|Crispy chilli beef|Beef teriyaki|Beef ramen|Beef udon|Korean beef|Bulgogi|Beef and broccoli|Mongolian beef|Cottage pie|Beef kebab|Beef kofta|Beef shawarma|Beef meatloaf|Beef brisket|BBQ beef ribs|Slow-cooked beef`,
  pork: `Sausage and mash|Sausage casserole|Sausage traybake|Sausage pasta|Sausage rolls|Toad in the hole|Pork chops|Pork schnitzel|Roast pork|Pulled pork|BBQ pulled pork|Pork belly|Pork ribs|Pork stir fry|Pork fried rice|Pork noodles|Sweet and sour pork|Pork dumplings|Pork ramen|Pork katsu|Pork tacos|Pork burritos|Pork carnitas|Pork schnitzel sandwich`,
  lamb: `Roast lamb|Lamb chops|Lamb shank|Lamb stew|Lamb casserole|Lamb curry|Rogan josh|Lamb korma|Lamb madras|Lamb biryani|Lamb kofta|Lamb kebab|Lamb shawarma|Lamb souvlaki|Lamb burgers|Shepherd's pie|Lamb tagine|Moroccan lamb|Greek lamb|Garlic rosemary lamb`,
  fish: `Salmon|Baked salmon|Grilled salmon|Pan-fried salmon|Salmon pasta|Creamy salmon pasta|Salmon pesto pasta|Salmon rice bowl|Teriyaki salmon|Honey garlic salmon|Lemon garlic salmon|Salmon curry|Salmon fishcakes|Salmon burgers|Salmon tacos|Salmon poke bowl|Fish and chips|Baked cod|Cod curry|Cod traybake|Cod fishcakes|Crispy cod|Beer-battered fish|Fish pie|Fish stew|Tuna pasta|Tuna melt|Tuna salad|Tuna rice bowl|Tuna sushi|Mackerel pate|Smoked haddock kedgeree|Kedgeree|Sardine pasta|Sardine toast|Trout with vegetables`,
  seafood: `Prawn curry|Prawn stir fry|Prawn pasta|Garlic prawns|Prawn linguine|Prawn fried rice|Prawn noodles|Prawn tacos|Prawn cocktail|Prawn tempura|Prawn ramen|Seafood pasta|Seafood risotto|Seafood paella|Moules marinière|Garlic mussels|Crab pasta|Crab cakes|Lobster pasta|Calamari|Salt and pepper squid|Seafood chow mein`,
  vegetarian: `Vegetable curry|Chickpea curry|Lentil curry|Paneer curry|Saag paneer|Palak paneer|Vegetable biryani|Vegetable stir fry|Vegetable noodles|Vegetable fried rice|Vegetable lasagne|Vegetable pasta bake|Vegetable risotto|Mushroom risotto|Mushroom stroganoff|Vegetable chilli|Bean chilli|Lentil bolognese|Lentil shepherd's pie|Vegetarian cottage pie|Vegetable fajitas|Bean burritos|Bean tacos|Vegetable enchiladas|Cheese quesadillas|Halloumi burgers|Halloumi wraps|Falafel wraps|Falafel bowls|Vegetable burgers|Stuffed peppers|Stuffed courgettes|Aubergine parmigiana|Ratatouille|Shakshuka|Frittata`,
  vegan: `Vegan chilli|Vegan curry|Chickpea curry|Lentil curry|Dal|Dal makhani|Vegan bolognese|Lentil bolognese|Vegan lasagne|Vegan pasta|Tofu stir fry|Tofu curry|Crispy tofu|Teriyaki tofu|Tofu ramen|Tofu rice bowl|Tempeh stir fry|Seitan stir fry|Vegan fajitas|Vegan tacos|Vegan burritos|Vegan enchiladas|Vegan burgers|Vegan sausages and mash|Falafel|Falafel bowl|Hummus bowl|Buddha bowl|Grain bowl|Jackfruit curry|BBQ jackfruit|Jackfruit tacos`,
  cuisines: `Margherita pizza|Pepperoni pizza|Four cheese pizza|Vegetable pizza|Chicken pizza|BBQ chicken pizza|Mushroom pizza|Cacio e pepe|Amatriciana|Puttanesca|Alfredo|Arancini|Bruschetta|Calzone|Cannoli|Chicken tikka masala|Butter chicken|Chicken jalfrezi|Chicken vindaloo|Chicken balti|Chicken biryani|Lamb vindaloo|Prawn biryani|Jeera rice|Samosas|Onion bhaji|Pakoras|Chicken pakora|Seekh kebab|Tandoori chicken|Aloo paratha|Poppadoms|Beef tacos|Chicken tacos|Fish tacos|Prawn tacos|Loaded nachos|Chicken mole|Mexican street corn|Elote|Special fried rice|Singapore noodles|Chicken in black bean sauce|Chicken in oyster sauce|Cashew chicken|Peking duck|Char siu pork|Hot and sour soup|Egg drop soup|Pork katsu|Miso ramen|Tonkotsu ramen|Poke bowl|Okonomiyaki|Yakitori|Thai green curry|Thai red curry|Panang curry|Chicken pad Thai|Prawn pad Thai|Vegetable pad Thai|Pad see ew|Thai basil chicken|Thai basil beef|Tom yum|Tom kha|Thai fish cakes|Thai beef salad|Green papaya salad|Mango sticky rice|Korean fried chicken|Korean beef bowls|Bibimbap|Chicken bibimbap|Beef bibimbap|Tofu bibimbap|Japchae|Kimchi fried rice|Kimchi pancakes|Tteokbokki|Korean dumplings|Gochujang chicken|Gochujang tofu|Chicken souvlaki|Lamb souvlaki|Chicken gyros|Lamb gyros|Beef gyros|Moussaka|Spanakopita|Pastitsio|Greek lemon chicken|Greek meatballs|Keftedes|Dolmades|Greek roasted potatoes|Moroccan tagine|Chicken tagine|Lamb tagine|Vegetable tagine|Hummus plate|Baba ganoush|Harissa chicken|Mediterranean chicken|Mediterranean pasta|Mediterranean fish|Full English breakfast|Bangers and mash|Steak and kidney pie|Cornish pasty|Lancashire hotpot|Bubble and squeak|Welsh rarebit|Ploughman's lunch|Coronation chicken|Chicken tikka sandwich|Bread and butter pudding|Eton mess|Scones|Bacon cheeseburger|BBQ burger|Pulled pork burger|Fried chicken|Buffalo chicken|Chicken wings|BBQ ribs|Meatloaf|Philly cheesesteak|Sloppy joe|Hot dog|Corn dog|Chicken and waffles|Clam chowder|New England chowder|Loaded fries|Cornbread|Apple pie|Pecan pie|Pumpkin pie|New York cheesecake|Brownies|Cookies|Donuts|Milkshake|Mujaddara|Kibbeh|Fattah|Manakish|Labneh|Stuffed vine leaves|Baklava|Turkish delight`,
  methods: `Chicken one-pot|Beef one-pot|Vegetable casserole|Chicken and rice|Beef and rice|Sausage and beans|Chicken and potatoes|Beef and potatoes|One-pot pasta|One-pot tomato pasta|One-pot creamy chicken pasta|One-pot curry|One-pot chilli|One-pot jambalaya|One-pot paella|One-pot risotto|Chicken traybake|Sausage traybake|Salmon traybake|Cod traybake|Mediterranean chicken traybake|Lemon chicken traybake|Garlic chicken traybake|Fajita traybake|Vegetable traybake|Halloumi traybake|Sausage and potato traybake|Chicken and chorizo traybake|Roasted vegetable traybake|Tuna pasta bake|Chicken pasta bake|Beef pasta bake|Tomato pasta bake|Pesto pasta bake|Sausage pasta bake|Vegetable pasta bake|Spinach and ricotta pasta bake|Chicken Alfredo pasta bake|Chicken pilau|Pilau rice|Mexican rice|Spanish rice|Chicken paella|Mushroom risotto|Chicken risotto|Beef rice bowl|Chicken rice bowl|Salmon rice bowl|Teriyaki rice bowl|Burrito bowl|Baked potato|Loaded baked potato|Mashed potato|Garlic mashed potato|Roast potatoes|Crispy roast potatoes|Dauphinoise potatoes|Hasselback potatoes|Jacket potato|Potato wedges|Homemade chips|Sweet potato fries|Sweet potato mash|Hash browns|Bubble and squeak|Potato gratin|Potato dauphinoise|Potato salad|Spanish tortilla|Bombay potatoes|Aloo gobi|Saag aloo|Potato curry|Slow cooker beef stew|Slow cooker chicken curry|Slow cooker beef curry|Slow cooker lamb curry|Slow cooker pulled pork|Slow cooker pulled chicken|Slow cooker chilli|Slow cooker bolognese|Slow cooker chicken casserole|Slow cooker beef casserole|Slow cooker lamb stew|Slow cooker chicken tikka masala|Slow cooker butter chicken|Slow cooker pulled BBQ beef|Slow cooker sausage casserole|Split pea soup|Broccoli soup|Cauliflower soup|Pumpkin soup|Ramen soup|Thai coconut soup|Mulligatawny|Laksa|Tomato sauce|Cheese sauce|Béchamel|Mushroom sauce|Peppercorn sauce|Diane sauce|Curry sauce|Tikka sauce|Korma sauce|Madras sauce|Jalfrezi sauce|Thai green curry sauce|Thai red curry sauce|Teriyaki sauce|Sweet and sour sauce|Black bean sauce|Satay sauce|Peanut sauce|Hoisin sauce|Buffalo sauce|Garlic dip|Bread sauce|Side salad|Victoria sponge|Chocolate cake|Lemon drizzle|Carrot cake|Coffee cake|Banana bread|Red velvet cake|Madeira cake|Marble cake|Coconut cake|Orange cake|Chocolate brownies|Blondies|Chocolate chip cookies|Oat cookies|Shortbread|Flapjacks|Muffins|Blueberry muffins|Chocolate muffins|Cupcakes|Doughnuts|Cinnamon rolls|Apple pie|Cherry pie|Lemon tart|Bakewell tart|Custard tart|Chocolate tart|Fruit tart|Treacle tart|Pumpkin pie|Pecan pie|Apple crumble|Chocolate fondant|Chocolate mousse|New York cheesecake|Lemon cheesecake|Banoffee pie|Fruit salad|Affogato|Ice cream sundae|Brownie sundae|Leftover chicken fried rice|Leftover chicken curry|Leftover chicken wraps|Leftover chicken pasta|Leftover chicken soup|Leftover roast chicken pie|Leftover roast beef sandwiches|Leftover beef curry|Leftover beef fried rice|Leftover roast lamb curry|Leftover lamb wraps|Leftover vegetables soup|Leftover vegetable curry|Leftover roast potato hash|Leftover pasta bake|Leftover rice stir fry|Leftover turkey curry|Turkey sandwiches|Turkey pie`,
};

const names = Object.values(RAW_GROUPS).flatMap((group) => group.split('|'));
const seen = new Set();
export const MASTER_RECIPE_EXPANSION = names
  .map((name) => name.trim())
  .filter((name) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .map(makeRecipe);
