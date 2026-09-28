/**
 * The one place Forq's screens are written down.
 *
 * Navigation used to be described in four places that had to agree: the tab
 * bar, the command palette, the keyboard shortcuts, and the product-mode
 * config. They drifted — the palette knew about screens the bar didn't, and a
 * mode could order tabs that didn't exist. So the registry below is the single
 * statement, and everything else reads it.
 *
 * The hierarchy, in the order the core loop runs:
 *
 *   Week → List → Plan → Cook → Recipes
 *
 * `bar: true` is the five-tab hierarchy. Log and Learn are `contextual`: real
 * screens a person needs, reachable from a flow, the palette, the keyboard and
 * the week, but not permanent residents of the bar. That is the whole reason
 * they are in this file rather than in the tab bar — a screen without a bar
 * slot is a deliberate product decision, and it should be readable as one.
 */

import {
  CalendarDays, ChefHat, ClipboardList, CookingPot, Home, ShoppingCart, UtensilsCrossed,
} from 'lucide-react';

/**
 * Every screen Forq can show.
 *
 *  - `id`        stable across releases; routes, deep links and stored prefs.
 *  - `label`     the bottom-bar / palette name. One label, one place.
 *  - `title`     the screen's own heading.
 *  - `bar`       in the five-tab hierarchy.
 *  - `icon`      the bar and palette glyph.
 *  - `hint`      what this screen is for, for the palette and the tour.
 */
export const SCREENS = [
  {
    id: 'home',
    label: 'Week',
    title: 'This week',
    hint: 'What to do next, what\'s for dinner, what to buy',
    bar: true,
    Icon: Home,
  },
  {
    id: 'shop',
    label: 'List',
    title: 'Shopping list',
    hint: 'One list from the plan',
    bar: true,
    Icon: ShoppingCart,
  },
  {
    id: 'plan',
    label: 'Plan',
    title: 'Meal planner',
    hint: 'Choose meals for the week',
    bar: true,
    Icon: CalendarDays,
  },
  {
    id: 'cook',
    label: 'Cook',
    title: 'Cook',
    hint: 'Make the next meal',
    bar: true,
    Icon: UtensilsCrossed,
  },
  {
    id: 'recipes',
    label: 'Recipes',
    title: 'Recipes',
    hint: 'Everything you can cook',
    bar: true,
    Icon: ChefHat,
  },
  {
    // Contextual: the diary is where nutrition mode actually lives, so it gets
    // a bar slot there (see `moduleFor`), and everywhere else it is one tap
    // from a flow, the palette or the keyboard.
    id: 'log',
    label: 'Log',
    title: 'Food diary',
    hint: 'Log what you ate',
    bar: false,
    Icon: ClipboardList,
  },
  {
    id: 'learn',
    label: 'Learn',
    title: 'Learn',
    hint: 'What Forq worked out from what happened',
    bar: false,
    Icon: CookingPot,
  },
];

/** The five-tab hierarchy, in order. The one list the bar is built from. */
export const BAR_TABS = SCREENS.filter((screen) => screen.bar);

export const screenById = Object.fromEntries(SCREENS.map((screen) => [screen.id, screen]));

/** The label for a screen id, falling back to the id rather than to undefined. */
export const labelFor = (id) => screenById[id]?.label || id;

/** The heading for a screen id. */
export const titleFor = (id) => screenById[id]?.title || labelFor(id);

/**
 * Which product mode owns a screen, so a mode can take it off the bar without
 * deleting it. Mirrors the module→tab mapping in `data/modes.js`; a screen no
 * mode claims is never hidden.
 */
export const MODULE_FOR_SCREEN = {
  home: 'home',
  plan: 'plan',
  shop: 'shop',
  recipes: 'recipes',
  log: 'log',
  cook: 'plan',
  learn: 'progress',
};

/**
 * Order the bar for a mode.
 *
 * The bar is always the same *size* — five destinations. A mode may reorder
 * them, and it may name a contextual screen (nutrition's diary) to promote it
 * into the hierarchy, but a promotion takes a slot rather than adding one. Any
 * bar screen a mode didn't have room for is dropped from the end, which is the
 * whole point of "Log and Learn are contextual": a mode can change what Forq
 * leads with without the bar ever growing.
 *
 * A mode that names nothing gets the five-tab hierarchy unchanged.
 */
export const orderBarFor = (preferred = []) => {
  const named = preferred.filter((id) => screenById[id]);
  const rest = BAR_TABS.filter((screen) => !named.includes(screen.id));
  return [...named.map((id) => screenById[id]), ...rest].slice(0, BAR_TABS.length);
};

/**
 * The five-screen hierarchy, with a mode's contextual screens promoted into
 * it. This is what the bar renders and what `visibleTabs` filters.
 */
export const barIdsFor = (preferred = []) => orderBarFor(preferred).map((screen) => screen.id);
