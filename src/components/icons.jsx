import {
  Baby, Banana, Bean, Banknote, Cake, CalendarDays, Camera, Carrot, ChefHat, Cherry,
  Citrus, CloudRain, Container, Croissant, Droplet, Droplets, Drumstick,
  Dumbbell, Egg, EggFried, Fish, Flame, Globe, Grape, Heart, IceCreamCone, LeafyGreen,
  Mic, Milk, Nut, Package, Recycle, Salad, Sandwich, Scale, ShoppingCart, Snowflake,
  Soup, SprayCan, Sprout, Square, Trophy, Utensils, UtensilsCrossed, Watch, Wheat, Wine,
} from 'lucide-react';

/**
 * Data files keep their `emoji` field as a stable key; the UI renders it as a
 * monochrome stroke icon through this map. Duplicates are fine — identity
 * always comes from the adjacent label, never the glyph alone.
 */
const EMOJI_ICON = {
  // dishes
  '🍗': Drumstick, '🍛': Soup, '🍣': Fish, '🌶️': Flame, '🫐': Grape, '🌮': Sandwich,
  '🍄': Sprout, '🍝': UtensilsCrossed, '🥗': Salad, '🥡': Package, '🍳': EggFried,
  '🍱': UtensilsCrossed, '🥞': Cake, '🍜': Soup, '🥣': Soup,
  // groceries
  '🥛': Milk, '🍦': IceCreamCone, '🥚': Egg, '🧀': Milk, '🥬': LeafyGreen, '🍅': Cherry,
  '🟢': Bean, '🍚': Wheat, '🥫': Package, '🥥': Nut, '🫒': Droplets, '🍶': Wine,
  '🫙': Container, '🌾': Wheat, '💪': Dumbbell, '💧': Droplet, '🍷': Wine,
  '🍞': Croissant, '🍌': Banana, '🍋': Citrus, '🫑': Bean, '🫚': Sprout, '🐟': Fish,
  '⬜': Square, '🥦': Salad, '🧴': SprayCan, '🥕': Carrot, '🍓': Cherry,
  // misc data glyphs (badges, integrations, suggestions, community)
  '🔥': Flame, '💷': Banknote, '♻️': Recycle, '🌍': Globe, '🧊': Snowflake,
  '🌱': Sprout, '👨‍🍳': ChefHat, '🧑‍🍳': ChefHat, '🌦️': CloudRain, '👧': Baby,
  '🛒': ShoppingCart, '⌚': Watch, '🗓️': CalendarDays, '🗣️': Mic, '⚖️': Scale,
  '🏆': Trophy, '📸': Camera, '💚': Heart,
};

/** Render a data glyph (emoji key) as a lucide icon. */
export const Glyph = ({ e, size = 18, strokeWidth = 1.8, className, style }) => {
  const C = EMOJI_ICON[e] || Utensils;
  return <C size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden="true" />;
};
