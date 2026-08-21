import {
  Cake, CakeSlice, Coffee, CookingPot, Croissant, CupSoda, Dessert, Donut,
  Drumstick, EggFried, Fish, Flame, IceCreamBowl, Pizza, Salad, Sandwich, Soup,
  UtensilsCrossed, Vegan,
} from 'lucide-react';
import { recipeIconFamily } from '../data/recipe-images.js';

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
  return { family, Icon: FAMILY_ICON[family] || Croissant };
};
