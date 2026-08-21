/**
 * The recipe book.
 *
 * A handful of signature dishes are written out in full below; the rest of the
 * library is composed from real ingredients by `recipe-gen.js`, so every
 * dish's calories, macros, cost and scores are computed from what is actually
 * in it. There are no ratings: nothing here has been cooked by anyone but you,
 * so dishes are judged on time, cost, protein and their health/planet scores.
 *
 * Hero art is an emoji key rendered as a monochrome icon, so the app stays
 * fully offline and self-contained.
 */
import { generateRecipes } from './recipe-gen.js';

const SIGNATURE = [
  {
    id: 'chicken-traybake', name: 'Lemon Chicken Traybake', emoji: '🍗',
    cuisine: 'British', tags: ['high-protein', 'one-pot', 'family', 'budget'],
    time: 45, prep: 10, difficulty: 'Easy', costPerServing: 1.85, servings: 4,
    kcal: 520, protein: 42, carbs: 38, fat: 21, fibre: 6,
    healthScore: 82, envScore: 68, proteinScore: 92,
    ingredients: [
      { name: 'Chicken thighs', qty: '8' },
      { name: 'New potatoes', qty: '600g' },
      { name: 'Lemon', qty: '1' },
      { name: 'Red onion', qty: '2' },
      { name: 'Garlic', qty: '4 cloves' },
      { name: 'Olive oil', qty: '2 tbsp' },
      { name: 'Oregano', qty: '1 tsp' },
    ],
    steps: [
      { text: 'Heat the oven to 200°C fan. Halve the potatoes and quarter the onions.' },
      { text: 'Toss everything in a large roasting tin with oil, oregano, salt and pepper.' },
      { text: 'Nestle the chicken skin-side up. Squeeze over the lemon, tuck the halves in.' },
      { text: 'Roast until the chicken is golden and cooked through.', timerMins: 40 },
      { text: 'Rest for 5 minutes, spoon over the pan juices and serve.', timerMins: 5 },
    ],
  },
  {
    id: 'chickpea-curry', name: 'Coconut Chickpea Curry', emoji: '🍛',
    cuisine: 'Indian', tags: ['vegan', 'budget', 'one-pot', 'quick', 'freezer'],
    time: 25, prep: 5, difficulty: 'Easy', costPerServing: 1.1, servings: 4,
    kcal: 430, protein: 14, carbs: 48, fat: 19, fibre: 11,
    healthScore: 88, envScore: 94, proteinScore: 55,
    ingredients: [
      { name: 'Chickpeas (tins)', qty: '2' },
      { name: 'Coconut milk', qty: '1 tin' },
      { name: 'Chopped tomatoes', qty: '1 tin' },
      { name: 'Onion', qty: '1' },
      { name: 'Curry paste', qty: '3 tbsp' },
      { name: 'Spinach', qty: '150g' },
      { name: 'Rice', qty: '300g' },
    ],
    steps: [
      { text: 'Soften the diced onion in a splash of oil over medium heat.', timerMins: 5 },
      { text: 'Stir in the curry paste and cook until fragrant.', timerMins: 1 },
      { text: 'Add chickpeas, tomatoes and coconut milk. Simmer.', timerMins: 12 },
      { text: 'Meanwhile cook the rice. Fold spinach through the curry to wilt.' },
      { text: 'Season, spoon over rice, and serve.' },
    ],
  },
  {
    id: 'salmon-teriyaki', name: 'Teriyaki Salmon Bowls', emoji: '🍣',
    cuisine: 'Japanese', tags: ['high-protein', 'quick', 'healthy', 'date-night'],
    time: 20, prep: 8, difficulty: 'Medium', costPerServing: 3.4, servings: 2,
    kcal: 560, protein: 38, carbs: 52, fat: 22, fibre: 5,
    healthScore: 90, envScore: 61, proteinScore: 88,
    ingredients: [
      { name: 'Salmon fillets', qty: '2' },
      { name: 'Sushi rice', qty: '200g' },
      { name: 'Soy sauce', qty: '3 tbsp' },
      { name: 'Honey', qty: '1 tbsp' },
      { name: 'Ginger', qty: 'thumb' },
      { name: 'Broccoli', qty: '1 head' },
      { name: 'Sesame seeds', qty: '1 tsp' },
    ],
    steps: [
      { text: 'Rinse and cook the rice; steam the broccoli over the same pan.', timerMins: 12 },
      { text: 'Whisk soy, honey and grated ginger into a glaze.' },
      { text: 'Pan-fry the salmon skin-side down until crisp.', timerMins: 4 },
      { text: 'Flip, pour in the glaze and let it bubble to a shine.', timerMins: 2 },
      { text: 'Build bowls, spoon over glaze, scatter sesame seeds.' },
    ],
  },
  {
    id: 'veg-chilli', name: 'Smoky Three-Bean Chilli', emoji: '🌶️',
    cuisine: 'Mexican', tags: ['vegan', 'budget', 'batch', 'freezer', 'family'],
    time: 40, prep: 10, difficulty: 'Easy', costPerServing: 0.95, servings: 6,
    kcal: 380, protein: 17, carbs: 55, fat: 8, fibre: 15,
    healthScore: 91, envScore: 96, proteinScore: 60,
    ingredients: [
      { name: 'Mixed beans (tins)', qty: '3' },
      { name: 'Chopped tomatoes', qty: '2 tins' },
      { name: 'Onion', qty: '2' },
      { name: 'Smoked paprika', qty: '2 tsp' },
      { name: 'Cumin', qty: '2 tsp' },
      { name: 'Peppers', qty: '2' },
      { name: 'Dark chocolate', qty: '2 squares' },
    ],
    steps: [
      { text: 'Sweat the onions and peppers until soft.', timerMins: 8 },
      { text: 'Add the spices and toast for a minute.' },
      { text: 'Tip in beans and tomatoes, simmer low and slow.', timerMins: 25 },
      { text: 'Stir in the chocolate, season, rest 5 minutes and serve.', timerMins: 5 },
    ],
  },
  {
    id: 'overnight-oats', name: 'Berry Overnight Oats', emoji: '🫐',
    cuisine: 'British', tags: ['breakfast', 'meal-prep', 'healthy', 'quick', 'budget'],
    time: 5, prep: 5, difficulty: 'Easy', costPerServing: 0.7, servings: 1,
    kcal: 340, protein: 15, carbs: 48, fat: 9, fibre: 8,
    healthScore: 89, envScore: 90, proteinScore: 58,
    ingredients: [
      { name: 'Oats', qty: '50g' },
      { name: 'Greek yogurt', qty: '100g' },
      { name: 'Milk', qty: '100ml' },
      { name: 'Frozen berries', qty: '80g' },
      { name: 'Honey', qty: '1 tsp' },
      { name: 'Chia seeds', qty: '1 tsp' },
    ],
    steps: [
      { text: 'Stir oats, chia, milk and yogurt together in a jar.' },
      { text: 'Ripple through the berries and honey.' },
      { text: 'Lid on, fridge overnight. Eat cold or warmed.' },
    ],
  },
  {
    id: 'airfryer-fajitas', name: 'Air Fryer Chicken Fajitas', emoji: '🌮',
    cuisine: 'Mexican', tags: ['air-fryer', 'quick', 'family', 'high-protein'],
    time: 18, prep: 8, difficulty: 'Easy', costPerServing: 2.1, servings: 4,
    kcal: 480, protein: 36, carbs: 44, fat: 16, fibre: 7,
    healthScore: 78, envScore: 70, proteinScore: 84,
    ingredients: [
      { name: 'Chicken breast', qty: '500g' },
      { name: 'Peppers', qty: '3' },
      { name: 'Red onion', qty: '1' },
      { name: 'Fajita seasoning', qty: '2 tbsp' },
      { name: 'Tortillas', qty: '8' },
      { name: 'Soured cream', qty: '150ml' },
      { name: 'Lime', qty: '1' },
    ],
    steps: [
      { text: 'Slice chicken, peppers and onion; toss with seasoning and a little oil.' },
      { text: 'Air fry at 200°C, shaking halfway.', timerMins: 14 },
      { text: 'Warm the tortillas. Squeeze lime over the filling.' },
      { text: 'Serve with soured cream and let everyone build their own.' },
    ],
  },
  {
    id: 'mushroom-risotto', name: 'Garlic Mushroom Risotto', emoji: '🍄',
    cuisine: 'Italian', tags: ['vegetarian', 'comfort', 'date-night', 'one-pot'],
    time: 35, prep: 10, difficulty: 'Medium', costPerServing: 1.6, servings: 3,
    kcal: 510, protein: 13, carbs: 68, fat: 18, fibre: 4,
    healthScore: 72, envScore: 85, proteinScore: 40,
    ingredients: [
      { name: 'Arborio rice', qty: '250g' },
      { name: 'Chestnut mushrooms', qty: '300g' },
      { name: 'Vegetable stock', qty: '1L' },
      { name: 'White onion', qty: '1' },
      { name: 'Garlic', qty: '3 cloves' },
      { name: 'Parmesan', qty: '40g' },
      { name: 'Butter', qty: '25g' },
    ],
    steps: [
      { text: 'Fry mushrooms hard in butter until golden; set aside.', timerMins: 6 },
      { text: 'Soften onion and garlic, then toast the rice for a minute.', timerMins: 4 },
      { text: 'Add hot stock a ladle at a time, stirring, until creamy.', timerMins: 18 },
      { text: 'Beat in parmesan, butter and the mushrooms. Rest 2 minutes.', timerMins: 2 },
    ],
  },
  {
    id: 'slowcooker-ragu', name: 'Slow Cooker Beef Ragù', emoji: '🍝',
    cuisine: 'Italian', tags: ['slow-cooker', 'batch', 'family', 'comfort', 'freezer'],
    time: 480, prep: 15, difficulty: 'Easy', costPerServing: 2.3, servings: 6,
    kcal: 590, protein: 34, carbs: 62, fat: 22, fibre: 6,
    healthScore: 70, envScore: 48, proteinScore: 80,
    ingredients: [
      { name: 'Beef shin', qty: '800g' },
      { name: 'Passata', qty: '700g' },
      { name: 'Carrots', qty: '2' },
      { name: 'Celery', qty: '2 sticks' },
      { name: 'Red wine', qty: '150ml' },
      { name: 'Pappardelle', qty: '500g' },
      { name: 'Bay leaves', qty: '2' },
    ],
    steps: [
      { text: 'Brown the beef in batches; deglaze the pan with the wine.' },
      { text: 'Everything into the slow cooker on low.', timerMins: 480 },
      { text: 'Shred the beef into the sauce and season.' },
      { text: 'Cook the pasta, toss with the ragù and serve.', timerMins: 10 },
    ],
  },
  {
    id: 'halloumi-grain', name: 'Halloumi Grain Bowl', emoji: '🥗',
    cuisine: 'Mediterranean', tags: ['vegetarian', 'healthy', 'quick', 'lunch'],
    time: 15, prep: 5, difficulty: 'Easy', costPerServing: 2.0, servings: 2,
    kcal: 470, protein: 21, carbs: 45, fat: 24, fibre: 9,
    healthScore: 84, envScore: 76, proteinScore: 62,
    ingredients: [
      { name: 'Halloumi', qty: '200g' },
      { name: 'Mixed grains pouch', qty: '250g' },
      { name: 'Cucumber', qty: '1/2' },
      { name: 'Cherry tomatoes', qty: '150g' },
      { name: 'Hummus', qty: '3 tbsp' },
      { name: 'Lemon', qty: '1/2' },
    ],
    steps: [
      { text: 'Griddle halloumi slices until striped and squeaky.', timerMins: 4 },
      { text: 'Heat the grains; chop the salad.' },
      { text: 'Bowl up with hummus, lemon and lots of pepper.' },
    ],
  },
  {
    id: 'tofu-stirfry', name: 'Crispy Tofu Stir-fry', emoji: '🥡',
    cuisine: 'Chinese', tags: ['vegan', 'quick', 'healthy', 'high-protein'],
    time: 20, prep: 10, difficulty: 'Medium', costPerServing: 1.5, servings: 2,
    kcal: 410, protein: 24, carbs: 42, fat: 15, fibre: 8,
    healthScore: 87, envScore: 92, proteinScore: 70,
    ingredients: [
      { name: 'Firm tofu', qty: '280g' },
      { name: 'Cornflour', qty: '2 tbsp' },
      { name: 'Stir-fry veg', qty: '320g' },
      { name: 'Noodles', qty: '2 nests' },
      { name: 'Soy sauce', qty: '3 tbsp' },
      { name: 'Sriracha', qty: '1 tbsp' },
    ],
    steps: [
      { text: 'Press, cube and toss tofu in cornflour; fry until crisp.', timerMins: 8 },
      { text: 'Wok the veg on high heat.', timerMins: 3 },
      { text: 'Add noodles, sauces and tofu; toss for a minute and serve.' },
    ],
  },
  {
    id: 'shakshuka', name: 'One-Pan Shakshuka', emoji: '🍳',
    cuisine: 'Mediterranean', tags: ['vegetarian', 'breakfast', 'budget', 'one-pot', 'quick'],
    time: 22, prep: 5, difficulty: 'Easy', costPerServing: 1.2, servings: 2,
    kcal: 360, protein: 18, carbs: 24, fat: 20, fibre: 6,
    healthScore: 85, envScore: 88, proteinScore: 64,
    ingredients: [
      { name: 'Eggs', qty: '4' },
      { name: 'Chopped tomatoes', qty: '1 tin' },
      { name: 'Red pepper', qty: '1' },
      { name: 'Onion', qty: '1' },
      { name: 'Cumin', qty: '1 tsp' },
      { name: 'Crusty bread', qty: '1/2 loaf' },
    ],
    steps: [
      { text: 'Soften onion and pepper with the cumin.', timerMins: 6 },
      { text: 'Add tomatoes, simmer to a thick sauce.', timerMins: 8 },
      { text: 'Make wells, crack in the eggs, lid on until just set.', timerMins: 5 },
      { text: 'Serve from the pan with torn bread.' },
    ],
  },
  {
    id: 'katsu-curry', name: 'Crispy Katsu Curry', emoji: '🍱',
    cuisine: 'Japanese', tags: ['family', 'comfort', 'trending'],
    time: 40, prep: 15, difficulty: 'Medium', costPerServing: 2.4, servings: 4,
    kcal: 640, protein: 33, carbs: 72, fat: 24, fibre: 5,
    healthScore: 65, envScore: 66, proteinScore: 74,
    ingredients: [
      { name: 'Chicken breast', qty: '4' },
      { name: 'Panko breadcrumbs', qty: '100g' },
      { name: 'Eggs', qty: '2' },
      { name: 'Curry roux block', qty: '1/2 pack' },
      { name: 'Carrot', qty: '1' },
      { name: 'Rice', qty: '300g' },
    ],
    steps: [
      { text: 'Butterfly the chicken; coat in flour, egg, then panko.' },
      { text: 'Simmer carrot and roux into a glossy curry sauce.', timerMins: 10 },
      { text: 'Shallow-fry the chicken until deep gold.', timerMins: 8 },
      { text: 'Slice over rice and pour the sauce across.' },
    ],
  },
  {
    id: 'protein-pancakes', name: 'Banana Protein Pancakes', emoji: '🥞',
    cuisine: 'American', tags: ['breakfast', 'high-protein', 'quick', 'healthy'],
    time: 15, prep: 5, difficulty: 'Easy', costPerServing: 1.0, servings: 2,
    kcal: 390, protein: 28, carbs: 46, fat: 10, fibre: 4,
    healthScore: 80, envScore: 86, proteinScore: 78,
    ingredients: [
      { name: 'Banana', qty: '2' },
      { name: 'Eggs', qty: '2' },
      { name: 'Oats', qty: '60g' },
      { name: 'Protein powder', qty: '1 scoop' },
      { name: 'Greek yogurt', qty: 'to serve' },
    ],
    steps: [
      { text: 'Blitz banana, eggs, oats and protein into a batter.' },
      { text: 'Fry small pancakes in batches, flipping once bubbles form.', timerMins: 8 },
      { text: 'Stack with yogurt and whatever fruit needs using.' },
    ],
  },
];

/** Which meal a signature dish belongs to, read off its tags. */
const mealOf = (r) =>
  (r.tags.includes('breakfast') && 'breakfast')
  || (r.tags.includes('lunch') && 'lunch')
  || 'dinner';

export const RECIPES = [
  ...SIGNATURE.map((r) => ({ ...r, meal: mealOf(r), signature: true })),
  ...generateRecipes(),
];

/**
 * Recipes you added — generated, imported or shared with you — live in app
 * state, not here. The store hands them over so that anything looking a recipe
 * up by id (the plan, the shopping list, the cook history) finds yours too.
 */
let mine = [];
export const setMyRecipes = (list = []) => { mine = list; };
export const myRecipes = () => mine;

/** Every dish available right now: the book plus whatever you added. */
export const allRecipes = () => (mine.length ? [...RECIPES, ...mine] : RECIPES);

export const byId = (id) => RECIPES.find((r) => r.id === id) || mine.find((r) => r.id === id);

/** Recipes for one slot of the day. */
export const forMeal = (meal) => (meal ? allRecipes().filter((r) => r.meal === meal) : allRecipes());

export const DISCOVER_FILTERS = [
  'Breakfast', 'Lunch', 'Dinner', 'Quick', 'Budget', 'High protein', 'Healthy',
  'Light', 'One pot', 'Batch cook', 'Vegan', 'Vegetarian', 'Comfort food',
  'Italian', 'Indian', 'Mexican', 'Japanese', 'Mediterranean', 'British', 'Chinese',
];

const FILTER_MAP = {
  Breakfast: (r) => r.meal === 'breakfast',
  Lunch: (r) => r.meal === 'lunch',
  Dinner: (r) => r.meal === 'dinner',
  Light: (r) => r.kcal <= 450,
  'Batch cook': (r) => r.tags.includes('batch') || r.tags.includes('freezer'),
  Healthy: (r) => r.healthScore >= 84,
  Budget: (r) => r.costPerServing <= 1.5,
  Quick: (r) => r.time <= 25,
  'Air fryer': (r) => r.tags.includes('air-fryer'),
  'Slow cooker': (r) => r.tags.includes('slow-cooker'),
  'One pot': (r) => r.tags.includes('one-pot'),
  'High protein': (r) => r.tags.includes('high-protein'),
  Vegan: (r) => r.tags.includes('vegan'),
  Vegetarian: (r) => r.tags.includes('vegetarian') || r.tags.includes('vegan'),
  'Comfort food': (r) => r.tags.includes('comfort'),
};

export const filterRecipes = (filter, pool = allRecipes()) => {
  if (!filter) return pool;
  const fn = FILTER_MAP[filter] || ((r) => r.cuisine === filter);
  return pool.filter(fn);
};
