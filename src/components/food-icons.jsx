import {
  Apple, Baby, Banana, Bean, Beef, Beer, Cake, Candy, Cherry, Citrus, Coffee, Cookie,
  CookingPot, Croissant, CupSoda, Donut, Drumstick, Egg, Fish, GlassWater, Grape, Ham,
  Hamburger, IceCreamCone, Leaf, LeafyGreen, Martini, Milk, Nut, Package, PawPrint, Sandwich,
  Shell, Shrimp, Snowflake, Soup, SprayCan, Sprout, Wine, Carrot,
} from 'lucide-react';
import * as Art from './food-icon-art.jsx';
import { foodIconKey, EMOJI_FOOD_KEY } from '../data/food-icon-keys.js';

/** Food icon keys (see data/food-icon-keys.js) to icon components. */
export const FOOD_ICON = {
  onion: Art.Onion, garlic: Art.Garlic, potato: Art.Potato, tomato: Art.Tomato, chilli: Art.Chilli,
  pepper: Art.Pepper, mushroom: Art.Mushroom, broccoli: Art.Broccoli, avocado: Art.Avocado,
  lemon: Art.Lemon, corn: Art.Corn, peas: Art.Peas, aubergine: Art.Aubergine, cucumber: Art.Cucumber,
  squash: Art.Squash, leek: Art.Leek, pear: Art.Pear, strawberry: Art.Strawberry, cheese: Art.Cheese,
  butter: Art.Butter, yoghurt: Art.Yoghurt, bread: Art.Bread, toast: Art.Toast, bagel: Art.Bagel,
  rice: Art.RiceBowl, curry: Art.Curry, pasta: Art.Pasta, noodles: Art.NoodleBowl,
  porridge: Art.PorridgeBowl, grains: Art.GrainBowl, wok: Art.Wok, traybake: Art.Traybake,
  pancakes: Art.Pancakes, taco: Art.Taco, wrap: Art.Wrap, tin: Art.Tin, bottle: Art.Bottle,
  jar: Art.Jar, carton: Art.Carton, bag: Art.Bag, cereal: Art.CerealBox, salt: Art.Salt,
  bacon: Art.Bacon, sausage: Art.Sausage, tofu: Art.Tofu, chocolate: Art.Chocolate,
  crisps: Art.Crisps, toiletRoll: Art.ToiletRoll,
  apple: Apple, banana: Banana, bean: Bean, beef: Beef, beer: Beer, cake: Cake, candy: Candy,
  carrot: Carrot, cherry: Cherry, citrus: Citrus, coffee: Coffee, cookie: Cookie, croissant: Croissant,
  soda: CupSoda, donut: Donut, drumstick: Drumstick, egg: Egg, fish: Fish, water: GlassWater,
  grape: Grape, ham: Ham, burger: Hamburger, iceCream: IceCreamCone, herb: Leaf, leafy: LeafyGreen,
  spirits: Martini, milk: Milk, nut: Nut, package: Package, paw: PawPrint, sandwich: Sandwich,
  shell: Shell, shrimp: Shrimp, frozen: Snowflake, soup: Soup, spray: SprayCan, sprout: Sprout,
  wine: Wine, baby: Baby, pot: CookingPot, dumpling: Soup,
};

/**
 * The icon for a food: from its name when the name reads clearly, else from
 * its catalogue emoji, else null (callers pick their own fallback).
 */
export const foodIconFor = (name, emoji) =>
  FOOD_ICON[foodIconKey(name)] || FOOD_ICON[EMOJI_FOOD_KEY[emoji]] || null;
