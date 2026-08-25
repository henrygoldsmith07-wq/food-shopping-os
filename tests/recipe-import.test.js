import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSource, isFetchableRecipeUrl, materialIsUsable, oEmbedEndpoint, readOEmbed,
  readPageMetadata, sourceMaterial, sourcePlatform,
} from '../src/server/recipe-source.js';
import {
  draftToRecipeText, extractJsonObject, parseRecipeDraft, MAX_INGREDIENTS, RECIPE_SYSTEM,
} from '../src/server/recipe-extract.js';
import {
  importFromLink, importFromPhoto, provenanceFrom, sourceAttribution,
} from '../src/lib/recipe-import.js';

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const htmlRes = (body, status = 200) => new Response(body, {
  status, headers: { 'content-type': 'text/html' },
});

describe('which links we are willing to fetch', () => {
  it('recognises the video platforms and treats everything else as the web', () => {
    expect(sourcePlatform('https://www.tiktok.com/@cook/video/123').id).toBe('tiktok');
    expect(sourcePlatform('https://youtu.be/abc').id).toBe('youtube');
    expect(sourcePlatform('https://www.instagram.com/reel/abc/').id).toBe('instagram');
    expect(sourcePlatform('https://bbcgoodfood.com/recipes/x').id).toBe('web');
    expect(sourcePlatform('not a url')).toBeNull();
  });

  it('refuses anything pointing back at the machine or its private network', () => {
    expect(isFetchableRecipeUrl('https://bbcgoodfood.com/recipes/x')).toBe(true);
    for (const blocked of [
      'http://localhost/admin',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://172.16.4.2/',
      'http://box.internal/',
      'file:///etc/passwd',
      'https://user:pass@example.com/',
      'https://nodothost/',
    ]) {
      expect(isFetchableRecipeUrl(blocked), blocked).toBe(false);
    }
  });

  it('only offers an oEmbed endpoint where one can actually be called', () => {
    expect(oEmbedEndpoint('https://www.tiktok.com/@a/video/1', {})).toContain('tiktok.com/oembed');
    expect(oEmbedEndpoint('https://youtu.be/abc', {})).toContain('youtube.com/oembed');
    // Instagram's needs an app token; without one we do not pretend.
    expect(oEmbedEndpoint('https://instagram.com/reel/x/', {})).toBeNull();
    expect(oEmbedEndpoint('https://instagram.com/reel/x/', { INSTAGRAM_OEMBED_TOKEN: 't' }))
      .toContain('instagram_oembed');
    expect(oEmbedEndpoint('https://bbcgoodfood.com/x', {})).toBeNull();
  });
});

describe('reading what a page says about itself', () => {
  const page = `<html><head>
    <title>Ignore me</title>
    <meta property="og:title" content="One-pan lemon chicken" />
    <meta property="og:description" content="Chicken thighs, lemon &amp; thyme in one tin." />
    <meta property="og:site_name" content="Test Kitchen" />
    <meta name="author" content="Ana Cook" />
  </head><body></body></html>`;

  it('prefers the Open Graph title over the tab title, and decodes entities', () => {
    const metadata = readPageMetadata(page);
    expect(metadata.title).toBe('One-pan lemon chicken');
    expect(metadata.description).toBe('Chicken thighs, lemon & thyme in one tin.');
    expect(metadata.author).toBe('Ana Cook');
    expect(metadata.siteName).toBe('Test Kitchen');
  });

  it('falls back to the tab title when there is no Open Graph', () => {
    expect(readPageMetadata('<html><head><title>Nan’s scones</title></head></html>').title)
      .toBe('Nan’s scones');
  });

  it('reads a caption and author out of an oEmbed payload', () => {
    const read = readOEmbed({ title: '3 ingredient pasta &amp; peas', author_name: 'chef.ana' });
    expect(read.caption).toBe('3 ingredient pasta & peas');
    expect(read.author).toBe('chef.ana');
  });

  it('leaves empty fields out of the material, and calls a thin page thin', () => {
    const thin = sourceMaterial({ url: 'https://x.test/a', metadata: { title: 'Dinner' } });
    expect(thin).not.toContain('Description:');
    expect(materialIsUsable(thin)).toBe(false);

    const full = sourceMaterial({
      url: 'https://x.test/a',
      metadata: readPageMetadata(page),
      oembed: readOEmbed({ title: 'Two chicken thighs, a lemon, thyme, roasted for forty minutes' }),
    });
    expect(full).toContain('Video caption:');
    expect(materialIsUsable(full)).toBe(true);
  });
});

describe('fetching a source', () => {
  it('brings back the page and the caption together', async () => {
    const fetchImpl = vi.fn(async (url) => (String(url).includes('oembed')
      ? jsonRes({ title: 'caption text', author_name: 'chef' })
      : htmlRes('<html><head><title>t</title></head></html>')));
    const out = await fetchSource('https://www.tiktok.com/@a/video/1', { fetchImpl, env: {} });
    expect(out.html).toContain('<title>t</title>');
    expect(out.oembed.caption).toBe('caption text');
    expect(out.errors).toEqual([]);
  });

  it('reports a failure rather than throwing it at the caller', async () => {
    const fetchImpl = vi.fn(async () => htmlRes('nope', 404));
    const out = await fetchSource('https://www.tiktok.com/@a/video/1', { fetchImpl, env: {} });
    expect(out.html).toBe('');
    expect(out.errors).toContain('page 404');
    expect(out.errors).toContain('caption 404');
  });
});

describe('reading a model’s answer', () => {
  it('tells the model not to invent quantities', () => {
    expect(RECIPE_SYSTEM).toMatch(/Never add an ingredient, a quantity/);
    expect(RECIPE_SYSTEM).toMatch(/Do not guess/);
  });

  it('finds the JSON object inside fences, apologies and trailing chatter', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a":{"b":2}} Hope that helps.')).toEqual({ a: { b: 2 } });
    expect(extractJsonObject('{"a":"a } brace in a string"}')).toEqual({ a: 'a } brace in a string' });
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('{ broken')).toBeNull();
  });

  it('reads a draft, clipping it to sane limits', () => {
    const draft = parseRecipeDraft(JSON.stringify({
      title: '  Lemon chicken  ',
      servings: '4',
      time: 40,
      ingredients: ['4 chicken thighs', '1 lemon', '', 'x'],
      steps: [{ text: 'Roast for 40 minutes.' }],
      notes: 'From a video caption',
    }));
    expect(draft.title).toBe('Lemon chicken');
    expect(draft.servings).toBe(4);
    expect(draft.time).toBe(40);
    expect(draft.ingredients).toEqual(['4 chicken thighs', '1 lemon']);
    expect(draft.steps).toEqual(['Roast for 40 minutes.']);
  });

  it('returns nothing at all rather than an empty-shelled recipe', () => {
    expect(parseRecipeDraft(JSON.stringify({ title: '', ingredients: [] }))).toBeNull();
    expect(parseRecipeDraft(JSON.stringify({ title: 'Dinner', ingredients: [] }))).toBeNull();
    expect(parseRecipeDraft('the page had no recipe on it')).toBeNull();
  });

  it('keeps an unstated serving count at zero rather than guessing four', () => {
    const draft = parseRecipeDraft(JSON.stringify({
      title: 'Pasta', servings: 0, ingredients: ['pasta', 'peas'],
    }));
    expect(draft.servings).toBe(0);
    expect(draftToRecipeText(draft)).not.toMatch(/Serves/);
  });

  it('caps a runaway ingredient list', () => {
    const draft = parseRecipeDraft(JSON.stringify({
      title: 'Everything', ingredients: Array.from({ length: 200 }, (_, i) => `item ${i}`),
    }));
    expect(draft.ingredients).toHaveLength(MAX_INGREDIENTS);
  });

  it('lays a draft back out as the text the paste importer already parses', () => {
    const text = draftToRecipeText({
      title: 'Lemon chicken',
      servings: 4,
      ingredients: ['4 chicken thighs', '1 lemon'],
      steps: ['Roast for 40 minutes.'],
    });
    expect(text.split('\n')).toEqual([
      'Lemon chicken', 'Serves 4', '4 chicken thighs', '1 lemon', 'Method', 'Roast for 40 minutes.',
    ]);
  });
});

describe('the browser half', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sends a link to the app’s own route and returns what it read', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({
      draft: null,
      text: 'Lemon chicken\nServes 4\n4 chicken thighs',
      source: { url: 'https://x.test/a', platform: 'web', read: 'schema.org', via: 'link' },
    }));
    const out = await importFromLink('https://x.test/a', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('/api/recipes/import', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ url: 'https://x.test/a' });
    expect(out.text).toContain('4 chicken thighs');
  });

  it('turns a rejected link into the message the route gave', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ error: 'That link has no recipe text on it.' }, 422));
    await expect(importFromLink('https://x.test/a', { fetchImpl })).rejects.toThrow(/no recipe text/);
    await expect(importFromLink('nonsense', { fetchImpl })).rejects.toThrow(/recipe link/);
  });

  it('reads a photo on the device when the browser can, and sends only the words', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ text: 'x', source: { read: 'ocr' } }));
    await importFromPhoto({ name: 'page.jpg' }, {
      fetchImpl,
      support: () => ({ imageText: true }),
      readText: async () => 'Scones\nServes 8\n350 g self-raising flour',
      toDataUrl: async () => 'data:image/jpeg;base64,zz',
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text).toContain('self-raising flour');
    expect(body.image).toBeUndefined();
  });

  it('sends the picture itself only when there is no recogniser to use', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ text: 'x', source: { read: 'vision' } }));
    await importFromPhoto({ name: 'page.jpg' }, {
      fetchImpl,
      support: () => ({ imageText: false }),
      readText: async () => { throw new Error('should not be called'); },
      toDataUrl: async () => 'data:image/jpeg;base64,zz',
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.image).toBe('data:image/jpeg;base64,zz');
    expect(body.text).toBeUndefined();
  });

  it('falls back to the picture when the recogniser is there but finds nothing', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ text: 'x', source: { read: 'vision' } }));
    await importFromPhoto({ name: 'page.jpg' }, {
      fetchImpl,
      support: () => ({ imageText: true }),
      readText: async () => { throw new Error('No text was found in that picture.'); },
      toDataUrl: async () => 'data:image/jpeg;base64,zz',
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).image).toBe('data:image/jpeg;base64,zz');
  });
});

describe('crediting where a recipe came from', () => {
  it('says which platform, who wrote it, and how it was read', () => {
    const attribution = sourceAttribution({
      url: 'https://www.tiktok.com/@ana/video/1',
      platform: 'tiktok',
      platformLabel: 'TikTok',
      via: 'link',
      read: 'caption',
      author: 'chef.ana',
      model: 'some/model:free',
    });
    expect(attribution.line).toBe('From TikTok by chef.ana · from the video caption');
    expect(attribution.isVideo).toBe(true);
    expect(attribution.exact).toBe(false);
  });

  it('marks a recipe read from the page’s own data as exact', () => {
    const attribution = sourceAttribution({ url: 'https://x.test/a', platform: 'web', platformLabel: 'x.test', read: 'schema.org' });
    expect(attribution.exact).toBe(true);
    expect(attribution.line).toContain('from the page’s own recipe data');
  });

  it('never claims a photo import came from a website', () => {
    const attribution = sourceAttribution({ platform: 'photo', via: 'photo', read: 'ocr' });
    expect(attribution.url).toBeNull();
    expect(attribution.line).toBe('From a photo · read off your photo on this device');
  });

  it('stores the attribution on the recipe’s provenance', () => {
    const provenance = provenanceFrom({
      url: 'https://youtu.be/x', platform: 'youtube', platformLabel: 'YouTube',
      read: 'caption', via: 'link', author: 'Ana', model: 'm:free',
    });
    expect(provenance).toMatchObject({
      author: 'Ana', platform: 'youtube', via: 'link', read: 'caption', model: 'm:free',
    });
    expect(provenance.attribution).toContain('YouTube');
  });
});
