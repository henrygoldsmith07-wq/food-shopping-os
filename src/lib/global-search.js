const normalise = (value) => String(value || '').trim().toLowerCase();

export const GLOBAL_COMMANDS = [
  ['home', 'Open Home', 'Go to your dashboard'],
  ['plan', 'Open meal plan', 'Weekly and monthly planning'],
  ['log', 'Open food diary', 'Log and review food'],
  ['shop', 'Open shopping list', 'Lists, shops and prices'],
  ['recipes', 'Open recipes', 'Browse and filter recipes'],
  ['profile', 'Open Profile', 'Goals, reports and settings'],
  ['pantry', 'Open pantry', 'Fridge, freezer and cupboards'],
  ['add-food', 'Add food', 'Search, scan, photograph or speak'],
  ['barcode', 'Scan a barcode', 'Open barcode capture'],
  ['assistant', 'Ask Forq', 'Open Guidance and ask a question'],
  ['undo', 'Undo last action', 'Revert the most recent saved change'],
];

const command = ([id, title, subtitle]) => ({
  id: `command-${id}`, type: 'command', title, subtitle, target: id,
});

/**
 * Which module a destination belongs to, so that search cannot offer a route
 * into a screen the current product modes have taken off the bar. The records
 * behind it are untouched — turn the module back on and they are all findable
 * again.
 */
const MODULE_OF = {
  plan: 'plan',
  log: 'log',
  shop: 'shop',
  recipes: 'recipes',
  pantry: 'pantry',
  'add-food': 'log',
  barcode: 'log',
  food: 'log',
  recipe: 'recipes',
  shopping: 'shop',
};

const reachable = (app, key) => {
  const module = MODULE_OF[key];
  return !module || !app.moduleOn || app.moduleOn(module);
};

const resource = (type, item, subtitle) => ({
  id: `${type}-${item.id}`, type, title: item.name, subtitle, item,
});

const score = (result, query) => {
  const title = normalise(result.title);
  const detail = normalise(result.subtitle);
  if (!query) return 0;
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 60;
  if (detail.includes(query)) return 30;
  return 0;
};

export const buildGlobalResults = (app = {}, text = '', { type = 'all', sort = 'relevance' } = {}) => {
  const query = normalise(text);
  const commands = GLOBAL_COMMANDS.filter(([id]) => reachable(app, id)).map(command);
  if (query && reachable(app, 'add-food')) {
    commands.push({
      id: `command-add-query-${query}`,
      type: 'command',
      title: `Add “${text.trim()}” to food diary`,
      subtitle: 'Open food search with this query',
      target: 'add-food',
      query: text.trim(),
    });
  }

  const recipeIds = new Set((app.safeRecipes || []).map((item) => item.id));
  const recipes = [...(app.safeRecipes || []), ...(app.myRecipes || []).filter((item) => !recipeIds.has(item.id))];
  const resources = [
    ...(app.catalogue || []).map((item) => resource('food', item, [item.brand, 'Food'].filter(Boolean).join(' · '))),
    ...recipes.map((item) => resource('recipe', item, 'Recipe')),
    ...(app.pantry || []).map((item) => resource('pantry', item, [item.location, item.cat].filter(Boolean).join(' · '))),
    ...(app.shoppingList || []).map((item) => resource('shopping', item, item.aisle || 'Shopping list')),
  ].filter((item) => reachable(app, item.type));

  let results = query
    ? [...commands, ...resources].map((result) => ({ ...result, score: score(result, query) })).filter((result) => result.score)
    : (type === 'all' ? commands : [...commands, ...resources]).map((result) => ({ ...result, score: 0 }));
  if (type !== 'all') results = results.filter((result) => result.type === type);
  return results.sort(sort === 'name'
    ? (a, b) => a.title.localeCompare(b.title)
    : (a, b) => b.score - a.score || a.title.localeCompare(b.title));
};
