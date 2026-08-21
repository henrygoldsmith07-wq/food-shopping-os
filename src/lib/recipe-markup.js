const cleanRecipeMarkup = (value) => String(value || '')
  .replace(/<\/(?:p|li|div|br|h[1-6])\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/(?:&#39;|&apos;)/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => {
    const point = Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  })
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n');

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const findRecipeJsonLd = (markup) => {
  const raw = String(markup || '').trim();
  if (!raw) return null;
  const candidates = [];
  if (/^[\[{]/.test(raw)) candidates.push(raw);
  for (const match of raw.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    candidates.push(match[1].replace(/^\s*<!--[\s\S]*?-->/, '').trim());
  }

  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    const types = asList(value['@type']).map((type) => String(type).toLowerCase());
    if (types.some((type) => type === 'recipe' || type.endsWith('/recipe')) && value.name && value.recipeIngredient) {
      return value;
    }
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'subjectOf']) {
      const found = visit(value[key]);
      if (found) return found;
    }
    return null;
  };

  for (const candidate of candidates) {
    try {
      const found = visit(JSON.parse(candidate));
      if (found) return found;
    } catch {
      // A page can contain malformed JSON-LD alongside valid scripts; keep looking.
    }
  }
  return null;
};

const instructionLines = (value) => asList(value).flatMap((entry) => {
  if (typeof entry === 'string') return cleanRecipeMarkup(entry).split('\n');
  if (!entry || typeof entry !== 'object') return [];
  if (entry.itemListElement) return instructionLines(entry.itemListElement);
  if (entry.text) return cleanRecipeMarkup(entry.text).split('\n');
  return [];
}).filter((line) => line.length > 0 && line.length < 400);

/** Convert pasted schema.org Recipe JSON-LD or page source to importable text. */
export const recipeTextFromMarkup = (markup) => {
  const recipe = findRecipeJsonLd(markup);
  if (!recipe) return null;
  const title = cleanRecipeMarkup(recipe.name).split('\n')[0].slice(0, 80);
  const ingredients = asList(recipe.recipeIngredient)
    .map(cleanRecipeMarkup)
    .filter((line) => line.length >= 2 && line.length < 160)
    .slice(0, 60);
  if (!title || !ingredients.length) return null;
  const yieldText = cleanRecipeMarkup(asList(recipe.recipeYield)[0] || '');
  const instructions = instructionLines(recipe.recipeInstructions).slice(0, 60);
  return {
    format: 'schema.org',
    name: title,
    text: [title, yieldText, ...ingredients, ...(instructions.length ? ['Method', ...instructions] : '')]
      .filter(Boolean)
      .join('\n'),
    // Provenance read off the page's own structured data, so the import keeps
    // who wrote it and when it was published — the two facts that let a user
    // judge whether the recipe is current and from a source they trust.
    provenance: {
      author: cleanRecipeMarkup(asList(recipe.author)[0]?.name || asList(recipe.author)[0] || '').slice(0, 80) || null,
      datePublished: /^\d{4}(-\d{2})?(-\d{2})?$/.test(String(recipe.datePublished || '')) ? String(recipe.datePublished) : null,
      yield: yieldText || null,
    },
  };
};
