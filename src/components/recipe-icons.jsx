import {
  Cake, CakeSlice, Coffee, CookingPot, Croissant, CupSoda, Dessert, Donut,
  Drumstick, EggFried, Fish, Flame, IceCreamBowl, Pizza, Salad, Sandwich, Soup,
  UtensilsCrossed, Vegan,
} from 'lucide-react';
import { recipeIconFamily } from '../data/recipe-images.js';
import { useFoodIcons } from './food-icon-loader.js';

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

/** A recipe's family and icon; pass the loaded food icon set to sharpen it. */
export const recipeGlyphFor = (recipe, food = null) => {
  const family = recipeIconFamily(recipe);
  const sharp = food ? food.FOOD_ICON[food.recipeIconKey(recipe, family)] : null;
  return { family, Icon: sharp || FAMILY_ICON[family] || Croissant };
};

/** A recipe's icon at a given size, for list rows. */
export const RecipeGlyph = ({ recipe, size = 18, strokeWidth = 1.8, className, style }) => {
  const { Icon } = recipeGlyphFor(recipe, useFoodIcons());
  return <Icon size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden="true" />;
};
