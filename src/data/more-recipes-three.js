/**
 * Another wave of recipe-discovery shells.
 *
 * These are discovery entries, not signature dishes: they carry no ingredient
 * weights or nutrition of their own, so planning maths keeps treating them as
 * estimates (`nutritionStatus`) until generated or imported data fills them
 * in. Ids are namespaced `more3-` to stay clear of every earlier pool.
 */
const make = (id, name, cuisine, meal, tags, difficulty = 'Easy', time = 30) => ({
  id: `more3-${id}`, name, title: name,
  emoji: meal === 'breakfast' ? '🍳' : meal === 'lunch' ? '🥗' : '🍲',
  cuisine, meal,
  tags: [...new Set([cuisine.toLowerCase(), ...tags])],
  time, prep: Math.min(15, time), difficulty, servings: 4,
  kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0,
  nutritionStatus: 'estimated-from-ingredients',
  ingredients: [], steps: [], discoverable: true,
});

export const MORE_RECIPES_THREE = [
  /* Breakfast */
  make('eggs-royale', 'Eggs Royale', 'British', 'breakfast', ['breakfast', 'celebration', 'date-night'], 'Medium', 30),
  make('shakshuka-bowls', 'Shakshuka Breakfast Bowls', 'Mediterranean', 'breakfast', ['breakfast', 'vegetarian', 'one-pot'], 'Easy', 25),
  make('oat-pancakes', 'Oat and Banana Pancakes', 'British', 'breakfast', ['breakfast', 'vegetarian', 'budget'], 'Easy', 20),
  make('breakfast-burritos', 'Freezer Breakfast Burritos', 'Mexican', 'breakfast', ['breakfast', 'meal-prep', 'freezer', 'high-protein'], 'Easy', 40),
  make('bircher-muesli', 'Bircher Muesli Bowls', 'Swiss', 'breakfast', ['breakfast', 'vegetarian', 'meal-prep', 'healthy'], 'Easy', 10),
  make('baked-oats', 'Blueberry Baked Oats', 'British', 'breakfast', ['breakfast', 'vegetarian', 'meal-prep'], 'Easy', 35),
  make('breakfast-hash', 'Potato and Egg Breakfast Hash', 'American', 'breakfast', ['breakfast', 'one-pot', 'budget', 'high-protein'], 'Easy', 25),
  make('smoothie-bowls', 'Berry Smoothie Bowls', 'American', 'breakfast', ['breakfast', 'vegan', 'vegetarian', 'healthy', 'quick'], 'Easy', 10),

  /* Lunch */
  make('chicken-soup', 'Classic Chicken Soup', 'British', 'lunch', ['lunch', 'one-pot', 'comfort', 'high-protein'], 'Easy', 45),
  make('leek-potato-soup', 'Leek and Potato Soup', 'British', 'lunch', ['lunch', 'vegetarian', 'budget', 'one-pot', 'freezer'], 'Easy', 40),
  make('carrot-coriander-soup', 'Carrot and Coriander Soup', 'British', 'lunch', ['lunch', 'vegetarian', 'vegan', 'budget', 'freezer'], 'Easy', 35),
  make('butternut-soup', 'Butternut Squash Soup', 'British', 'lunch', ['lunch', 'vegetarian', 'vegan', 'freezer'], 'Easy', 45),
  make('minestrone', 'Minestrone Soup', 'Italian', 'lunch', ['lunch', 'vegetarian', 'vegan', 'one-pot', 'freezer'], 'Easy', 45),
  make('french-onion-soup', 'French Onion Soup', 'French', 'lunch', ['lunch', 'vegetarian', 'comfort'], 'Medium', 60),
  make('tuna-nicoise', 'Tuna Niçoise Salad', 'French', 'lunch', ['lunch', 'high-protein', 'healthy'], 'Easy', 25),
  make('quinoa-salad', 'Lemon Quinoa Salad', 'Mediterranean', 'lunch', ['lunch', 'vegan', 'vegetarian', 'meal-prep', 'healthy'], 'Easy', 20),
  make('chickpea-salad', 'Chickpea and Feta Salad', 'Greek', 'lunch', ['lunch', 'vegetarian', 'meal-prep', 'budget'], 'Easy', 15),
  make('lentil-salad', 'Warm Lentil Salad', 'French', 'lunch', ['lunch', 'vegan', 'vegetarian', 'meal-prep', 'healthy'], 'Easy', 30),
  make('chicken-caesar-wrap', 'Chicken Caesar Wraps', 'American', 'lunch', ['lunch', 'quick', 'high-protein'], 'Easy', 15),
  make('halloumi-burger', 'Halloumi Burgers', 'Greek', 'lunch', ['lunch', 'vegetarian', 'quick'], 'Easy', 25),
  make('tuna-melt', 'Tuna Melt Toastie', 'American', 'lunch', ['lunch', 'quick', 'budget', 'high-protein'], 'Easy', 15),
  make('falafel-bowl', 'Falafel Grain Bowls', 'Middle Eastern', 'lunch', ['lunch', 'vegan', 'vegetarian', 'meal-prep'], 'Medium', 40),

  /* Dinner — chicken */
  make('chicken-schnitzel', 'Crispy Chicken Schnitzel', 'German', 'dinner', ['family', 'high-protein', 'comfort'], 'Medium', 35),
  make('chicken-kiev', 'Garlic Chicken Kiev', 'British', 'dinner', ['family', 'high-protein', 'comfort'], 'Medium', 50),
  make('honey-garlic-chicken', 'Honey Garlic Chicken', 'Chinese', 'dinner', ['quick', 'high-protein', 'family'], 'Easy', 25),
  make('creamy-mushroom-chicken', 'Creamy Mushroom Chicken', 'British', 'dinner', ['comfort', 'high-protein', 'one-pot'], 'Easy', 35),
  make('peri-peri-chicken', 'Peri-Peri Chicken', 'Portuguese', 'dinner', ['high-protein', 'family'], 'Medium', 50),
  make('chicken-souvlaki', 'Chicken Souvlaki', 'Greek', 'dinner', ['high-protein', 'quick', 'family'], 'Easy', 30),
  make('chicken-satay', 'Chicken Satay Skewers', 'Thai', 'dinner', ['high-protein', 'quick', 'trending'], 'Medium', 35),
  make('chicken-burrito-bowl', 'Chicken Burrito Bowls', 'Mexican', 'dinner', ['meal-prep', 'high-protein', 'family'], 'Easy', 35),
  make('chicken-enchiladas', 'Chicken Enchiladas', 'Mexican', 'dinner', ['family', 'batch', 'comfort'], 'Medium', 55),
  make('chicken-pot-pie', 'Chicken Pot Pie', 'British', 'dinner', ['family', 'comfort'], 'Medium', 65),

  /* Dinner — beef, pork, lamb */
  make('beef-meatballs', 'Beef Meatballs in Tomato Sauce', 'Italian', 'dinner', ['family', 'batch', 'freezer', 'high-protein'], 'Medium', 50),
  make('beef-wellington', 'Beef Wellington', 'British', 'dinner', ['celebration', 'date-night', 'comfort'], 'Hard', 120),
  make('bulgogi', 'Korean Beef Bulgogi', 'Korean', 'dinner', ['quick', 'high-protein'], 'Medium', 30),
  make('mongolian-beef', 'Mongolian Beef', 'Chinese', 'dinner', ['quick', 'high-protein'], 'Easy', 25),
  make('beef-barley-stew', 'Beef and Barley Stew', 'British', 'dinner', ['one-pot', 'batch', 'comfort', 'freezer'], 'Easy', 120),
  make('pulled-pork', 'Slow Cooker Pulled Pork', 'American', 'dinner', ['slow-cooker', 'batch', 'family', 'freezer'], 'Easy', 480),
  make('pork-chops-apple', 'Pork Chops with Apples', 'British', 'dinner', ['one-pot', 'comfort', 'high-protein'], 'Easy', 40),
  make('lamb-shank', 'Braised Lamb Shanks', 'British', 'dinner', ['comfort', 'celebration', 'one-pot'], 'Medium', 180),
  make('lamb-kofta', 'Lamb Kofta Kebabs', 'Middle Eastern', 'dinner', ['high-protein', 'quick'], 'Medium', 30),
  make('sausage-traybake', 'Sausage and Veg Traybake', 'British', 'dinner', ['one-pot', 'family', 'budget'], 'Easy', 45),
  make('toad-in-the-hole', 'Toad in the Hole', 'British', 'dinner', ['family', 'comfort', 'budget'], 'Medium', 45),

  /* Dinner — fish and seafood */
  make('fish-and-chips', 'Homemade Fish and Chips', 'British', 'dinner', ['family', 'comfort'], 'Medium', 60),
  make('fish-pie', 'Creamy Fish Pie', 'British', 'dinner', ['family', 'comfort', 'high-protein'], 'Medium', 70),
  make('salmon-fishcakes', 'Salmon Fishcakes', 'British', 'dinner', ['family', 'high-protein', 'budget'], 'Medium', 40),
  make('kedgeree', 'Smoked Haddock Kedgeree', 'Indian', 'dinner', ['one-pot', 'high-protein'], 'Medium', 45),
  make('seafood-paella', 'Seafood Paella', 'Spanish', 'dinner', ['one-pot', 'celebration', 'high-protein'], 'Hard', 60),
  make('prawn-linguine', 'Garlic Prawn Linguine', 'Italian', 'dinner', ['quick', 'high-protein', 'date-night'], 'Easy', 25),
  make('moules-mariniere', 'Moules Marinière', 'French', 'dinner', ['quick', 'date-night'], 'Easy', 30),
  make('crab-cakes', 'Crab Cakes', 'American', 'dinner', ['quick', 'high-protein'], 'Medium', 30),
  make('cod-traybake', 'Cod and Chorizo Traybake', 'Spanish', 'dinner', ['one-pot', 'healthy', 'high-protein'], 'Easy', 40),

  /* Dinner — vegetarian and vegan */
  make('mushroom-stroganoff', 'Mushroom Stroganoff', 'Russian', 'dinner', ['vegetarian', 'comfort', 'quick'], 'Easy', 30),
  make('aubergine-parmigiana', 'Aubergine Parmigiana', 'Italian', 'dinner', ['vegetarian', 'comfort', 'family'], 'Medium', 70),
  make('spanakopita', 'Spanakopita', 'Greek', 'dinner', ['vegetarian', 'family'], 'Medium', 60),
  make('moussaka', 'Moussaka', 'Greek', 'dinner', ['vegetarian', 'family', 'comfort'], 'Hard', 90),
  make('dolmades', 'Dolmades with Lemon Yogurt', 'Greek', 'dinner', ['vegetarian', 'meze'], 'Medium', 50),
  make('jackfruit-curry', 'Jackfruit Curry', 'Indian', 'dinner', ['vegan', 'vegetarian', 'one-pot'], 'Easy', 40),
  make('tofu-teriyaki', 'Teriyaki Tofu Bowls', 'Japanese', 'dinner', ['vegan', 'vegetarian', 'quick', 'high-protein'], 'Easy', 30),
  make('tempeh-stirfry', 'Tempeh and Broccoli Stir-fry', 'Chinese', 'dinner', ['vegan', 'vegetarian', 'quick', 'high-protein'], 'Easy', 25),
  make('vegan-bolognese', 'Lentil Bolognese', 'Italian', 'dinner', ['vegan', 'vegetarian', 'batch', 'freezer', 'budget'], 'Easy', 45),
  make('buddha-bowl', 'Roasted Buddha Bowls', 'Mediterranean', 'dinner', ['vegan', 'vegetarian', 'meal-prep', 'healthy'], 'Easy', 45),
  make('gochujang-tofu', 'Gochujang Crispy Tofu', 'Korean', 'dinner', ['vegan', 'vegetarian', 'quick', 'trending'], 'Easy', 30),

  /* International dinners */
  make('pad-see-ew', 'Pad See Ew', 'Thai', 'dinner', ['quick', 'high-protein'], 'Easy', 25),
  make('tom-kha', 'Tom Kha Gai', 'Thai', 'dinner', ['one-pot', 'quick', 'comfort'], 'Easy', 30),
  make('massaman-curry', 'Massaman Beef Curry', 'Thai', 'dinner', ['one-pot', 'comfort', 'batch'], 'Medium', 120),
  make('japchae', 'Japchae Glass Noodles', 'Korean', 'dinner', ['vegetarian', 'vegan', 'quick'], 'Medium', 35),
  make('kimchi-fried-rice', 'Kimchi Fried Rice', 'Korean', 'dinner', ['quick', 'budget', 'leftovers'], 'Easy', 20),
  make('ttokbokki', 'Tteokbokki', 'Korean', 'dinner', ['quick', 'vegetarian', 'trending'], 'Easy', 30),
  make('peking-duck-pancakes', 'Crispy Duck Pancakes', 'Chinese', 'dinner', ['date-night', 'celebration'], 'Hard', 90),
  make('char-siu', 'Char Siu Pork', 'Chinese', 'dinner', ['batch', 'high-protein', 'family'], 'Medium', 90),
  make('bao-buns', 'Steamed Bao Buns', 'Chinese', 'dinner', ['family', 'trending'], 'Hard', 120),
  make('gyoza', 'Pork and Chive Gyoza', 'Japanese', 'dinner', ['family', 'batch', 'freezer'], 'Medium', 60),
  make('onigiri', 'Salmon Onigiri', 'Japanese', 'lunch', ['lunch', 'meal-prep', 'quick'], 'Easy', 30),
  make('okonomiyaki', 'Okonomiyaki', 'Japanese', 'dinner', ['vegetarian', 'quick', 'budget'], 'Medium', 35),
  make('shakshuka-dinner', 'Harissa Shakshuka', 'Middle Eastern', 'dinner', ['vegetarian', 'vegan', 'one-pot', 'budget'], 'Easy', 30),
  make('shawarma-plate', 'Chicken Shawarma Plates', 'Middle Eastern', 'dinner', ['high-protein', 'family'], 'Medium', 50),
  make('mujaddara', 'Mujaddara', 'Middle Eastern', 'dinner', ['vegan', 'vegetarian', 'budget', 'batch'], 'Easy', 50),
  make('kofta-curry', 'Kofta Curry', 'Indian', 'dinner', ['high-protein', 'comfort', 'family'], 'Medium', 55),
  make('saag-aloo', 'Saag Aloo', 'Indian', 'dinner', ['vegetarian', 'vegan', 'budget', 'quick'], 'Easy', 35),
  make('matar-paneer', 'Matar Paneer', 'Indian', 'dinner', ['vegetarian', 'family', 'high-protein'], 'Medium', 45),
  make('chicken-biryani', 'Chicken Biryani', 'Indian', 'dinner', ['family', 'celebration', 'batch'], 'Hard', 90),

  /* Bakes, sides and one-pots */
  make('dauphinoise', 'Dauphinoise Potatoes', 'French', 'dinner', ['vegetarian', 'celebration', 'comfort'], 'Medium', 90),
  make('roast-potatoes', 'Crispy Roast Potatoes', 'British', 'dinner', ['vegetarian', 'vegan', 'celebration'], 'Easy', 60),
  make('cauliflower-cheese', 'Cauliflower Cheese', 'British', 'dinner', ['vegetarian', 'comfort', 'family'], 'Easy', 50),
  make('cheese-sauce-pasta-bake', 'Tuna Pasta Bake', 'British', 'dinner', ['family', 'budget', 'batch', 'high-protein'], 'Easy', 45),
  make('sausage-casserole', 'Slow Cooker Sausage Casserole', 'British', 'dinner', ['slow-cooker', 'family', 'budget', 'freezer'], 'Easy', 300),
  make('chicken-casserole', 'Slow Cooker Chicken Casserole', 'British', 'dinner', ['slow-cooker', 'family', 'comfort', 'freezer'], 'Easy', 300),
  make('one-pot-jambalaya', 'One-Pot Jambalaya', 'American', 'dinner', ['one-pot', 'high-protein', 'family'], 'Medium', 50),
  make('chicken-pilau', 'Chicken Pilau', 'Indian', 'dinner', ['one-pot', 'family', 'high-protein'], 'Medium', 50),

  /* Desserts */
  make('banoffee-pie', 'Banoffee Pie', 'British', 'dinner', ['dessert', 'celebration', 'no-bake'], 'Medium', 40),
  make('lemon-tart', 'Lemon Tart', 'French', 'dinner', ['dessert', 'celebration', 'vegetarian'], 'Medium', 70),
  make('chocolate-tart', 'Chocolate Tart', 'French', 'dinner', ['dessert', 'celebration', 'vegetarian'], 'Medium', 60),
  make('creme-brulee', 'Crème Brûlée', 'French', 'dinner', ['dessert', 'date-night', 'celebration'], 'Medium', 60),
  make('rice-pudding', 'Creamy Rice Pudding', 'British', 'dinner', ['dessert', 'comfort', 'budget', 'vegetarian'], 'Easy', 90),
  make('bread-butter-pudding', 'Bread and Butter Pudding', 'British', 'dinner', ['dessert', 'comfort', 'budget', 'vegetarian'], 'Easy', 60),
  make('flapjacks', 'Golden Syrup Flapjacks', 'British', 'dinner', ['dessert', 'vegetarian', 'budget', 'baking'], 'Easy', 35),
  make('shortbread', 'Classic Shortbread', 'Scottish', 'dinner', ['dessert', 'vegetarian', 'baking', 'celebration'], 'Easy', 45),
  make('scones', 'Cheese Scones', 'British', 'dinner', ['vegetarian', 'baking', 'budget', 'quick'], 'Easy', 30),
  make('apple-pie', 'Homemade Apple Pie', 'British', 'dinner', ['dessert', 'vegetarian', 'celebration', 'baking'], 'Medium', 80),
];
