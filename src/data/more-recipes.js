import { estimateRecipe } from './recipe-estimate.js';

const recipe = (id, name, cuisine, meal, tags, difficulty = 'Easy', time = 30) => {
  const { dietTags, ...estimated } = estimateRecipe(name);
  return {
    id: `more-recipe-${id}`, name, title: name, emoji: meal === 'breakfast' ? '🍳' : '🍲', cuisine, meal,
    tags: [...new Set([cuisine.toLowerCase(), ...tags.filter((t) => !['vegan', 'vegetarian', 'meat', 'fish'].includes(t)), ...dietTags])],
    time, prep: Math.min(15, time), difficulty,
    servings: 4,
    nutritionStatus: 'estimated-from-ingredients',
    ...estimated,
    discoverable: true,
  };
};

export const MORE_RECIPES = [
  recipe('full-english', 'Full English Breakfast', 'British', 'breakfast', ['breakfast', 'comfort', 'family'], 'Medium', 35),
  recipe('breakfast-hash', 'Sausage and Potato Breakfast Hash', 'British', 'breakfast', ['breakfast', 'one-pot', 'budget'], 'Easy', 30),
  recipe('breakfast-bagel', 'Smoked Salmon and Cream Cheese Bagel', 'British', 'breakfast', ['breakfast', 'quick', 'high-protein'], 'Easy', 10),
  recipe('tomato-basil-pasta', 'Tomato and Basil Pasta', 'Italian', 'dinner', ['quick', 'vegetarian', 'budget'], 'Easy', 25),
  recipe('tuna-pasta-bake', 'Tuna Pasta Bake', 'British', 'dinner', ['family', 'comfort', 'batch', 'freezer'], 'Medium', 50),
  recipe('chicken-pie', 'Chicken and Leek Pie', 'British', 'dinner', ['comfort', 'family'], 'Medium', 70),
  recipe('sausage-traybake', 'Sausage and Root Vegetable Traybake', 'British', 'dinner', ['one-pot', 'family', 'budget'], 'Easy', 50),
  recipe('fish-pie', 'Creamy Fish Pie', 'British', 'dinner', ['comfort', 'family', 'batch', 'freezer'], 'Medium', 65),
  recipe('turkey-chilli', 'Turkey and Bean Chilli', 'Mexican', 'dinner', ['batch', 'freezer', 'high-protein', 'budget'], 'Easy', 45),
  recipe('prawn-linguine', 'Chilli Garlic Prawn Linguine', 'Italian', 'dinner', ['quick', 'date-night', 'high-protein'], 'Medium', 25),
  recipe('beef-burrito-bowl', 'Beef Burrito Bowl', 'Mexican', 'dinner', ['quick', 'high-protein', 'family'], 'Easy', 30),
  recipe('vegetable-enchiladas', 'Roasted Vegetable Enchiladas', 'Mexican', 'dinner', ['vegetarian', 'batch', 'freezer'], 'Medium', 55),
  recipe('dal-makhani', 'Dal Makhani', 'Indian', 'dinner', ['vegan', 'vegetarian', 'one-pot', 'batch', 'budget'], 'Medium', 70),
  recipe('aloo-gobi', 'Aloo Gobi', 'Indian', 'dinner', ['vegan', 'vegetarian', 'budget', 'one-pot'], 'Easy', 40),
  recipe('chicken-biryani', 'Chicken Biryani', 'Indian', 'dinner', ['family', 'batch', 'high-protein'], 'Hard', 90),
  recipe('thai-noodle-soup', 'Thai Coconut Noodle Soup', 'Thai', 'dinner', ['quick', 'one-pot'], 'Medium', 30),
  recipe('beef-bulgogi', 'Beef Bulgogi Rice Bowls', 'Korean', 'dinner', ['quick', 'high-protein'], 'Medium', 30),
  recipe('vegetable-chow-mein', 'Vegetable Chow Mein', 'Chinese', 'dinner', ['vegan', 'vegetarian', 'quick'], 'Easy', 25),
  recipe('salmon-poke', 'Salmon Poke Bowls', 'Japanese', 'dinner', ['healthy', 'high-protein', 'quick'], 'Medium', 25),
  recipe('greek-chicken', 'Greek Lemon Chicken with Orzo', 'Greek', 'dinner', ['family', 'high-protein', 'one-pot'], 'Medium', 45),
  recipe('falafel-flatbreads', 'Falafel Flatbreads with Hummus', 'Middle Eastern', 'lunch', ['vegan', 'vegetarian', 'quick', 'budget'], 'Easy', 25),
  recipe('mushroom-stroganoff', 'Creamy Mushroom Stroganoff', 'British', 'dinner', ['vegetarian', 'comfort', 'quick'], 'Easy', 30),
  recipe('lentil-shepherds-pie', "Lentil Shepherd's Pie", 'British', 'dinner', ['vegan', 'vegetarian', 'batch', 'freezer', 'comfort'], 'Medium', 75),
  recipe('air-fryer-salmon', 'Air Fryer Salmon with Greens', 'British', 'dinner', ['air-fryer', 'healthy', 'high-protein', 'quick'], 'Easy', 20),
  recipe('slow-cooker-pulled-pork', 'Slow Cooker Pulled Pork', 'American', 'dinner', ['slow-cooker', 'batch', 'freezer', 'comfort'], 'Easy', 480),
  recipe('leftover-roast-hash', 'Leftover Roast Potato Hash', 'British', 'dinner', ['leftovers', 'budget', 'quick', 'one-pot'], 'Easy', 20),
  recipe('apple-crumble', 'Classic Apple Crumble', 'British', 'dinner', ['dessert', 'comfort', 'family'], 'Easy', 50),
  recipe('lemon-cheesecake', 'No-Bake Lemon Cheesecake', 'British', 'dinner', ['dessert', 'celebration'], 'Medium', 240),
];
