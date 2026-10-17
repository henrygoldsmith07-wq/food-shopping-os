import {
  Cake, CakeSlice, Coffee, CookingPot, Croissant, CupSoda, Dessert, Donut,
  Drumstick, EggFried, Fish, Flame, IceCreamBowl, Pizza, Salad, Sandwich, Soup,
  UtensilsCrossed, Vegan,
} from 'lucide-react';
import { recipeIconFamily } from '../data/recipe-images.js';
import { recipeIconKey } from '../data/food-icon-keys.js';
import { FOOD_ICON } from './food-icons.jsx';

const FAMILY_ICON = {
  breakfast: Coffee,
  pancakes: Cake,
  eggs: EggFried,
  frittata: EggFried,
  shakshuka: CookingPot,
  overnight: IceCreamBowl,
  porridge: Soup,
  smoothie: CupSoda,
  curry: Soup,
  chilli: Flame,
  soup: Soup,
  stew: CookingPot,
  noodles: Soup,
  stirfry: CookingPot,
  pasta: UtensilsCrossed,
  pizza: Pizza,
  salad: Salad,
  couscous: Vegan,
  bibimbap: Salad,
  sandwich: Sandwich,
  bagel: Donut,
  tacos: Sandwich,
  salmon: Fish,
  tuna: Fish,
  roast: Drumstick,
  roastveg: Vegan,
  brownie: CakeSlice,
  crumble: Dessert,
};

export const recipeGlyphFor = (recipe) => {
  const family = recipeIconFamily(recipe);
  return { family, Icon: FOOD_ICON[recipeIconKey(recipe, family)] || FAMILY_ICON[family] || Croissant };
};

/** A recipe's icon at a given size, for list rows. */
export const RecipeGlyph = ({ recipe, size = 18, strokeWidth = 1.8, className, style }) => {
  const { Icon } = recipeGlyphFor(recipe);
  return <Icon size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden="true" />;
};
