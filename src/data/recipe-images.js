/**
 * High-definition recipe icons.
 *
 * Recipe cards use deterministic inline SVG rather than stock photography or
 * a remote image service. The icon is crisp at any size, works offline, and
 * uses the same monochrome surfaces as the Le Studio UI. Dish families get a
 * recognisable silhouette without decorative colour or embedded card copy.
 */

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const recipeText = (recipe = {}) => [
  recipe.name,
  recipe.cuisine,
  recipe.meal,
  ...(recipe.tags || []),
  ...(recipe.ingredients || []).map((item) => item?.name || item),
].join(' ').toLowerCase();

const heroIngredients = (recipe = {}) => (recipe.ingredients || [])
  .map((item) => (typeof item === 'string' ? item : item?.name))
  .filter((name) => typeof name === 'string' && name.trim())
  .slice(0, 3)
  .map((name) => name.trim().toLowerCase());

const iconKey = (recipe = {}) => {
  const text = recipeText(recipe);

  if (/shakshuka|poached egg|tomato.*egg/.test(text)) return 'shakshuka';
  if (/smoothie bowl|smoothie/.test(text)) return 'smoothie';
  if (/overnight oat/.test(text)) return 'overnight';
  if (/porridge|oatmeal/.test(text)) return 'porridge';
  if (/pancake|waffle|crumpet/.test(text)) return 'pancakes';
  if (/bagel/.test(text)) return 'bagel';
  if (/egg[s]? .*toast|egg[s]? .*wholemeal/.test(text)) return 'eggs';
  if (/omelette|omelet|frittata|quiche/.test(text)) return 'frittata';
  if (/yogurt bowl|yoghurt bowl/.test(text)) return 'overnight';
  if (/bibimbap/.test(text)) return 'bibimbap';
  if (/salmon/.test(text)) return 'salmon';
  if (/tuna.*salad|salad.*tuna/.test(text)) return 'tuna';
  if (/pho/.test(text)) return 'noodles';
  if (/couscous|quinoa bowl|grain bowl/.test(text)) return 'couscous';
  if (/pasta|spaghetti|linguine|penne|lasagne|lasagna|risotto/.test(text)) return 'pasta';
  if (/stir[- ]?fry/.test(text)) return 'stirfry';
  if (/brownie/.test(text)) return 'brownie';
  if (/crumble|cobbler/.test(text)) return 'crumble';
  if (/soup/.test(text)) return 'soup';
  if (/curry|korma|dal|dahl|tikka|masala/.test(text)) return 'curry';
  if (/chilli|chili/.test(text)) return 'chilli';
  if (/paella|tagine/.test(text)) return 'couscous';
  if (/stew|casserole|jerk/.test(text)) return 'stew';
  if (/salad/.test(text)) return 'salad';
  if (/jacket potato/.test(text)) return 'roastveg';
  if (/traybake|roast/.test(text)) return /chicken|turkey|pork|lamb/.test(text) ? 'roast' : 'roastveg';
  if (/pizza/.test(text)) return 'pizza';
  if (/taco|fajita|burrito|quesadilla/.test(text)) return 'tacos';
  if (/sandwich|wrap|burger|toastie|halloumi/.test(text)) return 'sandwich';
  if (/ramen|noodle/.test(text)) return 'noodles';
  if (recipe.meal === 'breakfast') return 'breakfast';
  if (recipe.meal === 'lunch') return 'salad';
  if (recipe.meal === 'dinner') return 'roast';
  return 'default';
};

export const recipeIconFamily = iconKey;

const THEME_TOKENS = {
  light: { background: '#F4F4F4', ink: '#131313' },
  dark: { background: '#0B0B0B', ink: '#F4F4F4' },
};

const resolvePalette = (theme = 'light') => THEME_TOKENS[theme === 'dark' ? 'dark' : 'light'];

const FAMILY_LABELS = {
  breakfast: 'BREAKFAST', pancakes: 'PANCAKES', eggs: 'EGGS ON TOAST', frittata: 'BAKED EGGS',
  shakshuka: 'SHAKSHUKA', overnight: 'OVERNIGHT OATS', porridge: 'PORRIDGE', smoothie: 'SMOOTHIE BOWL',
  curry: 'CURRY', chilli: 'CHILLI', soup: 'SOUP', stew: 'STEW', noodles: 'NOODLES', stirfry: 'STIR-FRY',
  pasta: 'PASTA', pizza: 'PIZZA', salad: 'SALAD', couscous: 'GRAIN BOWL', bibimbap: 'BIBIMBAP',
  sandwich: 'SANDWICH', bagel: 'BAGEL', tacos: 'TACOS', salmon: 'SALMON', tuna: 'TUNA',
  roast: 'ROAST', roastveg: 'ROASTED VEG', brownie: 'BROWNIE', crumble: 'CRUMBLE',
};

const lineIcon = (palette, body) => `<g fill="none" stroke="${palette.ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
const bowl = '<path d="M342 310H682"/><path d="M362 312Q382 490 512 518Q642 490 662 312"/>';

const renderMotif = (key, palette) => {
  if (['soup', 'curry', 'chilli', 'stew'].includes(key)) {
    return lineIcon(palette, `${bowl}<path d="M430 252Q408 214 430 180M512 242Q490 204 512 170M594 252Q572 214 594 180"/>`);
  }
  if (['porridge', 'overnight', 'smoothie', 'salad', 'couscous', 'bibimbap'].includes(key)) {
    return lineIcon(palette, `${bowl}<path d="M430 360H594"/><circle cx="410" cy="350" r="8" fill="${palette.ink}" stroke="none"/><circle cx="614" cy="350" r="8" fill="${palette.ink}" stroke="none"/>`);
  }
  if (['noodles', 'stirfry'].includes(key)) {
    return lineIcon(palette, `${bowl}<path d="M420 250V370M512 250V370M604 250V370"/>`);
  }
  if (key === 'pasta') {
    return lineIcon(palette, '<circle cx="512" cy="350" r="170"/><path d="M420 350Q460 270 512 350T604 350Q560 430 512 350T420 350"/>');
  }
  if (key === 'bagel') {
    return lineIcon(palette, '<ellipse cx="512" cy="350" rx="180" ry="120"/><ellipse cx="512" cy="350" rx="62" ry="42"/>');
  }
  if (key === 'sandwich') {
    return lineIcon(palette, '<path d="M340 440L512 230L684 440Z"/><path d="M390 380H634"/>');
  }
  if (key === 'tacos') {
    return lineIcon(palette, '<path d="M340 430Q390 240 440 430M462 430Q512 240 562 430M584 430Q634 240 684 430"/>');
  }
  if (key === 'pizza') {
    return lineIcon(palette, `<path d="M392 460L512 220L632 460Z"/><path d="M416 412H608"/><circle cx="490" cy="350" r="9" fill="${palette.ink}" stroke="none"/><circle cx="550" cy="390" r="9" fill="${palette.ink}" stroke="none"/>`);
  }
  if (['salmon', 'tuna'].includes(key)) {
    return lineIcon(palette, `<path d="M350 350Q470 230 620 350L690 285V415L620 350Q470 470 350 350Z"/><circle cx="590" cy="330" r="8" fill="${palette.ink}" stroke="none"/>`);
  }
  if (['roast', 'roastveg'].includes(key)) {
    return lineIcon(palette, '<rect x="330" y="250" width="364" height="220" rx="30"/><ellipse cx="440" cy="360" rx="62" ry="42"/><ellipse cx="584" cy="360" rx="62" ry="42"/>');
  }
  if (['brownie', 'crumble'].includes(key)) {
    return lineIcon(palette, '<rect x="390" y="240" width="244" height="230" rx="24"/><path d="M430 325H594M430 390H594"/>');
  }
  if (['eggs', 'frittata', 'shakshuka'].includes(key)) {
    return lineIcon(palette, `<ellipse cx="430" cy="340" rx="92" ry="72"/><circle cx="430" cy="340" r="22" fill="${palette.ink}" stroke="none"/><ellipse cx="594" cy="380" rx="92" ry="72"/><circle cx="594" cy="380" r="22" fill="${palette.ink}" stroke="none"/>`);
  }
  if (['breakfast', 'pancakes'].includes(key)) {
    return lineIcon(palette, '<ellipse cx="512" cy="400" rx="160" ry="52"/><path d="M376 344Q512 420 648 344M400 290Q512 352 624 290"/>');
  }
  return lineIcon(palette, '<circle cx="512" cy="350" r="150"/><path d="M320 230V470M290 230V310Q320 342 350 310V230M704 230V470M704 230Q790 300 704 370"/>');
};

const ICON_CACHE = new Map();

const iconCacheKey = (recipe = {}, theme = 'light') => [
  theme,
  recipe.id,
  recipe.name,
  recipe.meal,
  recipe.cuisine,
  ...(recipe.ingredients || []).map((item) => (typeof item === 'string' ? item : item?.name)),
].join('|');

/** Render the recipe as an inline SVG data URI; no photo files or network calls are needed. */
export const recipeIconImage = (recipe = {}, options = {}) => {
  const theme = options?.theme === 'dark' ? 'dark' : 'light';
  const cacheKey = iconCacheKey(recipe, theme);
  const cached = ICON_CACHE.get(cacheKey);
  if (cached) return cached;

  const name = String(recipe.name || 'Recipe').trim() || 'Recipe';
  const key = iconKey(recipe);
  const palette = resolvePalette(theme);
  const label = FAMILY_LABELS[key] || 'RECIPE ICON';
  const ingredients = heroIngredients(recipe).join(', ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="680" viewBox="0 0 1024 680" role="img" aria-label="${escapeXml(name)} recipe icon" data-family="${escapeXml(label)}"><title>${escapeXml(name)}${ingredients ? ` — ${escapeXml(ingredients)}` : ''}</title><rect width="1024" height="680" rx="42" fill="${palette.background}"/>${renderMotif(key, palette)}</svg>`;
  const icon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  if (ICON_CACHE.size >= 2048) ICON_CACHE.delete(ICON_CACHE.keys().next().value);
  ICON_CACHE.set(cacheKey, icon);
  return icon;
};

/** Compatibility names for callers that only need the recipe artwork. */
export const recipeImage = recipeIconImage;
export const recipeFallbackImage = recipeIconImage;
